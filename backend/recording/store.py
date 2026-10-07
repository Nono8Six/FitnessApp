"""Journal borné en mémoire, transactions par lots sur un thread de stockage.

Le callback FTMS ne fait que copier et enfiler. Une transaction confirmée
avance le repère durable ; les entrées en vol restent en file en cas d'échec.
"""
import asyncio
import copy
import logging
import time
from collections import deque
from itertools import islice

from sqlalchemy import insert, select

from ..storage.models import RecordedEntry, RecordedSession
from ..training.profiles import utc_now
from .metrics import VERSION

LOGGER = logging.getLogger(__name__)
BUFFER_LIMIT = 8192
BATCH_LIMIT = 1024


def recover(session):
    for row in session.scalars(select(RecordedSession).where(RecordedSession.closed_at.is_(None))):
        at = utc_now()
        row.checkpoint = {**row.checkpoint, "phase": "interrupted", "stop_confirmed": False,
                          "reason": "Processus interrompu · arrêt du tapis non confirmé"}
        row.closed_at = at
        row.persisted_seq += 1
        session.add(RecordedEntry(session_id=row.id, seq=row.persisted_seq, at=at,
                                 t=row.checkpoint.get("wall_s", 0), kind="interruption", source="pc",
                                 data={"label": "Processus interrompu", "stop_confirmed": False}))


class Recorder:
    def __init__(self, engine):
        self.engine = engine
        self.database = engine.database
        self.queue = deque()
        self.seq = 0
        self.session_id = None
        self.persisted_seq = 0
        self.persisted_at = None
        self.persisted_s = 0
        self.lost = 0
        self.error = None
        self.task = None
        self.lock = asyncio.Lock()
        self.last_phase = None
        self.last_command = None
        self.closed = False
        self.finalized = False
        self.checkpoint = {}
        self.stopping = asyncio.Event()

    async def begin(self):
        await self.flush()
        if self.queue or (self.error and not self.finalized):
            raise RuntimeError("Le précédent enregistrement reste en attente. Vérifiez le stockage avant une nouvelle séance.")
        e = self.engine
        checkpoint = self.capture()
        at = utc_now()
        def create():
            with self.database.write() as session:
                session.add(RecordedSession(id=e.id, profile_id=e.profile["id"], mode=checkpoint["mode"],
                    started_at=e.started_at, profile_snapshot=copy.deepcopy(e.profile),
                    workout_snapshot=copy.deepcopy(e.workout), calculation_version=VERSION, checkpoint=checkpoint,
                    persisted_at=at, persisted_seq=0, lost_entries=0))
        await asyncio.to_thread(create)
        self.session_id = e.id
        self.seq = self.persisted_seq = self.lost = 0
        self.error = None
        self.persisted_s = 0
        self.persisted_at = at
        self.last_phase = self.last_command = None
        self.closed = self.finalized = False
        self.checkpoint = checkpoint
        self.add("preparation", {"label": "Départ confirmé", "capabilities": e.controller.capabilities,
                                 "limits": e.limits, "targets": e.targets})

    def capture(self):
        e = self.engine
        return {"phase": "interrupted" if e.recovered else e.phase,
                "mode": "simulation" if e.controller.simulation else "reel",
                "active_s": round(e.active_time(), 2), "pause_s": round(e.pause_time(), 2),
                "wall_s": round((e.ended or time.monotonic()) - e.began, 2),
                "block_index": e.block, "targets": copy.deepcopy(e.targets),
                "reason": e.reason, "error": e.error, "stop_confirmed": e.stop_confirmed}

    def add(self, kind, data, *, source="pc", at=None):
        if not self.session_id or self.finalized:
            return
        self.seq += 1
        if len(self.queue) >= BUFFER_LIMIT:
            self.lost += 1
            self.error = "Stockage saturé · des données ne sont pas conservées."
            return
        self.queue.append({"session_id": self.session_id, "seq": self.seq, "at": at or utc_now(),
                           "t": round(max(0, time.monotonic() - self.engine.began), 3),
                           "kind": kind, "source": source, "data": copy.deepcopy(data),
                           "_checkpoint": self.capture()})

    def device_event(self, event):
        if not self.session_id or self.finalized or self.closed:
            return
        source = "simulation" if self.engine.controller.simulation else "ftms"
        values = event.get("values", {})
        self.add("measurement" if event["level"] == "data" else "device", {
            **event, "quality": {k: "absent" if v is None else "fresh" for k, v in values.items()}},
            source=source, at=event["time"])

    def update(self):
        if not self.session_id or self.finalized:
            return
        e = self.engine
        if not self.closed:
            self.checkpoint = self.capture()
        if e.phase != self.last_phase:
            self.add("phase", {"label": e.phase, "active_s": round(e.active_time(), 3),
                "block_index": e.block, "targets": e.targets, "reason": e.reason,
                "stop_confirmed": e.stop_confirmed})
            self.last_phase = e.phase
        if e.controller.last_command != self.last_command:
            self.last_command = copy.deepcopy(e.controller.last_command)
            if self.last_command:
                self.add("command_result", self.last_command)
        self.closed = e.phase in {"completed", "stopped", "cancelled"}
        if self.error and e.phase in {"running", "starting", "transitioning", "adjusting", "paused"}:
            e.request_halt("Enregistrement indisponible · arrêt demandé")

    def status(self):
        return {"status": "error" if self.error or self.lost else "saved" if self.finalized else "recording",
                "error": self.error, "persisted_at": self.persisted_at, "persisted_s": self.persisted_s,
                "pending": len(self.queue), "lost_entries": self.lost}

    async def flush(self):
        async with self.lock:
            if not self.session_id or self.finalized:
                return
            batch = list(islice(self.queue, BATCH_LIMIT))
            # Ne publier le checkpoint récent qu'une fois tous ses événements écrits.
            caught_up = len(batch) == len(self.queue)
            checkpoint = copy.deepcopy(self.checkpoint if caught_up else batch[-1]["_checkpoint"])
            lost = self.lost
            closed = self.closed and caught_up
            at = utc_now()
            session_id = self.session_id
            def write():
                with self.database.write() as session:
                    row = session.get(RecordedSession, session_id)
                    if row is None:
                        raise RuntimeError("Profil ou séance supprimé pendant l'enregistrement")
                    if batch:
                        session.execute(insert(RecordedEntry), [{k: v for k, v in entry.items() if k != "_checkpoint"} for entry in batch])
                        row.persisted_seq = batch[-1]["seq"]
                    if checkpoint is not None:
                        row.checkpoint = checkpoint
                    row.lost_entries = lost
                    row.persisted_at = at
                    if closed:
                        row.closed_at = at
            try:
                await asyncio.to_thread(write)
            except Exception:
                LOGGER.exception("Écriture du bilan %s impossible", session_id)
                if not self.error:
                    self.add("storage", {"label": "Échec de stockage", "persisted_s": self.persisted_s})
                self.error = "Enregistrement impossible. Vérifiez l'espace disque et l'accès aux données du PC."
                return
            for _ in batch:
                self.queue.popleft()
            if batch:
                self.persisted_seq = batch[-1]["seq"]
            self.persisted_at = at
            if checkpoint is not None:
                self.persisted_s = checkpoint["wall_s"]
            had_error = self.error
            self.error = None if not self.lost else "Enregistrement partiel · données perdues lors de la saturation."
            # Des notifications ont pu arriver pendant la transaction : les vider
            # avant d'annoncer la clôture réellement durable.
            self.finalized = closed and not self.queue and self.checkpoint == checkpoint
            if had_error and not self.error and not self.finalized:
                self.add("storage", {"label": "Stockage rétabli", "previous_error": had_error})

    async def start(self):
        async def worker():
            while not self.stopping.is_set():
                try:
                    await asyncio.wait_for(self.stopping.wait(), 1 if not self.error else 3)
                except TimeoutError:
                    pass
                await self.flush()
        self.task = asyncio.create_task(worker())

    async def close(self):
        if self.task:
            self.stopping.set()
            await self.task
        self.update()
        while self.queue:
            size = len(self.queue)
            await self.flush()
            if self.error or len(self.queue) >= size:
                break
        await self.flush()
