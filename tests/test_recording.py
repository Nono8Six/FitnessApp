"""Brique 9 : calculs, conservation, isolation et erreurs de stockage."""
import asyncio
import json
import os
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from contextlib import closing, contextmanager
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from backend.app import create_app
from backend.recording import service
from backend.recording.metrics import calculate
from backend.storage.models import RecordedEntry, RecordedSession
from backend.training.profiles import ProfileUpdate, update_profile
from backend.training.workouts import WorkoutInput, create_workout, delete_workout

OWNER = "a" * 32
WORKOUT = WorkoutInput(name="Marche enregistrée", items=[{"kind": "steady", "sec": 30, "speed": 3.0, "incline": 1.0}])


def sample(t, active=None, speed=3.0, incline=1.0, counter=None, phase="running", block=0):
    return {"t": t, "active_s": t if active is None else active, "speed": speed, "incline": incline,
            "counter_m": t if counter is None else counter, "phase": phase, "block_index": block}


class CalculationTests(unittest.TestCase):
    def calculate(self, points, active, weight=80, blocks=1):
        return calculate(points, {"active_s": active, "pause_s": 3, "wall_s": points[-1]["t"] if points else 0}, weight, [{}] * blocks)

    def test_time_weighting_pause_and_energy_share_method(self):
        rows = [sample(0), sample(1, speed=6, incline=2), sample(3, speed=6, incline=2),
                sample(4, active=3, speed=0, phase="paused"), sample(7, active=3, speed=0, phase="paused")]
        m = self.calculate(rows, 3)
        self.assertEqual(m["speed_avg"], 5)
        self.assertEqual(m["incline_avg"], 1.67)
        self.assertEqual(m["coverage"]["speed"], 1)
        self.assertEqual(m["distance_m"], 4)
        # ACSM : une seconde à 3 km/h et 1 %, puis deux à 6 km/h et 2 %.
        expected = ((.1 * 50 + 1.8 * 50 * .01) * 80 / 200 / 60
                    + (.1 * 100 + 1.8 * 100 * .02) * 80 / 200 * 2 / 60)
        self.assertEqual(m["energy"]["active_kcal"], round(expected, 1))

    def test_gaps_resets_nulls_and_real_zero(self):
        rows = [sample(0), sample(1), sample(2, speed=None, incline=None, counter=0),
                sample(8), sample(9, speed=0, incline=0), sample(10, speed=0, incline=0, counter=0), sample(11, speed=0, incline=0)]
        m = self.calculate(rows, 11)
        self.assertEqual(m["valid_s"]["speed"], 4)
        self.assertEqual(m["speed_avg"], 1.5)
        self.assertEqual(m["distance_quality"], "partial")
        self.assertEqual(m["distance_m"], 13)
        self.assertEqual(m["coverage"]["speed"], round(4 / 11, 4))
        absent = self.calculate([sample(0, speed=None), sample(1, speed=None)], 1, weight=None)
        self.assertIsNone(absent["speed_avg"])
        self.assertIsNone(absent["energy"]["active_kcal"])
        self.assertEqual(absent["coverage"]["speed"], 0)
        zero = self.calculate([sample(0, speed=0, incline=0), sample(1, speed=0, incline=0)], 1)
        self.assertEqual(zero["speed_avg"], 0)
        self.assertEqual(zero["energy"]["active_kcal"], 0)

    def test_long_sessions_are_not_truncated_and_blocks_keep_durations(self):
        rows = [sample(t, block=0 if t <= 9000 else 1) for t in range(10801)]
        m = self.calculate(rows, 10800, blocks=2)
        self.assertEqual(m["active_s"], 10800)
        self.assertEqual(m["valid_s"]["speed"], 10800)
        self.assertEqual(m["distance_m"], 10800)
        self.assertEqual(sum(b["active_s"] for b in m["blocks"]), 10800)

    def test_no_data_never_becomes_zero(self):
        m = self.calculate([], 0)
        self.assertIsNone(m["speed_avg"])
        self.assertIsNone(m["distance_m"])
        self.assertIsNone(m["coverage"]["energy"])
        resting_then_run = self.calculate([sample(0, active=0, speed=0, phase="starting"),
                                            sample(1, active=0, speed=9), sample(2, active=1, speed=9)], 1)
        self.assertFalse(resting_then_run["energy"]["outside_range"])


class RecordingTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = create_app(simulation=True, data_root=self.root)
        self.db = self.app.state.database
        self.e = self.app.state.execution
        self.device = self.app.state.device
        await self.device.start()
        await self.e.start_runtime()
        await self.device.perform("scan")
        await self.device.perform("connect", "SIMULATION")
        with self.db.write() as s:
            update_profile(s, "arnaud", ProfileUpdate(weight_kg=80.0))
            self.workout = create_workout(s, "arnaud", WORKOUT)
        self.patches = [patch("backend.training.execution.STOP_SETTLE_SECONDS", .05), patch("backend.device.controller.STOP_SETTLE_SECONDS", .05)]
        for p in self.patches:
            p.start()

    async def asyncTearDown(self):
        await self.e.close()
        await self.device.close()
        self.db.close()
        for p in self.patches:
            p.stop()
        self.temp.cleanup()

    async def running(self):
        await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
        self.e.countdown_until = time.monotonic() - 1
        await self.wait("running")

    async def wait(self, phase):
        deadline = time.monotonic() + 8
        while self.e.phase != phase:
            self.e.heartbeat(OWNER)
            if time.monotonic() > deadline:
                self.fail(f"Phase {phase} non atteinte : {self.e.phase}")
            await asyncio.sleep(.05)

    def read(self):
        with self.db.transaction() as s:
            return service.read(s, "arnaud", self.e.id)

    async def test_live_recording_freezes_inputs_and_survives_program_deletion(self):
        await self.running()
        await asyncio.sleep(1.2)
        self.e.request_halt()
        await self.wait("stopped")
        await self.e.task
        self.e.recorder.update()
        await self.e.recorder.flush()
        self.assertEqual(self.e.recorder.status()["status"], "saved")
        with self.db.write() as s:
            update_profile(s, "arnaud", ProfileUpdate(weight_kg=90.0, name="Nom modifié"))
            delete_workout(s, "arnaud", self.workout["id"])
        data = self.read()
        self.assertEqual(data["profile"]["weight_kg"], 80)
        self.assertEqual(data["profile"]["name"], "Arnaud")
        self.assertEqual(data["workout"]["name"], WORKOUT.name)
        self.assertTrue(data["closed"])
        self.assertTrue(data["raw_count"] > 0)
        self.assertTrue(data["checkpoint"]["stop_confirmed"])
        self.assertEqual(data["metrics"], calculate(data["samples"], data["checkpoint"], 80, data["workout"]["blocks"]))
        with self.db.transaction() as s:
            raw = s.scalar(select(RecordedEntry).where(RecordedEntry.session_id == self.e.id, RecordedEntry.kind == "measurement"))
            self.assertTrue(raw.data["raw"])
            self.assertEqual(raw.source, "simulation")
            self.assertIn("quality", raw.data)
            self.assertTrue(raw.at.endswith("+00:00"))

    async def test_api_profile_isolation_feeling_validation_and_cascade(self):
        await self.running()
        self.e.request_halt()
        await self.wait("stopped")
        await self.e.task
        self.e.recorder.update()
        await self.e.recorder.flush()
        client = TestClient(self.app, base_url="http://127.0.0.1")
        path = f"/api/profiles/arnaud/recordings/{self.e.id}"
        self.assertEqual(client.get(path.replace("arnaud", "ophelie")).status_code, 404)
        self.assertEqual(client.patch(path.replace("arnaud", "ophelie") + "/feeling", json={"feeling": 7}).status_code, 404)
        self.assertEqual(client.get("/api/profiles/ophelie/recordings").json()["items"], [])
        for bad in [0, 11, True, "7", 7.5]:
            self.assertEqual(client.patch(path + "/feeling", json={"feeling": bad}).status_code, 422)
        for good in [1, 10, None, 7]:
            self.assertEqual(client.patch(path + "/feeling", json={"feeling": good}).json()["feeling"], good)
            self.assertEqual(client.get(path).json()["feeling"], good)
        self.assertEqual(client.request("DELETE", "/api/profiles/arnaud", json={}).status_code, 200)
        with self.db.transaction() as s:
            self.assertEqual(s.scalar(select(func.count()).select_from(RecordedSession)), 0)
            self.assertEqual(s.scalar(select(func.count()).select_from(RecordedEntry)), 0)

    async def test_failed_commit_keeps_buffer_and_durable_boundary_then_recovers(self):
        await self.running()
        self.e.recorder.update()
        await self.e.recorder.flush()
        before = self.e.recorder.persisted_s
        self.e.recorder.add("request", {"label": "À conserver"})
        @contextmanager
        def fail(_db):
            raise OSError("Disque plein simulé")
            yield
        with patch.object(type(self.db), "write", fail):
            with self.assertLogs("backend.recording.store", level="ERROR"):
                await self.e.recorder.flush()
            self.assertEqual(self.e.recorder.status()["status"], "error")
            self.assertEqual(self.e.recorder.persisted_s, before)
            self.assertTrue(self.e.recorder.queue)
            self.e.recorder.update()
            self.assertIn(self.e.phase, ("stopping", "stopped"))
        await self.wait("stopped")
        await self.e.task
        self.e.recorder.update()
        await self.e.recorder.flush()
        self.assertEqual(self.e.recorder.status()["status"], "saved")
        self.assertTrue(any(e["data"].get("label") == "À conserver" for e in self.read()["events"]))

    async def test_bounded_buffer_reports_loss_and_never_claims_saved(self):
        await self.running()
        self.e.recorder.update()
        await self.e.recorder.flush()
        with patch("backend.recording.store.BUFFER_LIMIT", 3):
            for _ in range(10):
                self.e.recorder.add("request", {"label": "Saturation simulée"})
            self.assertEqual(len(self.e.recorder.queue), 3)
            self.assertEqual(self.e.recorder.lost, 7)
            self.assertEqual(self.e.recorder.status()["status"], "error")
        self.e.recorder.update()
        await self.wait("stopped")
        await self.e.task
        self.e.recorder.update()
        await self.e.recorder.flush()
        self.assertEqual(self.read()["lost_entries"], 7)
        self.assertEqual(self.e.recorder.status()["status"], "error")
        previous = self.e.id
        await self.e.start(OWNER, "arnaud", self.workout["id"], 1)
        self.assertNotEqual(self.e.id, previous)
        self.assertEqual(self.e.recorder.lost, 0)


class CrashTests(unittest.TestCase):
    def test_actual_process_kill_then_restart_preserves_interrupted_session(self):
        with tempfile.TemporaryDirectory() as root:
            marker = Path(root) / "ready.json"
            child = subprocess.Popen([sys.executable, "-m", "tests.test_recording", "--crash-child", root, str(marker)],
                                     stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
            try:
                deadline = time.monotonic() + 20
                while not marker.exists() and time.monotonic() < deadline and child.poll() is None:
                    time.sleep(.1)
                if not marker.exists():
                    child.kill()
                    _, err = child.communicate(timeout=5)
                    self.fail(err.decode(errors="replace"))
                saved = json.loads(marker.read_text())
                # Le redirecteur Python .venv Windows peut posséder un enfant :
                # terminer le PID Python réel que notre scénario isolé publie.
                os.kill(saved["pid"], signal.SIGTERM)
                child.communicate(timeout=5)
                app = create_app(simulation=True, data_root=Path(root))
                try:
                    with app.state.database.transaction() as s:
                        data = service.read(s, "arnaud", saved["id"])
                    self.assertEqual(data["phase"], "interrupted")
                    self.assertFalse(data["checkpoint"]["stop_confirmed"])
                    self.assertTrue(data["closed"])
                    self.assertTrue(data["raw_count"] > 0)
                    self.assertGreaterEqual(len(data["samples"]), saved["sample_count"])
                    self.assertGreaterEqual(data["checkpoint"]["active_s"], saved["active_s"])
                    self.assertEqual(app.state.execution.phase, "idle")
                    self.assertTrue(app.state.device.controller.read_only)
                    self.assertEqual(app.state.device.controller.telemetry, {})
                    client = TestClient(app, base_url="http://127.0.0.1")
                    path = f'/api/profiles/arnaud/recordings/{data["id"]}'
                    self.assertEqual(client.patch(path + "/feeling", json={"feeling": 8}).status_code, 200)
                finally:
                    app.state.database.close()
                again = create_app(simulation=True, data_root=Path(root))
                try:
                    with again.state.database.transaction() as s:
                        self.assertEqual(service.read(s, "arnaud", saved["id"])["feeling"], 8)
                finally:
                    again.state.database.close()
                with closing(sqlite3.connect(Path(root) / "simulation" / "fitness.db")) as db:
                    self.assertEqual(db.execute("PRAGMA integrity_check").fetchone()[0], "ok")
                    self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
            finally:
                if child.poll() is None:
                    child.kill()
                    child.communicate(timeout=5)


async def crash_child(root, marker):
    app = create_app(simulation=True, data_root=Path(root))
    e, device, db = app.state.execution, app.state.device, app.state.database
    await device.start()
    await e.start_runtime()
    await device.perform("scan")
    await device.perform("connect", "SIMULATION")
    with db.write() as s:
        w = create_workout(s, "arnaud", WORKOUT)
    await e.start(OWNER, "arnaud", w["id"], 1)
    while True:
        e.heartbeat(OWNER)
        if e.phase == "running" and e.recorder.persisted_s > 6 and not Path(marker).exists():
            with db.transaction() as s:
                data = service.read(s, "arnaud", e.id)
            Path(marker).write_text(json.dumps({"id": e.id, "pid": os.getpid(), "sample_count": len(data["samples"]), "active_s": data["active_s"]}))
        await asyncio.sleep(.1)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--crash-child":
        asyncio.run(crash_child(sys.argv[2], sys.argv[3]))
    else:
        unittest.main()
