"""Tests reserved for protocol decoding and motor-command guardrails."""

import asyncio
import struct
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from poc import ftms
from poc.controller import Controller, ControllerError


class ProtocolTests(unittest.TestCase):
    def test_speed_and_incline_wire_units(self):
        self.assertEqual(ftms.encode_command("speed", 6.5), bytes.fromhex("028a02"))
        self.assertEqual(ftms.encode_command("incline", 3), bytes.fromhex("031e00"))
        self.assertEqual(ftms.encode_command("pause"), bytes.fromhex("0802"))
        self.assertEqual(ftms.encode_command("stop"), bytes.fromhex("0801"))

    def test_decode_optional_fields_and_signed_incline(self):
        flags = (1 << 2) | (1 << 3) | (1 << 8) | (1 << 10)
        packet = struct.pack("<HH", flags, 650) + (2340).to_bytes(3, "little") + struct.pack("<hhBH", -10, 0, 147, 1312)
        self.assertEqual(ftms.parse_treadmill(packet), {"flags":"0x050c", "speed_kmh":6.5,
            "distance_m":2340, "incline_pct":-1, "ramp_angle_deg":0, "heart_rate_bpm":147, "elapsed_s":1312})

    def test_split_record_does_not_invent_speed(self):
        packet = struct.pack("<Hhh", 9, 20, 0)
        self.assertNotIn("speed_kmh", ftms.parse_treadmill(packet))
        self.assertEqual(ftms.parse_treadmill(packet)["incline_pct"], 2)

    def test_truncated_or_unknown_data_fails(self):
        for payload in (b"", bytes.fromhex("000001"), bytes.fromhex("00206400"), bytes.fromhex("0000640000")):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                ftms.parse_treadmill(payload)

    def test_range_step_and_ceiling(self):
        limits = ftms.parse_range(struct.pack("<HHH", 50, 1600, 10))
        self.assertEqual(ftms.validate_target(2.1, limits, 4, scale=100), 210)
        for value in (2.15, 4.1, float("nan"), -1):
            with self.subTest(value=value), self.assertRaises(ValueError):
                ftms.validate_target(value, limits, 4, scale=100)
        with self.assertRaises(ValueError):
            ftms.validate_target(2, None, 4, scale=100)

    def test_features_and_response_validation(self):
        self.assertFalse(ftms.parse_features(struct.pack("<II", 12, 1))["incline_target"])
        self.assertEqual(ftms.parse_response(bytes.fromhex("800205")), (2,5))
        with self.assertRaises(ValueError):
            ftms.parse_response(bytes.fromhex("8002"))


class ControllerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.controller = Controller(Path(self.temp.name), simulation=True)
        await self.controller.start()
        await self.controller.scan()
        await self.controller.connect("SIMULATION")

    async def asyncTearDown(self):
        await self.controller.close()
        self.temp.cleanup()

    async def test_no_motion_before_arm_and_one_owner(self):
        with self.assertRaises(ControllerError):
            await self.controller.command("owner-1", "start")
        await self.controller.arm("owner-1")
        with self.assertRaises(ControllerError):
            await self.controller.arm("owner-2")
        with self.assertRaises(ControllerError):
            await self.controller.command("owner-2", "speed", 2)

    async def test_absent_stale_and_malformed_measurements_block(self):
        self.controller.received_at["speed_kmh"] = time.monotonic() - 10
        before = self.controller.received_at["speed_kmh"]
        self.controller._data_notification(None, b"\x00")
        self.assertEqual(self.controller.received_at["speed_kmh"], before)
        with self.assertRaises(ControllerError):
            await self.controller.arm("owner-1")
        self.assertIsNone(self.controller.owner)

    async def test_start_minimum_pause_disarms(self):
        await self.controller.arm("owner-1")
        await self.controller.command("owner-1", "speed", 3.5)
        await self.controller.command("owner-1", "start")
        self.assertEqual(self.controller.telemetry["speed_kmh"], .5)
        await self.controller.command("owner-1", "pause")
        self.assertEqual(self.controller.telemetry["speed_kmh"], 0)
        self.assertIsNone(self.controller.owner)

    async def test_start_applies_explicit_selected_speed(self):
        await self.controller.arm("owner-1")
        await self.controller.command("owner-1", "start", 2)
        self.assertEqual(self.controller.telemetry["speed_kmh"], 2)
        commands = [event for event in self.controller.events if event["level"] == "command"]
        self.assertEqual([(event["action"], event["value"]) for event in commands[1:]],
                         [("speed", .5), ("start", 2), ("speed", 2)])

    async def test_full_manual_speed_range_and_invalid_start_before_write(self):
        await self.controller.arm("owner-1")
        before = sum(event["level"] == "command" for event in self.controller.events)
        with self.assertRaises(ControllerError):
            await self.controller.command("owner-1", "start", 16.1)
        self.assertEqual(before, sum(event["level"] == "command" for event in self.controller.events))
        await self.controller.command("owner-1", "start")
        for speed in (4, 8, 16):
            await self.controller.command("owner-1", "speed", speed)
            self.assertEqual(self.controller.telemetry["speed_kmh"], speed)
        with self.assertRaises(ControllerError):
            await self.controller.command("owner-1", "speed", 16.1)

    async def test_console_stop_during_start_prevents_selected_speed(self):
        controller = self.controller
        await controller.arm("owner-1")
        opcodes = []

        class StoppingClient:
            is_connected = True

            async def write_gatt_char(self, _characteristic, payload, response):
                opcodes.append(payload[0])
                if payload[0] == 7:
                    controller.sim_speed = .5
                    controller._sim_notification()
                    controller._status_notification(None, bytes([3]))
                controller._control_notification(None, bytes([0x80, payload[0], 1]))

            async def disconnect(self):
                pass

        controller.simulation = False
        controller.client = StoppingClient()
        with self.assertRaises(ControllerError):
            await controller.command("owner-1", "start", 2)
        self.assertEqual(opcodes, [2, 7])

    async def test_unobserved_start_stops_without_applying_selected_speed(self):
        controller = self.controller
        await controller.arm("owner-1")
        opcodes = []

        class UnmovingClient:
            is_connected = True

            async def write_gatt_char(self, _characteristic, payload, response):
                opcodes.append(payload[0])
                controller._control_notification(None, bytes([0x80, payload[0], 1]))

            async def disconnect(self):
                pass

        controller.simulation = False
        controller.client = UnmovingClient()
        with patch("poc.controller.START_OBSERVE_SECONDS", .03), self.assertRaisesRegex(ControllerError, "pas été observé"):
            await controller.command("owner-1", "start", 2)
        self.assertEqual(opcodes, [2, 7, 8])
        self.assertIsNone(controller.owner)

    async def test_watchdog_stops_after_screen_is_lost(self):
        await self.controller.arm("owner-1")
        await self.controller.command("owner-1", "start")
        self.controller.owner_heartbeat = time.monotonic() - 20
        await asyncio.sleep(.7)
        self.assertIsNone(self.controller.owner)
        self.assertEqual(self.controller.telemetry["speed_kmh"], 0)

    async def test_program_checks_all_blocks_before_motion(self):
        await self.controller.arm("owner-1")
        await self.controller.command("owner-1", "start")
        await self.controller.command("owner-1", "speed", 2)
        blocks = [{"duration_s":5,"speed_kmh":2,"incline_pct":0},
                  {"duration_s":5,"speed_kmh":8,"incline_pct":0}]
        before = len([event for event in self.controller.events if event["level"] == "command"])
        with self.assertRaises(ControllerError):
            await self.controller.run_workout("owner-1", blocks)
        self.assertIsNone(self.controller.workout_task)
        self.assertEqual(before, len([event for event in self.controller.events if event["level"] == "command"]))

    async def test_console_stop_disarms(self):
        await self.controller.arm("owner-1")
        self.controller._status_notification(None, bytes([3]))
        with self.assertRaises(ControllerError):
            await self.controller.command("owner-1", "start")

    async def test_restart_waits_for_late_stop_and_new_zero_speed(self):
        controller = self.controller
        await controller.arm("owner-1")
        await controller.command("owner-1", "start")
        await controller.command("owner-1", "stop")
        before = sum(event["level"] == "command" for event in controller.events)
        with self.assertRaisesRegex(ControllerError, "Fin de l'arrêt"):
            await controller.arm("owner-1")
        previous_deadline = controller.restart_after
        controller._status_notification(None, bytes.fromhex("0201"))
        self.assertGreaterEqual(controller.restart_after, previous_deadline)
        ready_time = controller.restart_after + .1
        with patch("poc.controller.time.monotonic", return_value=ready_time):
            # The pre-status zero measurement does not establish a completed stop.
            with self.assertRaisesRegex(ControllerError, "nouvelle mesure"):
                await controller.arm("owner-1")
            self.assertEqual(before, sum(event["level"] == "command" for event in controller.events))
        controller.restart_after = time.monotonic() - .1
        controller._sim_notification()
        await controller.arm("owner-1")
        await controller.command("owner-1", "start")
        self.assertEqual(controller.telemetry["speed_kmh"], .5)
        self.assertFalse(controller.desynchronized)

    async def test_stop_during_workout_command_waits_for_ack(self):
        controller = self.controller
        await controller.arm("owner-1")
        await controller.command("owner-1", "start")
        await controller.command("owner-1", "speed", 2)
        writing = asyncio.Event()
        opcodes = []

        class DelayedClient:
            is_connected = True

            async def write_gatt_char(self, _characteristic, payload, response):
                opcodes.append(payload[0])
                writing.set()
                await asyncio.sleep(.08)
                controller._control_notification(None, bytes([0x80, payload[0], 1]))

            async def disconnect(self):
                pass

        controller.simulation = False
        controller.client = DelayedClient()
        await controller.run_workout("owner-1", [{"duration_s":5,"speed_kmh":2,"incline_pct":0}])
        await asyncio.wait_for(writing.wait(), 1)
        await controller.halt("STOP pendant une commande")
        self.assertEqual(opcodes, [3, 8])
        self.assertFalse(controller.desynchronized)
        self.assertIsNone(controller.workout_task)
        self.assertIsNone(controller.owner)

    async def test_timeout_cannot_become_success_from_late_ack(self):
        controller = self.controller

        class SilentClient:
            is_connected = True

            async def write_gatt_char(self, _characteristic, _payload, response):
                pass

            async def disconnect(self):
                pass

        controller.simulation = False
        controller.client = SilentClient()
        with patch("poc.controller.COMMAND_TIMEOUT", .03), self.assertRaises(ControllerError):
            await controller._exchange("speed", 2)
        controller._control_notification(None, bytes.fromhex("800201"))
        self.assertTrue(controller.desynchronized)
        with self.assertRaises(ControllerError):
            await controller.arm("owner-1")

    async def test_wrong_opcode_does_not_acknowledge(self):
        controller = self.controller

        class WrongClient:
            is_connected = True

            async def write_gatt_char(self, _characteristic, _payload, response):
                controller._control_notification(None, bytes.fromhex("800301"))

            async def disconnect(self):
                pass

        controller.simulation = False
        controller.client = WrongClient()
        with patch("poc.controller.COMMAND_TIMEOUT", .03), self.assertRaises(ControllerError):
            await controller._exchange("speed", 2)
        self.assertTrue(controller.desynchronized)


if __name__ == "__main__":
    unittest.main()
