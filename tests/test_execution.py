"""Règles critiques de la brique 8, y compris le chemin BLE non simulé."""

import asyncio
import struct
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.device import ftms
from backend.device.controller import ControllerError
from backend.training.workouts import WorkoutInput, WorkoutUpdate, create_workout, update_workout
from tests.test_device import PassiveClient

OWNER = "a" * 32
OBSERVER = "b" * 32


class CommandClient(PassiveClient):
    """Indications et données via les callbacks Bleak, sans branche simulation."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.callbacks = {}
        self.speed = self.incline = self.target = 0
        self.answer = True
        self.refuse = False
        self.refused_actions = set()
        self.ignore_stop = False
        self.delay = 0
        self.telemetry_task = None

    async def connect(self):
        await super().connect()
        async def tick():
            while True:
                self.measure()
                await asyncio.sleep(.02)
        self.telemetry_task = asyncio.create_task(tick())

    async def disconnect(self):
        if self.telemetry_task:
            self.telemetry_task.cancel()
            await asyncio.gather(self.telemetry_task, return_exceptions=True)
        await super().disconnect()

    async def start_notify(self, char, callback):
        key = char if isinstance(char, str) else char.uuid
        self.notifications.append(key)
        self.callbacks[key] = callback
        if key == ftms.TREADMILL:
            self.measure()

    def measure(self):
        callback = self.callbacks.get(ftms.TREADMILL)
        if callback:
            callback(None, struct.pack("<HHhh", 1 << 3, round(self.speed * 100), round(self.incline * 10), 0))

    async def write_gatt_char(self, char, data, response):
        self.writes.append(bytes(data))
        if self.delay:
            await asyncio.sleep(self.delay)
        refused = self.refuse or data[0] in self.refused_actions
        if data[0] == 2 and not refused:
            self.target = int.from_bytes(data[1:], "little") / 100
            if self.speed > 0:
                self.speed = self.target
        if data[0] == 3 and not refused:
            self.incline = int.from_bytes(data[1:], "little", signed=True) / 10
        if data[0] == 7 and not refused:
            self.speed = self.target
        if data[0] == 8 and not refused and not self.ignore_stop:
            self.speed = 0
        if self.answer:
            self.callbacks[ftms.CONTROL](None, bytes([128, data[0], 3 if refused else 1]))
        self.measure()


class ExecutionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(simulation=True, data_root=Path(self.temp.name))
        self.device = self.app.state.device
        self.c = self.device.controller
        self.e = self.app.state.execution
        await self.device.start()
        await self.e.start_runtime()
        await self.device.perform("scan")
        await self.device.perform("connect", "SIMULATION")
        self.data = WorkoutInput(name="Marche", items=[
            {"kind": "warmup", "sec": 30, "speed": 2.0, "incline": 0.0},
            {"kind": "steady", "sec": 1770, "speed": 2.5, "incline": 1.0}])
        with self.app.state.database.write() as s:
            self.workout = create_workout(s, "arnaud", self.data)
        self.patches = [patch("backend.training.execution.STOP_SETTLE_SECONDS", .05),
                        patch("backend.device.controller.STOP_SETTLE_SECONDS", .05)]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        await self.e.close()
        await self.device.close()
        self.app.state.database.close()
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    async def wait(self, phase, timeout=8, keep_alive=True):
        end = time.monotonic() + timeout
        while self.e.phase != phase:
            if keep_alive:
                self.e.heartbeat(OWNER)
            if time.monotonic() > end:
                self.fail(f"{phase} attendu, {self.e.phase}: {self.e.error}")
            await asyncio.sleep(.05)

    async def start_running(self):
        await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
        self.e.countdown_until = time.monotonic() - 1
        await self.wait("running")

    async def test_countdown_cancel_is_zero_commands_and_no_motion(self):
        await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
        self.e.request_halt()
        await self.e.task
        self.assertEqual(self.e.phase, "cancelled")
        self.assertIsNone(self.c.last_command)
        self.assertTrue(self.c.read_only)
        self.assertEqual(self.c.sim_speed, 0)

    async def test_start_is_blocked_during_device_operation(self):
        async with self.device.operation_lock:
            with self.assertRaisesRegex(ControllerError, "opération"):
                await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
        self.assertEqual(self.e.phase, "idle")
        self.assertIsNone(self.c.last_command)

    async def test_thirty_minute_snapshot_limits_and_single_owner(self):
        await self.start_running()
        self.assertEqual(self.e.workout["summary"]["sec"], 1800)
        self.assertGreater(self.c.armed_until - time.monotonic(), 1800)
        deadline = self.e.deadline
        self.e.heartbeat(OBSERVER)
        self.assertEqual(self.e.deadline, deadline)
        with self.assertRaises(ControllerError):
            await self.e.start(OBSERVER, "arnaud", self.workout["id"], 1)
        with self.app.state.database.write() as s:
            update_workout(s, "arnaud", self.workout["id"], WorkoutUpdate(name="Modifiée", items=self.data.items, base_version=1))
        self.assertEqual(self.e.workout["name"], "Marche")
        self.assertEqual(self.e.workout["version"], 1)

    async def test_pause_resume_keeps_point_and_excludes_pause(self):
        await self.start_running()
        self.e.active_since -= 12
        self.e.request_halt(pause=True)
        await self.wait("paused")
        frozen = self.e.active_time()
        self.assertTrue(self.e.stop_confirmed)
        await asyncio.sleep(.2)
        self.assertEqual(self.e.active_time(), frozen)
        with self.assertRaises(ControllerError):
            await self.e.resume(OBSERVER)
        await self.e.resume(OWNER)
        await self.wait("running")
        self.assertEqual(self.e.block, 0)
        self.assertGreaterEqual(self.e.active_time(), frozen)
        self.assertGreater(self.e.pause_time(), .2)

    async def test_transition_completion_and_confirmed_stop(self):
        await self.start_running()
        self.e.active_since -= 31
        await asyncio.sleep(.5)
        self.assertEqual(self.e.block, 1)
        self.assertEqual(self.c.telemetry["speed_kmh"], 2.5)
        self.e.active_since -= 1800
        await self.wait("completed")
        self.assertEqual(self.e.active_time(), 1800)
        self.assertTrue(self.e.stop_confirmed)
        self.assertEqual(self.c.sim_speed, 0)
        wall = self.e.snapshot()["wall_s"]
        await asyncio.sleep(.15)
        self.assertEqual(self.e.snapshot()["wall_s"], wall)
        self.assertEqual(self.e.samples[-1]["speed"], 0)

    async def test_observer_cannot_keep_owner_alive(self):
        await self.start_running()
        self.e.owner_seen -= 13
        self.e.heartbeat(OBSERVER)
        await self.wait("stopped", keep_alive=False)
        self.assertTrue(self.e.stop_confirmed)
        self.assertIn("absent", self.e.reason)

    async def test_expiry_and_pause_budget_are_not_renewed(self):
        await self.start_running()
        self.e.deadline = time.monotonic() - 1
        self.e.heartbeat(OWNER)
        await self.wait("stopped")
        self.assertIn("expirée", self.e.reason)

    async def test_stale_telemetry_does_not_claim_stop(self):
        await self.start_running()
        self.c.simulator_task.cancel()
        with self.assertRaises(asyncio.CancelledError):
            await self.c.simulator_task
        self.c.simulator_task = None
        self.c.received_at["speed_kmh"] -= 8
        # Simulation STOP renvoie volontairement un nouvel échantillon, comme
        # le matériel peut le faire. Puis perte BLE : aucune confirmation.
        self.c.phase = "disconnected"
        await self.wait("unknown")
        self.assertFalse(self.e.stop_confirmed)
        self.assertIn("déconnecté", self.e.reason)

    async def real(self):
        await self.c.disconnect()
        self.c.simulation = False
        self.c.device_rows = [{"address": "fake", "name": "RUN500", "candidate": True}]
        self.c.devices = {"fake": object()}
        with patch("backend.device.controller.BleakClient", CommandClient):
            await self.c.connect("fake")
        self.client = self.c.client
        self.assertNotIn(ftms.CONTROL, self.client.notifications)

    async def test_real_transport_subscription_and_minimum_before_target(self):
        await self.real()
        await self.start_running()
        self.assertIn(ftms.CONTROL, self.client.notifications)
        self.assertEqual(self.client.writes[:3], [b"\x00", ftms.encode_command("speed", 1), b"\x07"])
        self.assertEqual(self.client.speed, 2)
        self.assertEqual(self.c.last_command["status"], "observed")

    async def test_real_limits_steps_and_poc_limits_are_distinct(self):
        await self.real()
        incompatible = copy_workout = {**self.workout, "blocks": [{**self.workout["blocks"][0], "speed": 3.0}]}
        with self.assertRaisesRegex(ControllerError, "Limite 2.5"):
            self.e._compatible(incompatible)
        with self.assertRaises(ControllerError):
            self.e._compatible({**copy_workout, "blocks": [{**copy_workout["blocks"][0], "speed": 2.1, "incline": .2}]})
        self.assertEqual(self.client.writes, [])
        with self.assertRaisesRegex(ControllerError, "1 à 3"):
            self.c.validate_workout([{}] * 4)

    async def test_stop_consumes_inflight_real_response_then_no_more_motion(self):
        await self.real()
        await self.start_running()
        self.client.delay = .3
        self.e.active_since -= 31
        while not self.c.command_lock.locked():
            await asyncio.sleep(.01)
        self.e.request_halt()
        await self.wait("stopped")
        self.assertEqual(self.client.writes[-1], b"\x08\x01")
        self.assertFalse(self.c.desynchronized)
        self.assertTrue(self.e.stop_confirmed)

    async def test_unknown_real_response_locks_without_retry(self):
        await self.real()
        self.client.answer = False
        with patch("backend.device.controller.COMMAND_TIMEOUT", .1):
            await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
            self.e.countdown_until = time.monotonic() - 1
            await self.wait("unknown")
        self.assertEqual(self.client.writes, [b"\x00"])
        self.assertTrue(self.c.desynchronized)
        with self.assertRaises(ControllerError):
            await self.e.resume(OWNER)

    async def test_refused_real_target_requests_stop_without_retry(self):
        await self.real()
        await self.start_running()
        self.client.refused_actions.add(2)
        before = len(self.client.writes)
        self.e.active_since -= 31
        await self.wait("stopped")
        self.assertEqual(self.client.writes[before:], [ftms.encode_command("incline", 1),
                         ftms.encode_command("speed", 2.5), b"\x08\x01"])
        self.assertTrue(self.e.stop_confirmed)
        self.assertIsNotNone(self.e.error)

    async def test_real_stop_ack_without_zero_remains_unknown_then_passive_recovery(self):
        await self.real()
        await self.start_running()
        self.client.ignore_stop = True
        with patch("backend.training.execution.STOP_CONFIRM_TIMEOUT", .15):
            self.e.request_halt()
            await self.wait("unknown")
        self.assertFalse(self.e.stop_confirmed)
        self.assertEqual(self.client.writes[-1], b"\x08\x01")
        with self.assertRaises(ControllerError):
            await self.e.recover()
        await self.c.disconnect()
        with patch("backend.device.controller.BleakClient", CommandClient):
            await self.c.connect("fake")
        self.assertEqual(self.c.client.writes, [])
        await self.e.recover()
        self.assertEqual(self.e.phase, "stopped")
        self.assertFalse(self.e.stop_confirmed)
        self.assertEqual(self.c.client.writes, [])

    async def test_accumulated_pause_budget_stops_without_human_renewal(self):
        await self.start_running()
        self.e.request_halt(pause=True)
        await self.wait("paused")
        self.e.pause_since -= 901
        with self.assertRaises(ControllerError):
            await self.e.resume(OWNER)
        await self.wait("stopped")
        self.assertIn("expirée", self.e.reason)


class ExecutionApiTests(unittest.TestCase):
    def test_fabricated_confirmation_origins_and_session_actions(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(simulation=True, data_root=Path(directory))
            with TestClient(app, base_url="http://127.0.0.1:4331") as client:
                client.post("/api/device/scan", json={})
                client.post("/api/device/connect", json={"address": "SIMULATION"})
                w = client.post("/api/profiles/arnaud/workouts", json={"name": "Marche", "items": [
                    {"kind": "steady", "sec": 1800, "speed": 2, "incline": 0}]}).json()
                body = {"profile_id": "arnaud", "workout_id": w["id"], "version": 1, "client_id": OWNER,
                        "safety_key": False, "belt_clear": True}
                self.assertEqual(client.post("/api/execution/start", json=body).status_code, 409)
                body["safety_key"] = "true"
                self.assertEqual(client.post("/api/execution/start", json=body).status_code, 422)
                body["safety_key"] = True
                self.assertEqual(client.post("/api/execution/start", json=body, headers={"origin": "http://evil.invalid"}).status_code, 403)
                r = client.post("/api/execution/start", json=body)
                self.assertEqual(r.status_code, 200, r.text)
                session = r.json()["session"]
                self.assertEqual(session["phase"], "countdown")
                self.assertEqual(client.post("/api/execution/stop", json={"client_id": OBSERVER, "session_id": "f" * 32}).status_code, 409)
                self.assertEqual(client.post("/api/execution/stop", json={"client_id": OBSERVER, "session_id": session["id"]}).status_code, 200)
                self.assertTrue(app.state.device.controller.read_only)


if __name__ == "__main__":
    unittest.main()
