"""Cycle de vie unique, opérations sérialisées et état de lecture pour les écrans."""

import asyncio
import contextlib
import copy
import logging
import time
from pathlib import Path

from .controller import Controller, ControllerError, STALE_SECONDS

LOGGER = logging.getLogger(__name__)
MEASUREMENTS = ("speed_kmh", "incline_pct", "distance_m", "elapsed_s", "heart_rate_bpm", "energy_kcal")


class DeviceRuntime:
    def __init__(self, data_dir: Path, simulation: bool, instance_id: str):
        self.controller = Controller(data_dir / "device", simulation=simulation, read_only=True)
        self.instance_id = instance_id
        self.sequence = 0
        self.error = None
        self.operation = None
        self.operation_lock = asyncio.Lock()
        self.subscribers = set()
        self.task = None
        self.last_phase = "disconnected"
        self.execution = None

    async def start(self):
        await self.controller.start()
        self.task = asyncio.create_task(self._broadcast())

    def snapshot(self):
        controller = self.controller
        now = time.monotonic()
        measurements = {}
        for key in MEASUREMENTS:
            value = controller.telemetry.get(key)
            received = controller.received_at.get(key)
            age = round(max(0, now - received), 1) if received is not None else None
            quality = "absent" if value is None or received is None else "stale" if now - received > STALE_SECONDS else "fresh"
            measurements[key] = {"value": value, "age_s": age, "quality": quality}
        phase = controller.phase
        if self.operation == "disconnect":
            phase = "disconnecting"
        elif self.operation in ("scan", "connect") and phase == "disconnected":
            phase = "scanning" if self.operation == "scan" else "connecting"
        return copy.deepcopy({
            "mode": "simulation" if controller.simulation else "reel", "read_only": controller.read_only,
            "control_active": bool(self.execution and self.execution.phase in
                                   ("starting", "running", "transitioning", "adjusting", "pausing", "paused", "stopping")),
            "phase": phase, "device_name": controller.device_name,
            "devices": [row for row in controller.device_rows if row["candidate"]],
            "capabilities": controller.capabilities, "capability_errors": controller.capability_errors,
            "measurements": measurements, "stale_after_s": STALE_SECONDS,
            "error": self.error or ("Journal du tapis indisponible. Vérifier l'accès au dossier de données." if controller.audit_error else None),
        })

    def event(self, kind="state"):
        return {"type": kind, "instance_id": self.instance_id, "sequence": self.sequence, "state": self.snapshot()}

    def publish(self):
        phase = self.controller.phase
        if self.last_phase == "connected" and phase == "disconnected" and self.operation != "disconnect":
            self.error = "Connexion Bluetooth perdue. Rechercher puis reconnecter le tapis."
        self.last_phase = phase
        self.sequence += 1
        event = self.event()
        for queue in self.subscribers:
            # Écrans lents : conserver l'état le plus récent, sans bloquer le Bluetooth.
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(event)

    async def _broadcast(self):
        while True:
            await asyncio.sleep(1)
            self.publish()

    async def perform(self, operation: str, address: str | None = None):
        if self.execution and self.execution.phase in ("countdown", "starting", "running", "transitioning", "adjusting", "pausing", "paused", "stopping"):
            raise ControllerError("Une séance est en cours. Demandez son arrêt dans Direct avant de déconnecter le tapis.")
        if self.operation_lock.locked():
            raise ControllerError("Une opération est déjà en cours. Attendre sa fin.")
        async with self.operation_lock:
            self.operation = operation
            self.error = None
            self.publish()
            try:
                async with asyncio.timeout(65):
                    if operation == "scan":
                        await self.controller.scan()
                    elif operation == "connect":
                        await self.controller.connect(address)
                    else:
                        await self.controller.disconnect()
            except ControllerError as exc:
                self.error = str(exc)[:200]
                raise
            except TimeoutError as exc:
                self.error = "Délai Bluetooth dépassé. Vérifier le tapis et le Bluetooth du PC."
                LOGGER.exception("Délai de l'opération tapis dépassé : %s", operation)
                raise ControllerError(self.error) from exc
            except Exception as exc:
                self.error = "Opération Bluetooth impossible. Vérifier le tapis et le Bluetooth du PC."
                LOGGER.exception("Opération tapis impossible : %s", operation)
                raise ControllerError(self.error) from exc
            finally:
                if operation == "disconnect":
                    self.last_phase = self.controller.phase
                self.operation = None
                self.publish()
        return self.event("snapshot")

    def subscribe(self):
        queue = asyncio.Queue(maxsize=2)
        self.subscribers.add(queue)
        queue.put_nowait(self.event("snapshot"))
        return queue

    async def close(self):
        if self.task:
            self.task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.task
        await self.controller.close()
