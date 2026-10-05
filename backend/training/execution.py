"""Une séance volatile, une horloge PC et un seul propriétaire du mouvement.

Le transport FTMS est partagé avec le diagnostic. Aucun historique métier n'est
enregistré ici ; les échantillons bornés servent uniquement au Direct courant.
"""

import asyncio
import contextlib
import copy
import logging
import math
import time
from collections import deque
from datetime import datetime, timezone
from uuid import uuid4

from ..device.controller import ControllerError, LEASE_SECONDS, STALE_SECONDS, STOP_SETTLE_SECONDS
from ..device import ftms
from . import workouts
from .profiles import get_profile

LOGGER = logging.getLogger(__name__)
TERMINAL = {"completed", "stopped", "cancelled"}
ACTIVE = {"countdown", "starting", "running", "transitioning", "pausing", "paused", "stopping", "unknown"}
# Périmètre physique reçu, distinct des plages annoncées et des limites du POC.
REAL_LIMITS = {"speed": 2.5, "incline": 1.0}
SIM_LIMITS = {"speed": 16.0, "incline": 10.0}
MAX_PAUSE_SECONDS = 900
STOP_CONFIRM_TIMEOUT = 15


class Execution:
    def __init__(self, device, database):
        self.device = device
        self.controller = device.controller
        self.database = database
        self.phase = "idle"
        self.id = None
        self.owner = None
        self.owner_seen = 0.0
        self.workout = None
        self.profile = None
        self.block = 0
        self.elapsed = 0.0
        self.active_since = None
        self.paused = 0.0
        self.pause_since = None
        self.deadline = 0.0
        self.countdown_until = 0.0
        self.began = 0.0
        self.ended = None
        self.started_at = None
        self.requested = None
        self.reason = None
        self.error = None
        self.stop_confirmed = False
        self.task = None
        self.ticker = None
        self.samples = deque(maxlen=9000)
        self.markers = deque(maxlen=256)
        self.sample_seq = 0
        self.last_sample = -1
        self.distance = 0.0
        self.distance_last = None
        self.distance_quality = "absent"
        self.distance_partial = False

    @property
    def limits(self):
        return SIM_LIMITS if self.controller.simulation else REAL_LIMITS

    def _load(self, profile_id, workout_id, version):
        with self.database.transaction() as session:
            profile = get_profile(session, profile_id)
            rows = workouts.versions(session, profile_id, workout_id)
            workout = next((w for w in rows if w["version"] == version), None)
            if workout is None:
                raise ControllerError("Cette version de séance n'existe plus. Choisissez une séance disponible.")
            return copy.deepcopy(workout), {"id": profile.id, "name": profile.name}

    def _compatible(self, workout):
        c = self.controller
        if c.phase != "connected":
            raise ControllerError("Connectez le tapis dans Réglages > Tapis, puis revenez à cette séance.")
        if not all(c.capabilities.get(key) for key in ("control_point", "speed_target", "incline_target", "treadmill_data")):
            raise ControllerError("Les capacités nécessaires ne sont pas disponibles. Reconnectez le tapis.")
        for b in workout["blocks"]:
            for action, value in (("speed", b["speed"]), ("incline", b["incline"])):
                try:
                    ftms.validate_target(value, c.capabilities.get(f"{action}_range"), self.limits[action],
                                         scale=100 if action == "speed" else 10)
                except ValueError as exc:
                    unit = "km/h" if action == "speed" else "%"
                    noun = "vitesse" if action == "speed" else "pente"
                    raise ControllerError(f"Bloc {b['index'] + 1} : {noun} {value:g} {unit} incompatible. "
                                          f"Limite {self.limits[action]:g} {unit} et pas du tapis à respecter.") from exc

    def _ready_at_rest(self, workout):
        if self.device.operation_lock.locked():
            raise ControllerError("Attendez la fin de l’opération du tapis avant de démarrer.")
        self._compatible(workout)
        c = self.controller
        if c.desynchronized or c.audit_error:
            raise ControllerError("Utilisez le STOP physique, puis déconnectez et reconnectez le tapis.")
        self._fresh()
        c._ensure_restart_ready()
        if c.telemetry["speed_kmh"] != 0:
            raise ControllerError("La bande doit être arrêtée avant de démarrer. Utilisez la console du tapis.")
        if not 0 <= c.telemetry["incline_pct"] <= self.limits["incline"]:
            raise ControllerError("Ramenez la pente dans le périmètre autorisé avec la console du tapis.")

    def _fresh(self):
        c = self.controller
        if c.phase != "connected":
            raise ControllerError("Tapis déconnecté. État de la bande inconnu : utilisez le STOP physique.")
        now = time.monotonic()
        for key in ("speed_kmh", "incline_pct"):
            if c.telemetry.get(key) is None or now - c.received_at.get(key, 0) > STALE_SECONDS:
                raise ControllerError("Mesures anciennes ou absentes. Attendez de nouvelles mesures du tapis.")

    def prepare(self, profile_id, workout_id, version):
        workout, profile = self._load(profile_id, workout_id, version)
        issue = None
        try:
            if self.phase in ACTIVE:
                raise ControllerError("Une séance est déjà en cours. Retrouvez-la dans Direct.")
            self._ready_at_rest(workout)
        except ControllerError as exc:
            issue = str(exc)
        return {"workout": workout, "profile": profile, "ready": issue is None,
                "issue": issue, "mode": "simulation" if self.controller.simulation else "reel", "limits": self.limits}

    async def start(self, viewer, profile_id, workout_id, version):
        if self.phase in ACTIVE or (self.task and not self.task.done()):
            raise ControllerError("Une séance est déjà en cours. Retrouvez-la dans Direct.")
        workout, profile = self._load(profile_id, workout_id, version)
        self._ready_at_rest(workout)
        now = time.monotonic()
        self.id = uuid4().hex
        self.owner = viewer
        self.owner_seen = now
        self.workout, self.profile = workout, profile
        self.block = 0
        self.elapsed = self.paused = self.distance = 0.0
        self.active_since = self.pause_since = None
        self.requested = self.reason = self.error = None
        self.stop_confirmed = False
        self.samples.clear()
        self.markers.clear()
        self.sample_seq = 0
        self.last_sample = -1
        self.distance_last = None
        self.distance_quality = "absent"
        self.distance_partial = False
        self.began = now
        self.ended = None
        self.started_at = datetime.now(timezone.utc).isoformat()
        # Durée du programme + transitions bornées + 15 min de pause cumulée.
        # Deadline absolue : ni une lecture ni un heartbeat ne la prolongent.
        self.deadline = now + workout["summary"]["sec"] + 30 * len(workout["blocks"]) + MAX_PAUSE_SECONDS + 15
        self.countdown_until = now + 3
        self.phase = "countdown"
        self.task = asyncio.create_task(self._run())

    def heartbeat(self, viewer):
        if viewer == self.owner and self.phase in ACTIVE:
            self.owner_seen = time.monotonic()
            if self.controller.owner == viewer:
                self.controller.owner_heartbeat = self.owner_seen

    def active_time(self):
        return min(self.workout["summary"]["sec"] if self.workout else 0,
                   self.elapsed + (time.monotonic() - self.active_since if self.active_since is not None else 0))

    def pause_time(self):
        return self.paused + (time.monotonic() - self.pause_since if self.pause_since is not None else 0)

    def _freeze(self):
        self.elapsed = self.active_time()
        self.active_since = None

    def request_halt(self, reason="Arrêt demandé", *, pause=False):
        if self.phase == "idle" or self.phase in TERMINAL:
            return
        if self.phase == "unknown":
            raise ControllerError("État de la bande inconnu. Utilisez le STOP physique, puis reconnectez le tapis.")
        if self.phase == "stopping" or (self.phase == "pausing" and pause):
            return
        if self.phase == "countdown":
            self.requested = "cancel"
            self.phase = "cancelled"
            self.ended = time.monotonic()
            self.reason = "Démarrage annulé · aucune commande de mouvement envoyée"
            return
        self._freeze()
        self.requested = "pause" if pause else "stop"
        self.reason = reason
        self.phase = "pausing" if pause else "stopping"
        # Bloque immédiatement les étapes moteur suivantes ; l'échange envoyé
        # garde son attente de réponse. Aucune annulation de tâche Bluetooth.
        self.controller.armed_until = 0

    async def resume(self, viewer):
        if viewer != self.owner:
            raise ControllerError("La reprise doit être confirmée sur l'écran qui a démarré la séance.")
        if self.phase != "paused":
            raise ControllerError("Attendez la confirmation de la pause avant de reprendre.")
        self._ready_at_rest(self.workout)
        if time.monotonic() >= self.deadline or self.pause_time() >= MAX_PAUSE_SECONDS:
            raise ControllerError("Autorisation de séance expirée. Arrêtez cette séance avant d'en commencer une nouvelle.")
        self.owner_seen = time.monotonic()
        self.requested = "resume"
        self.stop_confirmed = False
        self.phase = "starting"

    def _alive(self, *, rest=False):
        now = time.monotonic()
        if now - self.owner_seen > LEASE_SECONDS:
            raise ControllerError("Écran propriétaire absent : arrêt demandé.")
        if now >= self.deadline or self.pause_time() >= MAX_PAUSE_SECONDS:
            raise ControllerError("Autorisation de séance expirée : arrêt demandé.")
        self._fresh()
        if self.controller.desynchronized:
            raise ControllerError("Résultat de commande inconnu. Utilisez le STOP physique, puis reconnectez.")
        if not rest:
            if not self.controller.control_acquired:
                raise ControllerError("Le tapis a retiré le contrôle. État de la bande à vérifier sur la console.")
            if self.controller.armed_until == 0:
                raise ControllerError("Le tapis a signalé un arrêt. Aucune reprise automatique.")
            self.controller._ensure_ready(self.owner)

    async def _exchange(self, action, value=None):
        if self.requested in ("stop", "pause", "cancel"):
            return False
        self._alive()
        await self.controller._exchange(action, value)
        if action in ("speed", "incline"):
            self.controller.targets["speed_kmh" if action == "speed" else "incline_pct"] = value
        return self.requested not in ("stop", "pause", "cancel")

    async def _observe(self, since, predicate, timeout=15):
        end = time.monotonic() + timeout
        while not self.requested:
            self._alive()
            c = self.controller
            if c.received_at.get("speed_kmh", 0) > since and c.received_at.get("incline_pct", 0) > since and predicate():
                if c.last_command:
                    c.last_command["status"] = "observed"
                return True
            if time.monotonic() >= end:
                raise ControllerError("L'effet de la commande n'a pas été observé. Arrêt demandé.")
            await asyncio.sleep(.1)
        return False

    async def _target(self):
        b = self.workout["blocks"][self.block]
        since = time.monotonic()
        if not await self._exchange("incline", b["incline"]):
            return False
        if not await self._exchange("speed", b["speed"]):
            return False
        c = self.controller
        return await self._observe(since, lambda: abs(c.telemetry["speed_kmh"] - b["speed"]) <= .05
                                   and abs(c.telemetry["incline_pct"] - b["incline"]) <= .1)

    async def _launch(self):
        self._alive(rest=True)
        self._ready_at_rest(self.workout)
        await self.controller.prepare_session_control(self.limits)
        if self.requested:
            return
        await self.controller.arm_session(self.owner, self.deadline)
        if self.requested:
            return
        minimum = self.controller.capabilities["speed_range"]["min"]
        if not await self._exchange("speed", minimum):
            return
        since = time.monotonic()
        if not await self._exchange("start"):
            return
        if not await self._observe(since, lambda: self.controller.telemetry["speed_kmh"] > 0, timeout=5):
            return
        if await self._target():
            if self.pause_since is not None:
                self.paused = self.pause_time()
                self.pause_since = None
            self.active_since = time.monotonic()
            self.phase = "running"
            self.error = None

    async def _halt(self, pause):
        self._freeze()
        self.phase = "pausing" if pause else "stopping"
        self.stop_confirmed = False
        try:
            c = self.controller
            if c.phase != "connected" or not c.control_acquired or c.desynchronized:
                raise ControllerError("Arrêt non confirmé. Utilisez le STOP physique, puis reconnectez le tapis.")
            since = time.monotonic()
            await c.halt(self.reason or "Arrêt demandé", pause=pause)
            # Réponse positive ET zéro plus récent ET fenêtre sans état tardif.
            deadline = time.monotonic() + STOP_CONFIRM_TIMEOUT
            while True:
                self._fresh()
                if c.desynchronized:
                    raise ControllerError("Résultat de l'arrêt inconnu. Utilisez le STOP physique.")
                quiet = max(since + STOP_SETTLE_SECONDS, c.restart_after)
                if time.monotonic() >= quiet and c.telemetry.get("speed_kmh") == 0 and c.received_at.get("speed_kmh", 0) > quiet:
                    break
                if time.monotonic() >= deadline:
                    raise ControllerError("L'arrêt de la bande n'a pas été confirmé. Utilisez le STOP physique.")
                await asyncio.sleep(.1)
            c.last_command["status"] = "observed"
            if pause and self.requested == "stop":
                await self._halt(False)
                return
            self.stop_confirmed = True
            self.markers.append({"t": round(time.monotonic() - self.began, 2), "label": "Pause" if pause else "Arrêt"})
            if pause and self.requested != "stop":
                self.phase = "paused"
                self.pause_since = time.monotonic()
                self.requested = None
            else:
                self.paused = self.pause_time()
                self.pause_since = None
                self.phase = "completed" if self.elapsed >= self.workout["summary"]["sec"] else "stopped"
                self.ended = time.monotonic()
                self._sample(final=True)
                self.requested = None
                self.owner = None
        except Exception as exc:
            self._unknown(str(exc))

    def _unknown(self, message):
        self._freeze()
        self.phase = "unknown"
        self.paused = self.pause_time()
        self.pause_since = None
        self.ended = time.monotonic()
        self._sample(final=True)
        self.stop_confirmed = False
        self.error = message
        self.requested = None
        self.controller.armed_until = 0
        self.controller.owner = None
        LOGGER.warning("Séance %s, état inconnu : %s", self.id, message)

    async def _run(self):
        try:
            while time.monotonic() < self.countdown_until and not self.requested:
                self._alive(rest=True)
                await asyncio.sleep(.1)
            if self.requested == "cancel":
                return
            self.phase = "starting"
            await self._launch()
            while self.phase not in TERMINAL and self.phase != "unknown":
                if self.requested in ("stop", "pause"):
                    await self._halt(self.requested == "pause")
                elif self.requested == "resume":
                    self.requested = None
                    await self._launch()
                elif self.phase == "paused":
                    self._alive(rest=True)
                elif self.phase in ("running", "transitioning"):
                    self._alive()
                    if self.controller.telemetry["speed_kmh"] <= 0:
                        raise ControllerError("Le tapis s'est arrêté. Aucune reprise automatique.")
                    active = self.active_time()
                    if active >= self.workout["summary"]["sec"]:
                        self.request_halt("Programme terminé · arrêt demandé")
                    elif active >= self.workout["blocks"][self.block]["end"]:
                        self.block += 1
                        self.phase = "transitioning"
                        if await self._target():
                            self.phase = "running"
                await asyncio.sleep(.1)
        except asyncio.CancelledError:
            # Uniquement à la fermeture du serveur, après le STOP borné.
            raise
        except Exception as exc:
            self.error = str(exc) if isinstance(exc, ControllerError) else "Erreur de séance. Arrêt demandé."
            if not isinstance(exc, ControllerError):
                LOGGER.exception("Moteur de séance %s", self.id)
            if self.phase == "countdown":
                self.phase = "cancelled"
                self.ended = time.monotonic()
                self.reason = self.error
            else:
                self.reason = self.error
                await self._halt(False)
        finally:
            self.controller.armed_until = 0
            self.controller.owner = None

    def snapshot(self, viewer=""):
        active = self.active_time()
        c = self.controller
        return copy.deepcopy({
            "id": self.id, "phase": self.phase, "mode": "simulation" if c.simulation else "reel",
            "owned_by_me": bool(self.owner and viewer == self.owner),
            "profile": self.profile, "workout": self.workout,
            "block_index": self.block, "active_s": round(active, 2), "pause_s": round(self.pause_time(), 2),
            "wall_s": round((self.ended or time.monotonic()) - self.began, 2) if self.id else 0,
            "started_at": self.started_at,
            "countdown": max(0, math.ceil(self.countdown_until - time.monotonic())) if self.phase == "countdown" else None,
            "reason": self.reason, "error": self.error, "stop_confirmed": self.stop_confirmed,
            "restart_delay_s": max(0, math.ceil(c.restart_after - time.monotonic())),
            "authorization_remaining_s": max(0, round(self.deadline - time.monotonic())) if self.id else 0,
            "limits": self.limits, "command": c.last_command,
            "distance_m": round(self.distance, 1) if self.distance_quality != "absent" else None,
            "distance_quality": self.distance_quality,
        })

    def _sample(self, *, final=False):
        if not self.id or (not final and (self.phase in TERMINAL or self.phase == "unknown")):
            return
        now = time.monotonic()
        t = round(now - self.began, 2)
        if not final and int(t) == self.last_sample:
            return
        self.last_sample = int(t)
        c = self.controller
        fresh = lambda key: c.telemetry.get(key) if c.phase == "connected" and now - c.received_at.get(key, 0) <= STALE_SECONDS else None
        speed, incline, distance = fresh("speed_kmh"), fresh("incline_pct"), fresh("distance_m")
        if distance is None:
            self.distance_quality = "stale" if self.distance_last is not None else "absent"
        else:
            if self.distance_last is not None and self.phase in ("running", "transitioning", "pausing", "stopping"):
                delta = distance - self.distance_last
                if delta >= 0:
                    self.distance += delta
                else:
                    self.distance_partial = True
            self.distance_last = distance
            self.distance_quality = "partial" if self.distance_partial else "fresh"
        b = self.workout["blocks"][self.block]
        self.sample_seq += 1
        self.samples.append({"seq": self.sample_seq, "t": t, "active_s": round(self.active_time(), 2),
                             "speed": speed, "incline": incline, "target": b["speed"],
                             "target_incline": b["incline"], "phase": self.phase})

    async def start_runtime(self):
        async def tick():
            while True:
                self._sample()
                await asyncio.sleep(.25)
        self.ticker = asyncio.create_task(tick())

    async def recover(self):
        if self.phase != "unknown":
            raise ControllerError("Aucune récupération nécessaire.")
        c = self.controller
        # La reconnexion réinitialise le canal. La récupération ferme l'ancienne
        # séance, sans réarmer, reprendre ni envoyer une commande.
        if c.desynchronized or not c.read_only:
            raise ControllerError("Utilisez le STOP physique, puis déconnectez et reconnectez le tapis.")
        self._fresh()
        c._ensure_restart_ready()
        if c.telemetry["speed_kmh"] != 0:
            raise ControllerError("Attendez des mesures fraîches de bande arrêtée avant de clore la séance.")
        self.phase = "stopped"
        self.owner = None
        self.reason = "Séance interrompue · tapis reconnecté à l'arrêt"
        self.error = None
        self.stop_confirmed = False

    async def close(self):
        if self.phase in ACTIVE and self.phase != "unknown":
            self.request_halt("Fermeture du serveur · arrêt demandé")
        if self.task and not self.task.done():
            try:
                await asyncio.wait_for(asyncio.shield(self.task), 25)
            except TimeoutError:
                self.task.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self.task
        if self.ticker:
            self.ticker.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.ticker
