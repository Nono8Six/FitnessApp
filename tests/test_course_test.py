"""Le raccourci UI réutilise le simulateur sans atteindre les données ou le BLE réels."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import create_app

OWNER = "a" * 32


class CourseTestTests(unittest.TestCase):
    def test_demo_is_forbidden_on_normal_real_and_simulation_apis(self):
        for simulation in (False, True):
            with self.subTest(simulation=simulation), tempfile.TemporaryDirectory() as root:
                app = create_app(simulation=simulation, data_root=Path(root))
                with TestClient(app, base_url="http://127.0.0.1") as client:
                    response = client.post("/api/execution/demo", json={"client_id": OWNER})
                    self.assertEqual(response.status_code, 404)
                    self.assertEqual(app.state.execution.phase, "idle")
                    self.assertEqual(app.state.device.controller.phase, "disconnected")
        with self.assertRaises(ValueError):
            create_app(course_test=True)

    def test_mounted_simulator_is_isolated_idempotent_and_cleaned_up(self):
        with tempfile.TemporaryDirectory() as root, patch("backend.device.controller.BleakScanner.discover") as scan, \
                patch("backend.device.controller.BleakClient") as bluetooth:
            app = create_app(data_root=Path(root))
            with TestClient(app, base_url="http://127.0.0.1") as client:
                paths = ["/api/profiles", "/api/profiles/arnaud/workouts", "/api/profiles/arnaud/recordings"]
                before = [client.get(path).json() for path in paths]
                health = client.get("/test-course/api/health")
                self.assertEqual(health.status_code, 200, health.text)
                self.assertEqual(health.json()["mode"], "simulation")
                test_data = Path(health.json()["data_dir"])
                self.assertNotEqual(test_data.parent, Path(root))
                self.assertTrue(test_data.is_dir())
                self.assertEqual(client.post("/test-course/api/execution/demo", json={"client_id": OWNER},
                                            headers={"origin": "https://other.example"}).status_code, 403)
                self.assertEqual(client.post("/test-course/api/execution/demo", json={"client_id": "invalid"}).status_code, 422)
                response = client.post("/test-course/api/execution/demo", json={"client_id": OWNER})
                self.assertEqual(response.status_code, 200, response.text)
                session = response.json()["session"]
                self.assertEqual(session["mode"], "simulation")
                self.assertEqual(session["phase"], "countdown")
                self.assertEqual(session["totals"]["energy"]["weight_kg"], 80)
                again = client.post("/test-course/api/execution/demo", json={"client_id": OWNER})
                self.assertEqual(again.json()["session"]["id"], session["id"])
                with client.websocket_connect(f"ws://127.0.0.1/test-course/api/execution/events?client_id={OWNER}",
                                              headers={"origin": "http://127.0.0.1"}) as ws:
                    feed = ws.receive_json()
                    self.assertEqual(feed["session"]["id"], session["id"])
                    self.assertTrue(feed["session"]["owned_by_me"])
                    self.assertEqual(feed["device"]["mode"], "simulation")
                self.assertEqual([client.get(path).json() for path in paths], before)
                self.assertEqual(app.state.execution.phase, "idle")
                self.assertEqual(app.state.device.controller.phase, "disconnected")
                scan.assert_not_called()
                bluetooth.assert_not_called()
            self.assertFalse(test_data.parent.exists(), "Les données jetables doivent être supprimées à l'arrêt")
