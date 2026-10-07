"""One BLE connection, one control owner, explicit acknowledgements and audit."""

import asyncio
import contextlib
import json
import logging
import math
import struct
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from bleak import BleakClient, BleakScanner

from . import ftms
from .lease import BluetoothLease

LOGGER = logging.getLogger(__name__)
STALE_SECONDS = 5
LEASE_SECONDS = 12
COMMAND_TIMEOUT = 4
START_OBSERVE_SECONDS = 5
STOP_SETTLE_SECONDS = 4
MAX_SPEED = 16.0
MAX_WORKOUT_SPEED = 4.0
MAX_INCLINE = 3.0


class ControllerError(Exception):
    pass


class Controller:
    def __init__(self, data_dir: Path, *, simulation: bool = False, read_only: bool = False):
        data_dir.mkdir(parents=True, exist_ok=True)
        name = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
        self.audit_path = data_dir / f"{'simulation' if simulation else 'ble'}-{name}.jsonl"
        self.audit_path.touch(exist_ok=False)
        self.simulation = simulation
        self.read_only = read_only
        self.bluetooth_lease = BluetoothLease()
        self.capability_errors = []
        self.client = None
        self.devices = {}
        self.device_rows = []
        self.phase = "disconnected"
        self.device_name = None
        self.capabilities = {}
        self.services = []
        self.telemetry = {}
        self.received_at = {}
        self.events = deque(maxlen=150)
        self.command_lock = asyncio.Lock()
        self.lifecycle_lock = asyncio.Lock()
        self.pending = None
        self.control_acquired = False
        self.desynchronized = False
        self.owner = None
        self.owner_heartbeat = 0.0
        self.armed_until = 0.0
        self.restart_after = 0.0
        self.watchdog_task = None
        self.simulator_task = None
        self.workout_task = None
        self.workout = {"phase": "idle"}
        self.targets = {}
        self.sim_speed = 0.0
        self.sim_incline = 0.0
        self.sim_distance = 0.0
        self.sim_elapsed = 0
        self.audit_error = None
        self.audit_buffer = deque()
        self.audit_task = None
        self.audit_stopping = asyncio.Event()
        # L'application possède sa propre autorisation bornée et son moteur.
        # Le diagnostic conserve ses limites et son watchdog de dix minutes.
        self.session_limits = None
        self.control_notifications = False
        self.last_command = None
        # Observateurs métier : copie/enfilement uniquement, aucune écriture SQL.
        self.recording_listener = None
        self.log("info", "Contrôleur prêt", mode="simulation" if simulation else "ble")

    def log(self, level: str, message: str, **details):
        event = {"time": datetime.now(timezone.utc).isoformat(), "level": level, "message": message,
                 "mode": "simulation" if self.simulation else "ble", **details}
        if self.recording_listener:
            self.recording_listener(event)
        if level != "data":
            self.events.append(event)
        if len(self.audit_buffer) >= 8192:
            self.audit_error = "Journal du tapis saturé : des événements ne sont pas conservés."
            self.armed_until = 0
        else:
            self.audit_buffer.append(event)
        if level == "error":
            LOGGER.error("%s %s", message, details)

    async def start(self):
        self.watchdog_task = asyncio.create_task(self._watchdog())
        async def audit_worker():
            while not self.audit_stopping.is_set():
                try:
                    await asyncio.wait_for(self.audit_stopping.wait(), 1)
                except TimeoutError:
                    pass
                await self._flush_audit()
        self.audit_task = asyncio.create_task(audit_worker())

    async def _flush_audit(self):
        batch = list(self.audit_buffer)
        if not batch:
            return
        def write():
            with self.audit_path.open("a", encoding="utf-8") as audit:
                audit.writelines(json.dumps(event, ensure_ascii=False) + "\n" for event in batch)
        try:
            await asyncio.to_thread(write)
        except OSError as exc:
            if not self.audit_error:
                LOGGER.exception("Journal du tapis indisponible")
            self.audit_error = f"Écriture du journal impossible : {exc}"
            self.armed_until = 0
            return
        for _ in batch:
            self.audit_buffer.popleft()

    def snapshot(self, viewer: str = "") -> dict:
        now = time.monotonic()
        if viewer and viewer == self.owner:
            self.owner_heartbeat = now
        ages = {key: round(now - timestamp, 1) for key, timestamp in self.received_at.items()}
        armed = bool(self.owner and self.armed_until > now and now - self.owner_heartbeat <= LEASE_SECONDS)
        restart_delay = math.ceil(max(0, self.restart_after - now))
        restart_ready = not restart_delay and (not self.restart_after or (
            self.telemetry.get("speed_kmh") == 0 and
            self.received_at.get("speed_kmh", 0) > self.restart_after - STOP_SETTLE_SECONDS))
        return {
            "mode": "simulation" if self.simulation else "ble", "phase": self.phase,
            "device_name": self.device_name, "devices": self.device_rows,
            "capabilities": self.capabilities, "services": self.services,
            "telemetry": self.telemetry, "ages": ages,
            "armed": armed, "owned_by_me": bool(self.owner and viewer == self.owner),
            "control_acquired": self.control_acquired, "desynchronized": self.desynchronized,
            "command_pending": self.command_lock.locked(), "targets": self.targets,
            "restart_ready": restart_ready, "restart_delay_s": restart_delay,
            "workout": self.workout, "events": list(self.events)[-40:],
            "limits": {"speed_kmh": min(MAX_SPEED, self.capabilities.get("speed_range", {}).get("max", MAX_SPEED)),
                       "incline_pct": MAX_INCLINE, "workout_speed_kmh": MAX_WORKOUT_SPEED},
            "audit_error": self.audit_error,
        }

    async def scan(self):
        if self.lifecycle_lock.locked() or self.phase != "disconnected":
            raise ControllerError("Déconnecter le tapis avant une nouvelle recherche")
        async with self.lifecycle_lock:
            self.phase = "scanning"
            self.devices = {}
            self.device_rows = []
            try:
                if self.simulation:
                    await asyncio.sleep(0.4)
                    self.device_rows = [{"name": "RUN500 — simulateur", "address": "SIMULATION",
                                         "rssi": -45, "ftms_advertised": True, "candidate": True}]
                else:
                    found = await asyncio.wait_for(BleakScanner.discover(timeout=8, return_adv=True), 15)
                    self.devices = {device.address: device for device, _ in found.values()}
                    self.device_rows = [
                        {"name": adv.local_name or device.name or "Appareil sans nom", "address": device.address,
                         "rssi": adv.rssi, "ftms_advertised": ftms.SERVICE in adv.service_uuids,
                         "candidate": ftms.SERVICE in adv.service_uuids or any(
                             text in (adv.local_name or device.name or "").upper() for text in ("DOMYOS", "RUN500", "RUN 500"))}
                        for device, adv in found.values()
                    ]
                    self.device_rows.sort(key=lambda row: (not row["candidate"], -row["rssi"]))
                self.log("info", "Recherche Bluetooth terminée", count=len(self.device_rows),
                         candidates=sum(row["candidate"] for row in self.device_rows))
            except Exception as exc:
                self.log("error", "Recherche Bluetooth impossible", detail=str(exc))
                raise ControllerError(f"Recherche impossible : {exc}. Vérifier le Bluetooth Windows et la proximité du tapis.") from exc
            finally:
                self.phase = "disconnected"
        return self.device_rows

    async def connect(self, address: str):
        if self.lifecycle_lock.locked() or self.phase != "disconnected":
            raise ControllerError("Une connexion ou une recherche est déjà en cours")
        row = next((row for row in self.device_rows if row["address"] == address), None)
        if row is None:
            raise ControllerError("Choisir un appareil découvert par la recherche Bluetooth")
        async with self.lifecycle_lock:
            self.phase = "connecting"
            self.telemetry.clear()
            self.received_at.clear()
            self.targets.clear()
            self.capabilities.clear()
            self.capability_errors = []
            self.services = []
            self.desynchronized = False
            self.control_acquired = False
            self.control_notifications = False
            if self.session_limits is not None:
                self.read_only = True
            self.session_limits = None
            self.owner = None
            try:
                if self.simulation:
                    self.capabilities = {**ftms.parse_features(struct.pack("<II", 12, 3)),
                                         "control_point": True, "treadmill_data": True,
                                         "speed_range": {"min": 0.5, "max": 16, "step": 0.1},
                                         "incline_range": {"min": 0, "max": 10, "step": 0.5}}
                    self.sim_speed = self.sim_incline = self.sim_distance = 0
                    self.sim_elapsed = 0
                    self.simulator_task = asyncio.create_task(self._simulate())
                    self._sim_notification()
                else:
                    try:
                        self.bluetooth_lease.acquire()
                    except OSError as exc:
                        raise ControllerError("Bluetooth déjà utilisé ou verrou indisponible. Déconnecter le POC ou l'autre instance de Fitness.") from exc
                    client = BleakClient(self.devices[address], disconnected_callback=self._disconnected, timeout=20)
                    self.client = client
                    await asyncio.wait_for(client.connect(), 25)
                    self.services = [{"uuid": service.uuid, "characteristics": [
                        {"uuid": char.uuid, "properties": list(char.properties)} for char in service.characteristics
                    ]} for service in client.services]
                    service = client.services.get_service(ftms.SERVICE)
                    if service is None:
                        raise ControllerError("Service FTMS absent. Le journal contient les services découverts pour diagnostiquer un éventuel protocole Domyos.")
                    chars = {char.uuid: char for char in service.characteristics}
                    self.capabilities = {"control_point": False, "treadmill_data":
                                         ftms.TREADMILL in chars and "notify" in chars[ftms.TREADMILL].properties}
                    for characteristic, key, parser in (
                        (ftms.FEATURE, "features", ftms.parse_features),
                        (ftms.SPEED_RANGE, "speed_range", ftms.parse_range),
                        (ftms.INCLINE_RANGE, "incline_range", lambda data: ftms.parse_range(data, incline=True)),
                    ):
                        if characteristic in chars:
                            try:
                                value = parser(bytes(await asyncio.wait_for(client.read_gatt_char(chars[characteristic]), 6)))
                                if key == "features":
                                    self.capabilities.update(value)
                                else:
                                    self.capabilities[key] = value
                            except Exception as exc:
                                self.log("error", "Lecture d'une capacité FTMS impossible", characteristic=characteristic, detail=str(exc))
                                self.capability_errors.append(key)
                    if ftms.TREADMILL in chars and "notify" in chars[ftms.TREADMILL].properties:
                        await asyncio.wait_for(client.start_notify(chars[ftms.TREADMILL], self._data_notification), 6)
                    if ftms.STATUS in chars and "notify" in chars[ftms.STATUS].properties:
                        await asyncio.wait_for(client.start_notify(chars[ftms.STATUS], self._status_notification), 6)
                    if ftms.CONTROL in chars:
                        props = chars[ftms.CONTROL].properties
                        if "write" in props and "indicate" in props:
                            if not self.read_only:
                                await asyncio.wait_for(client.start_notify(chars[ftms.CONTROL], self._control_notification), 6)
                                self.control_notifications = True
                            self.capabilities["control_point"] = True
                    if client.services.get_service(ftms.DOMYOS_SERVICE):
                        self.log("warning", "Service Domyos propriétaire présent : le contrôle FTMS doit être vérifié physiquement")
                    if not client.is_connected:
                        raise ControllerError("Connexion perdue pendant la découverte des services")
                self.phase = "connected"
                self.device_name = row["name"]
                self.log("info", "Connecté en lecture seule", device=self.device_name,
                         capabilities=self.capabilities, services=self.services)
            except BaseException as exc:
                self.log("error", "Connexion impossible", detail=str(exc), services=self.services)
                try:
                    await self._close_client()
                finally:
                    # Une fermeture incertaine doit laisser Déconnecter disponible.
                    still_connected = self.client is not None and self.client.is_connected
                    self.phase = "connected" if still_connected else "disconnected"
                    self.device_name = row["name"] if still_connected else None
                if isinstance(exc, asyncio.CancelledError):
                    raise
                raise ControllerError(str(exc)) from exc

    async def _close_client(self):
        if self.simulator_task:
            self.simulator_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.simulator_task
            self.simulator_task = None
        if self.client:
            client = self.client
            try:
                await asyncio.wait_for(client.disconnect(), 6)
            except Exception as exc:
                self.log("error", "Fermeture Bluetooth non confirmée", detail=str(exc))
                if client.is_connected:
                    raise ControllerError("Déconnexion Bluetooth non confirmée. Réessayer de déconnecter avant toute nouvelle connexion.") from exc
            if client.is_connected:
                raise ControllerError("Le Bluetooth reste connecté. Réessayer de déconnecter.")
            self.client = None
        self.bluetooth_lease.release()

    async def disconnect(self):
        if self.lifecycle_lock.locked():
            raise ControllerError("Attendre la fin de la connexion ou de la recherche")
        async with self.lifecycle_lock:
            if not self.read_only and self.session_limits is None:
                try:
                    await self.halt("Déconnexion demandée")
                except ControllerError:
                    # La récupération d'un canal incertain exige précisément
                    # sa fermeture ; elle ne certifie pas l'arrêt physique.
                    self.log("warning", "Déconnexion après arrêt non confirmé : vérifier le STOP physique")
            await self._close_client()
            self._disconnected(None)

    def _disconnected(self, _client):
        if _client is not None and _client is not self.client:
            return
        self.bluetooth_lease.release()
        self.phase = "disconnected"
        self.owner = None
        self.armed_until = 0
        self.control_acquired = False
        if self.pending and not self.pending[1].done():
            self.pending[1].set_exception(ControllerError("Bluetooth perdu : résultat de la commande inconnu"))
        self.log("warning", "Bluetooth déconnecté. Arrêt physique du tapis à vérifier sur la console.")

    def _data_notification(self, _char, data):
        try:
            values = ftms.parse_treadmill(bytes(data))
            now = time.monotonic()
            for key, value in values.items():
                self.telemetry[key] = value
                self.received_at[key] = now
            self.log("data", "Mesure tapis", raw=bytes(data).hex(), values=values)
        except ValueError as exc:
            self.log("error", "Télémétrie invalide", detail=str(exc), raw=bytes(data).hex())
            # Never refresh timestamps from a malformed notification.

    def _control_notification(self, _char, data):
        self.log("response", "Réponse FTMS", raw=bytes(data).hex())
        try:
            opcode, code = ftms.parse_response(bytes(data))
        except ValueError as exc:
            self.log("error", str(exc))
            return
        if self.pending and self.pending[0] == opcode and not self.pending[1].done():
            self.pending[1].set_result(code)
        else:
            self.log("warning", "Réponse FTMS sans commande correspondante", opcode=opcode)

    def _status_notification(self, _char, data):
        self.log("status", "État FTMS reçu", raw=bytes(data).hex())
        if data and data[0] == 0xFF:
            self.control_acquired = False
            self.armed_until = 0
            self.log("error", "Le tapis a retiré l'autorisation de contrôle")
        elif data and data[0] in (0x01, 0x02, 0x03):
            # Console stop, reset or safety key: never let a program restart it.
            self.armed_until = 0
            self.restart_after = time.monotonic() + STOP_SETTLE_SECONDS
            self.log("warning", "Arrêt, pause ou réinitialisation demandé sur le tapis : contrôle désarmé")

    def _ensure_restart_ready(self):
        # RUN500 can report zero speed before its final stop/pause notification.
        # Never ignore that notification: wait for a quiet window and newer zero speed.
        remaining = math.ceil(self.restart_after - time.monotonic())
        if remaining > 0:
            raise ControllerError(f"Fin de l'arrêt en cours : attendre encore {remaining} s avant de réactiver le contrôle")
        if self.restart_after and (self.telemetry.get("speed_kmh") != 0 or
                self.received_at.get("speed_kmh", 0) <= self.restart_after - STOP_SETTLE_SECONDS):
            raise ControllerError("Attendre une nouvelle mesure de vitesse nulle après l'arrêt")

    def _ensure_ready(self, owner: str):
        now = time.monotonic()
        if self.phase != "connected":
            raise ControllerError("Tapis déconnecté")
        if owner != self.owner or now >= self.armed_until or now - self.owner_heartbeat > LEASE_SECONDS:
            raise ControllerError("Activer le contrôle depuis cet écran, à proximité du tapis")
        if self.audit_error:
            raise ControllerError(self.audit_error)
        if self.desynchronized:
            raise ControllerError("Résultat précédent incertain : arrêter physiquement puis déconnecter et reconnecter")
        for field in ("speed_kmh", "incline_pct"):
            if field not in self.received_at or now - self.received_at[field] > STALE_SECONDS:
                raise ControllerError("Vitesse ou inclinaison absente/périmée : commande bloquée")
        speed, incline = self.telemetry["speed_kmh"], self.telemetry["incline_pct"]
        limits = self.session_limits or {"speed": MAX_SPEED, "incline": MAX_INCLINE}
        if not (0 <= speed <= limits["speed"] and 0 <= incline <= limits["incline"]):
            raise ControllerError("Mesures hors du périmètre autorisé. Réduisez la vitesse ou la pente sur la console.")

    def _validate_value(self, action: str, value: float | None, *, ceiling: float | None = None):
        if action in ("speed", "incline"):
            if value is None:
                raise ControllerError("Valeur requise")
            capability = "speed_target" if action == "speed" else "incline_target"
            if not self.capabilities.get(capability):
                raise ControllerError("Cette commande n'est pas annoncée par le tapis")
            try:
                ftms.validate_target(value, self.capabilities.get(f"{action}_range"),
                                     ceiling if ceiling is not None else (self.session_limits or
                                         {"speed": MAX_SPEED, "incline": MAX_INCLINE})[action],
                                     scale=100 if action == "speed" else 10)
            except ValueError as exc:
                raise ControllerError(str(exc)) from exc

    async def arm(self, owner: str):
        self._ensure_writable()
        if self.phase != "connected" or not self.capabilities.get("control_point"):
            raise ControllerError("Control Point FTMS compatible absent")
        if self.owner and self.owner != owner and time.monotonic() < self.armed_until:
            raise ControllerError("Un autre écran possède le contrôle")
        if self.desynchronized or self.audit_error:
            raise ControllerError(self.audit_error or "Reconnexion nécessaire après une réponse incertaine")
        self._ensure_restart_ready()
        self.owner = owner
        self.owner_heartbeat = time.monotonic()
        self.armed_until = time.monotonic() + 600
        try:
            self._ensure_ready(owner)
            code = await self._exchange("request_control")
            self.control_acquired = code == 1
            self.log("info", "Contrôle activé pour cet écran, pendant 10 minutes maximum")
        except Exception:
            self.owner = None
            self.armed_until = 0
            raise

    def _ensure_writable(self):
        if self.read_only:
            raise ControllerError("Connexion en lecture seule : commandes du tapis indisponibles")

    async def prepare_session_control(self, limits: dict):
        """S'abonner aux indications AVANT d'autoriser les écritures de séance.

        Appelé seulement par le moteur après le compte à rebours et la présence.
        Reconnexion obligatoire si la préparation du canal échoue.
        """
        if self.phase != "connected" or not self.capabilities.get("control_point"):
            raise ControllerError("Le tapis ne permet pas le contrôle de cette séance.")
        if self.desynchronized:
            raise ControllerError("Utilisez le STOP physique, puis reconnectez le tapis.")
        async with self.lifecycle_lock:
            if not self.simulation and not self.control_notifications:
                try:
                    await asyncio.wait_for(self.client.start_notify(ftms.CONTROL, self._control_notification), 6)
                    self.control_notifications = True
                except Exception as exc:
                    self.desynchronized = True
                    self.log("error", "Préparation du contrôle impossible", detail=str(exc))
                    raise ControllerError("Contrôle indisponible. Reconnectez le tapis avant de réessayer.") from exc
            self.session_limits = dict(limits)
            self.read_only = False

    async def arm_session(self, owner: str, deadline: float):
        """Autorisation de la séance : jamais renouvelée par un heartbeat."""
        self._ensure_writable()
        self._ensure_restart_ready()
        if self.owner and self.owner != owner:
            raise ControllerError("La séance est commandée depuis un autre écran.")
        self.owner = owner
        self.owner_heartbeat = time.monotonic()
        self.armed_until = deadline
        try:
            self._ensure_ready(owner)
            await self._exchange("request_control")
            self.control_acquired = True
        except BaseException:
            self.armed_until = 0
            self.owner = None
            raise

    async def _exchange(self, action: str, value: float | None = None):
        self._ensure_writable()
        if self.command_lock.locked():
            raise ControllerError("Une commande est déjà en cours. Attendre sa réponse.")
        async with self.command_lock:
            if self.phase != "connected" or (not self.simulation and (self.client is None or not self.client.is_connected)):
                raise ControllerError("Bluetooth déconnecté")
            payload = ftms.encode_command(action, value)
            future = asyncio.get_running_loop().create_future()
            self.pending = (payload[0], future)
            self.log("command", "Demande de commande FTMS", action=action, value=value, raw=payload.hex())
            self.last_command = {"action": action, "value": value, "status": "sent"}
            try:
                if self.audit_error and action not in ("stop", "pause"):
                    raise ControllerError(self.audit_error)
                async with asyncio.timeout(COMMAND_TIMEOUT):
                    if self.simulation:
                        await asyncio.sleep(0.08)
                        if action == "speed":
                            self.targets["speed_kmh"] = value
                            if self.sim_speed > 0:
                                self.sim_speed = value
                        elif action == "incline":
                            self.sim_incline = value
                        elif action == "start":
                            self.sim_speed = self.targets.get("speed_kmh", 0.5)
                        elif action in ("stop", "pause"):
                            self.sim_speed = 0
                        self._control_notification(None, bytes([0x80, payload[0], 1]))
                        self._sim_notification()
                    else:
                        await self.client.write_gatt_char(ftms.CONTROL, payload, response=True)
                    code = await future
                if code != 1:
                    self.last_command["status"] = "refused"
                    if code == 5:
                        self.control_acquired = False
                        self.armed_until = 0
                    self.log("error", ftms.RESULTS[code], action=action, result_code=code)
                    raise ControllerError(ftms.RESULTS[code])
                self.log("accepted", "Commande acceptée — effet physique à vérifier", action=action, value=value)
                self.last_command["status"] = "accepted"
                return code
            except (TimeoutError, asyncio.CancelledError) as exc:
                self.desynchronized = True
                self.last_command["status"] = "unknown"
                self.armed_until = 0
                self.log("error", "Réponse absente : résultat inconnu, aucune répétition automatique", action=action)
                if isinstance(exc, asyncio.CancelledError):
                    raise
                raise ControllerError("Réponse absente : résultat inconnu. Vérifier la console et reconnecter avant de reprendre.") from exc
            except ControllerError:
                if self.phase != "connected":
                    self.desynchronized = True
                    self.last_command["status"] = "unknown"
                raise
            except Exception as exc:
                self.desynchronized = True
                self.last_command["status"] = "unknown"
                self.armed_until = 0
                self.log("error", "Écriture Bluetooth incertaine", detail=str(exc), action=action)
                raise ControllerError(f"Écriture Bluetooth incertaine : {exc}") from exc
            finally:
                if not future.done():
                    future.cancel()
                self.pending = None

    async def command(self, owner: str, action: str, value: float | None = None, *, from_workout: bool = False):
        self._ensure_writable()
        if action in ("stop", "pause"):
            await self.halt("Arrêt demandé" if action == "stop" else "Pause demandée", pause=action == "pause")
            return
        if action not in ("speed", "incline", "start"):
            raise ControllerError("Commande inconnue")
        if self.workout_task and not from_workout:
            raise ControllerError("Arrêter le programme avant un réglage manuel")
        self._ensure_ready(owner)
        if not self.control_acquired:
            raise ControllerError("Le tapis n'a pas accordé le contrôle")
        self._validate_value(action, value)
        if action == "start":
            if self.telemetry["speed_kmh"] > 0:
                raise ControllerError("Le tapis est déjà en mouvement")
            self._ensure_restart_ready()
            minimum = self.capabilities.get("speed_range", {}).get("min")
            self._validate_value("speed", minimum)
            if value is not None:
                self._validate_value("speed", value)
            # Reset the target to the advertised minimum before starting/resuming.
            await self._exchange("speed", minimum)
            self.targets["speed_kmh"] = minimum
            self._ensure_ready(owner)
        procedure_began = time.monotonic()
        if from_workout:
            # Cancelling the program must not cancel an in-flight BLE procedure.
            # Consume its bounded response before sending STOP on the same channel.
            exchange = asyncio.create_task(self._exchange(action, value))
            try:
                await asyncio.shield(exchange)
            except asyncio.CancelledError:
                with contextlib.suppress(ControllerError):
                    await exchange
                raise
        else:
            await self._exchange(action, value)
        if action == "start" and value is not None:
            # Start at the minimum, then apply the explicitly selected target only
            # after a fresh movement report. STOP/lease loss blocks the second step.
            deadline = time.monotonic() + START_OBSERVE_SECONDS
            while True:
                self._ensure_ready(owner)
                if (self.received_at.get("speed_kmh", 0) > procedure_began and
                        self.telemetry["speed_kmh"] > 0):
                    break
                if time.monotonic() >= deadline:
                    await self.halt("Démarrage non observé")
                    raise ControllerError("Le démarrage n'a pas été observé : arrêt demandé, vitesse cible non appliquée")
                await asyncio.sleep(.1)
            if value != minimum:
                await self.command(owner, "speed", value)
        if action in ("speed", "incline"):
            self.targets["speed_kmh" if action == "speed" else "incline_pct"] = value

    async def halt(self, reason: str, *, pause: bool = False):
        if self.read_only:
            return
        task, self.workout_task = self.workout_task, None
        self.armed_until = 0
        self.owner = None
        if self.phase == "connected" and self.control_acquired:
            self.restart_after = time.monotonic() + STOP_SETTLE_SECONDS
        if task and task is not asyncio.current_task():
            task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await task
        self.workout = {**self.workout, "phase": "interrupted", "reason": reason}
        if self.phase != "connected" or not self.control_acquired:
            self.log("warning", f"{reason} : arrêt du tapis non confirmé, utiliser la console si nécessaire")
            return
        if self.desynchronized:
            # A late 0x08 response could belong to an earlier pause/stop. No false ACK.
            self.log("error", f"{reason} : canal incertain, utiliser le STOP physique")
            raise ControllerError("Canal Bluetooth incertain : utiliser le STOP physique")
        try:
            # Serialize after an existing exchange, but never accumulate motion commands.
            async with asyncio.timeout(COMMAND_TIMEOUT + 1):
                async with self.command_lock:
                    pass
            if self.desynchronized:
                raise ControllerError("Réponse précédente incertaine : utiliser le STOP physique")
            await self._exchange("pause" if pause else "stop")
            self.log("info", f"{reason} : commande acceptée, vérifier l'arrêt de la bande")
        except Exception as exc:
            self.log("error", f"{reason} : arrêt non confirmé, utiliser le STOP physique", detail=str(exc))
            raise ControllerError(f"Arrêt non confirmé : {exc}. Utiliser le STOP physique.") from exc

    def validate_workout(self, blocks: list[dict]):
        if not 1 <= len(blocks) <= 3:
            raise ControllerError("Le POC accepte 1 à 3 blocs")
        total = 0
        previous = None
        for block in blocks:
            if set(block) != {"duration_s", "speed_kmh", "incline_pct"}:
                raise ControllerError("Champs de bloc attendus : duration_s, speed_kmh, incline_pct")
            duration = block["duration_s"]
            if type(duration) is not int or not 5 <= duration <= 60:
                raise ControllerError("Durée de chaque bloc : entier de 5 à 60 secondes")
            for key in ("speed_kmh", "incline_pct"):
                if isinstance(block[key], bool) or not isinstance(block[key], (int, float)):
                    raise ControllerError("Vitesse et pente doivent être numériques")
            self._validate_value("speed", block["speed_kmh"], ceiling=MAX_WORKOUT_SPEED)
            self._validate_value("incline", block["incline_pct"])
            if previous and (abs(block["speed_kmh"] - previous["speed_kmh"]) > 0.5 or
                             abs(block["incline_pct"] - previous["incline_pct"]) > 1):
                raise ControllerError("Transition POC limitée à 0,5 km/h et 1 % entre deux blocs")
            previous = block
            total += duration
        return total

    async def run_workout(self, owner: str, blocks: list[dict]):
        self._ensure_writable()
        self._ensure_ready(owner)
        if self.workout_task:
            raise ControllerError("Un programme est déjà en cours")
        total = self.validate_workout(blocks)
        if self.telemetry["speed_kmh"] <= 0:
            raise ControllerError("Démarrer d'abord le tapis, puis lancer les blocs de test")
        if (abs(blocks[0]["speed_kmh"] - self.telemetry["speed_kmh"]) > 0.5 or
                abs(blocks[0]["incline_pct"] - self.telemetry["incline_pct"]) > 1):
            raise ControllerError("Régler d'abord le tapis près de la cible du premier bloc")
        self.workout = {"phase": "running", "blocks": blocks, "total_s": total, "block": 0, "remaining_s": total}
        self.workout_task = asyncio.create_task(self._run_workout(owner, blocks))
        self.log("info", "Programme de test lancé", blocks=blocks)

    async def _run_workout(self, owner, blocks):
        try:
            for index, block in enumerate(blocks):
                self.workout.update(block=index + 1, remaining_s=block["duration_s"])
                await self.command(owner, "incline", block["incline_pct"], from_workout=True)
                await self.command(owner, "speed", block["speed_kmh"], from_workout=True)
                # Block timer begins when target values are actually observed, not on HTTP/ATT ACK.
                deadline = time.monotonic() + 15
                while True:
                    self._ensure_ready(owner)
                    if self.telemetry["speed_kmh"] <= 0:
                        raise ControllerError("Tapis arrêté : le programme ne le redémarre pas")
                    if (abs(self.telemetry["speed_kmh"] - block["speed_kmh"]) <= 0.05 and
                            abs(self.telemetry["incline_pct"] - block["incline_pct"]) <= 0.1):
                        break
                    if time.monotonic() >= deadline:
                        raise ControllerError("La télémétrie n'a pas confirmé la vitesse/pente du bloc")
                    await asyncio.sleep(0.2)
                self.log("observed", "Cibles du bloc observées", block=index + 1,
                         speed_kmh=self.telemetry["speed_kmh"], incline_pct=self.telemetry["incline_pct"])
                end = time.monotonic() + block["duration_s"]
                while time.monotonic() < end:
                    self._ensure_ready(owner)
                    if self.telemetry["speed_kmh"] <= 0:
                        raise ControllerError("Tapis arrêté pendant le bloc")
                    self.workout["remaining_s"] = max(0, round(end - time.monotonic()))
                    await asyncio.sleep(0.2)
            await self.halt("Programme terminé")
            self.workout["phase"] = "completed"
        except asyncio.CancelledError:
            self.log("warning", "Exécution du programme interrompue")
            raise
        except Exception as exc:
            self.log("error", "Programme interrompu", detail=str(exc))
            self.workout.update(phase="failed", reason=str(exc))
            with contextlib.suppress(ControllerError):
                await self.halt("Erreur de programme")
            self.workout.update(phase="failed", reason=str(exc))
        finally:
            self.workout_task = None

    async def _watchdog(self):
        while True:
            await asyncio.sleep(0.5)
            if self.owner and self.session_limits is None:
                now = time.monotonic()
                unhealthy = now >= self.armed_until or now - self.owner_heartbeat > LEASE_SECONDS
                stale = any(now - self.received_at.get(key, 0) > STALE_SECONDS for key in ("speed_kmh", "incline_pct"))
                if unhealthy or stale or self.desynchronized or self.audit_error:
                    with contextlib.suppress(ControllerError):
                        await self.halt("Contrôle désarmé : écran absent, délai expiré ou mesures indisponibles")

    def _sim_notification(self):
        flags = (1 << 2) | (1 << 3) | (1 << 10)
        payload = (struct.pack("<HH", flags, round(self.sim_speed * 100)) +
                   round(self.sim_distance).to_bytes(3, "little") +
                   struct.pack("<hhH", round(self.sim_incline * 10), 0, self.sim_elapsed))
        self._data_notification(None, payload)

    async def _simulate(self):
        while True:
            await asyncio.sleep(1)
            if self.sim_speed > 0:
                self.sim_elapsed += 1
                self.sim_distance += self.sim_speed / 3.6
            self._sim_notification()

    async def close(self):
        if not self.read_only and self.session_limits is None:
            with contextlib.suppress(ControllerError):
                await self.halt("Fermeture du serveur")
        if self.watchdog_task:
            self.watchdog_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self.watchdog_task
        await self._close_client()
        self.audit_stopping.set()
        if self.audit_task:
            await self.audit_task
        await self._flush_audit()
