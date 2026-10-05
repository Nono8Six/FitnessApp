"""Brique 7 : lecture seule, exclusion Bluetooth et contrat d'observation."""

import asyncio
import struct
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from backend.app import create_app
from backend.device import ftms
from backend.device.controller import Controller, ControllerError
from backend.device.lease import BluetoothLease
from backend.device.runtime import DeviceRuntime


class PassiveClient:
    def __init__(self, device, disconnected_callback, timeout):
        self.callback = disconnected_callback
        self.is_connected = False
        self.notifications = []
        self.writes = []
        chars = [SimpleNamespace(uuid=uuid, properties=properties) for uuid, properties in (
            (ftms.FEATURE, ["read"]), (ftms.SPEED_RANGE, ["read"]), (ftms.INCLINE_RANGE, ["read"]),
            (ftms.TREADMILL, ["notify"]), (ftms.STATUS, ["notify"]), (ftms.CONTROL, ["write", "indicate"]),
        )]
        service = SimpleNamespace(uuid=ftms.SERVICE, characteristics=chars)

        class Services(list):
            def get_service(self, uuid):
                return service if uuid == ftms.SERVICE else None

        self.services = Services([service])

    async def connect(self):
        self.is_connected = True

    async def read_gatt_char(self, char):
        return {
            ftms.FEATURE: struct.pack("<II", 12 | (1 << 10), 3),
            ftms.SPEED_RANGE: struct.pack("<HHH", 100, 1600, 10),
            ftms.INCLINE_RANGE: struct.pack("<hhH", 0, 100, 5),
        }[char.uuid]

    async def start_notify(self, char, callback):
        self.notifications.append(char.uuid)

    async def write_gatt_char(self, char, data, response):
        self.writes.append(data)

    async def disconnect(self):
        self.is_connected = False
        self.callback(self)


class PassiveControllerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.controller = Controller(Path(self.temp.name), read_only=True)
        self.controller.devices = {"discovered": object()}
        self.controller.device_rows = [{"address": "discovered", "name": "RUN500", "candidate": True}]

    async def asyncTearDown(self):
        await self.controller.close()
        self.temp.cleanup()

    async def test_real_connection_and_all_exit_paths_never_write_commands(self):
        with patch("backend.device.controller.BleakClient", PassiveClient):
            await self.controller.connect("discovered")
        client = self.controller.client
        self.assertEqual(client.notifications, [ftms.TREADMILL, ftms.STATUS])
        self.assertTrue(self.controller.capabilities["control_point"])
        self.assertFalse(self.controller.control_acquired)
        self.controller.control_acquired = True  # Même un état incohérent reste sans écriture.
        calls = [self.controller.arm("owner"), self.controller.command("owner", "start"),
                 self.controller.command("owner", "stop"), self.controller._exchange("request_control"),
                 self.controller.run_workout("owner", [])]
        for call in calls:
            with self.assertRaisesRegex(ControllerError, "lecture seule"):
                await call
        await self.controller.halt("test")
        await self.controller.disconnect()
        await self.controller.close()
        self.assertEqual(client.writes, [])
        self.assertIsNone(self.controller.bluetooth_lease.file)
        self.assertEqual(self.controller.phase, "disconnected")

    async def test_failed_disconnect_keeps_the_bluetooth_lease(self):
        with patch("backend.device.controller.BleakClient", PassiveClient):
            await self.controller.connect("discovered")
        client = self.controller.client
        with patch.object(client, "disconnect", AsyncMock(side_effect=OSError("perte de réponse"))):
            with self.assertRaisesRegex(ControllerError, "non confirmée"):
                await self.controller.disconnect()
        self.assertIs(self.controller.client, client)
        self.assertIsNotNone(self.controller.bluetooth_lease.file)
        with self.assertRaises(ControllerError):
            await self.controller.connect("discovered")
        await self.controller.disconnect()
        self.assertEqual(client.writes, [])

    async def test_partial_capabilities_and_invalid_telemetry_are_explicit(self):
        original = PassiveClient.read_gatt_char

        async def broken(client, char):
            if char.uuid == ftms.SPEED_RANGE:
                raise OSError("lecture impossible")
            return await original(client, char)

        with patch("backend.device.controller.BleakClient", PassiveClient), patch.object(PassiveClient, "read_gatt_char", broken):
            await self.controller.connect("discovered")
        self.assertEqual(self.controller.capability_errors, ["speed_range"])
        self.assertNotIn("speed_range", self.controller.capabilities)
        self.controller._data_notification(None, b"\x00")
        self.assertEqual(self.controller.received_at, {})

    async def test_failed_connection_cleanup_allows_explicit_disconnect_retry(self):
        with patch("backend.device.controller.BleakClient", PassiveClient), \
                patch.object(PassiveClient, "start_notify", AsyncMock(side_effect=OSError("abonnement refusé"))), \
                patch.object(PassiveClient, "disconnect", AsyncMock(side_effect=OSError("fermeture incertaine"))):
            with self.assertRaisesRegex(ControllerError, "non confirmée"):
                await self.controller.connect("discovered")
        self.assertEqual(self.controller.phase, "connected")
        self.assertFalse(self.controller.lifecycle_lock.locked())
        client = self.controller.client
        await self.controller.disconnect()
        self.assertEqual(self.controller.phase, "disconnected")
        self.assertEqual(client.writes, [])

    async def test_cancellation_closes_connection_without_writes(self):
        async def blocked(client, char, callback):
            await asyncio.sleep(10)

        with patch("backend.device.controller.BleakClient", PassiveClient), patch.object(PassiveClient, "start_notify", blocked):
            task = asyncio.create_task(self.controller.connect("discovered"))
            await asyncio.sleep(.02)
            client = self.controller.client
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        self.assertFalse(client.is_connected)
        self.assertEqual(client.writes, [])
        self.assertIsNone(self.controller.bluetooth_lease.file)


class RuntimeTests(unittest.IsolatedAsyncioTestCase):
    async def test_concurrency_staleness_invalid_heart_rate_and_connection_loss(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime = DeviceRuntime(Path(folder), True, "instance")
            await runtime.start()
            try:
                scanning = asyncio.create_task(runtime.perform("scan"))
                await asyncio.sleep(.01)
                with self.assertRaisesRegex(ControllerError, "déjà en cours"):
                    await runtime.perform("connect", "SIMULATION")
                await scanning
                await runtime.perform("connect", "SIMULATION")
                self.assertIsNone(runtime.snapshot()["measurements"]["heart_rate_bpm"]["value"])
                for invalid in (0, 255):
                    runtime.controller._data_notification(None, struct.pack("<HHB", 1 << 8, 0, invalid))
                    self.assertEqual(runtime.snapshot()["measurements"]["heart_rate_bpm"]["quality"], "absent")
                runtime.controller.received_at["speed_kmh"] = time.monotonic() - 6
                self.assertEqual(runtime.snapshot()["measurements"]["speed_kmh"]["quality"], "stale")
                runtime.controller._disconnected(None)
                runtime.publish()
                self.assertIn("perdue", runtime.error)
                self.assertEqual(runtime.snapshot()["phase"], "disconnected")
                await runtime.perform("disconnect")
                self.assertIsNone(runtime.error)
            finally:
                await runtime.close()
            self.assertTrue(runtime.task.done())
            self.assertTrue(runtime.controller.watchdog_task.done())
            self.assertIsNone(runtime.controller.simulator_task)


class LeaseTests(unittest.TestCase):
    def test_another_process_is_excluded_and_os_releases_lease(self):
        lease = BluetoothLease()
        script = "from backend.device.lease import BluetoothLease; l=BluetoothLease(); l.acquire(); l.release()"
        try:
            lease.acquire()
            refused = subprocess.run([sys.executable, "-c", script], capture_output=True, timeout=10)
            self.assertNotEqual(refused.returncode, 0)
        finally:
            lease.release()
        accepted = subprocess.run([sys.executable, "-c", script], capture_output=True, timeout=10)
        self.assertEqual(accepted.returncode, 0, accepted.stderr)


class DeviceApiTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(simulation=True, data_root=Path(self.temp.name))
        self.client = TestClient(self.app, base_url="http://127.0.0.1:4330")
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)
        self.temp.cleanup()

    def until(self, socket, phase):
        for _ in range(8):
            event = socket.receive_json()
            if event["state"]["phase"] == phase:
                return event
        self.fail(f"État {phase} non reçu")

    def test_websocket_complete_snapshot_order_and_reconnection_without_device_reconnect(self):
        headers = {"origin": "http://127.0.0.1:4330"}
        with self.client.websocket_connect("ws://127.0.0.1:4330/api/device/events", headers=headers) as socket:
            initial = socket.receive_json()
            self.assertEqual(initial["type"], "snapshot")
            self.assertEqual(initial["state"]["phase"], "disconnected")
            self.assertEqual(self.client.post("/api/device/scan", json={}).status_code, 200)
            self.assertEqual(self.client.post("/api/device/connect", json={"address": "SIMULATION"}).status_code, 200)
            connected = self.until(socket, "connected")
            self.assertGreater(connected["sequence"], initial["sequence"])
            self.assertEqual(connected["state"]["capabilities"]["speed_range"]["max"], 16)
            next_event = socket.receive_json()
            self.assertGreater(next_event["sequence"], connected["sequence"])
            self.assertEqual(next_event["state"]["measurements"]["speed_kmh"]["quality"], "fresh")
        simulator = self.app.state.device.controller.simulator_task
        with self.client.websocket_connect("ws://127.0.0.1:4330/api/device/events", headers=headers) as socket:
            self.assertEqual(socket.receive_json()["state"]["phase"], "connected")
            self.assertIs(simulator, self.app.state.device.controller.simulator_task)
            result = self.client.post("/api/device/disconnect", json={})
            self.assertEqual(result.status_code, 200)
            self.assertIsNone(result.json()["state"]["error"])
            self.until(socket, "disconnected")
        self.assertFalse(self.app.state.device.controller.control_acquired)

    def test_input_origin_and_command_routes_are_rejected(self):
        for body in ({"address": True}, {"address": ""}, {"address": "SIMULATION", "control": True}):
            self.assertEqual(self.client.post("/api/device/connect", json=body).status_code, 422)
        self.assertEqual(self.client.post("/api/device/connect", json={"address": "not-discovered"}).status_code, 409)
        self.assertEqual(self.client.post("/api/device/scan", json={"control": True}).status_code, 422)
        for route in ("/api/command", "/api/arm", "/api/workout", "/api/device/command", "/api/device/arm"):
            self.assertEqual(self.client.post(route, json={}).status_code, 404)
        for origin in (None, "http://foreign.test"):
            headers = {"origin": origin} if origin else {}
            with self.assertRaises(WebSocketDisconnect):
                with self.client.websocket_connect("ws://127.0.0.1:4330/api/device/events", headers=headers):
                    pass
        with self.client.websocket_connect("ws://127.0.0.1:4330/api/device/events", headers={"origin": "http://127.0.0.1:4330"}) as socket:
            socket.receive_json()
            socket.send_json({"action": "start"})
            with self.assertRaises(WebSocketDisconnect):
                socket.receive_json()
        self.assertEqual(self.app.state.device.controller.phase, "disconnected")
        self.assertFalse(any(event["level"] == "command" for event in self.app.state.device.controller.events))


if __name__ == "__main__":
    unittest.main()
