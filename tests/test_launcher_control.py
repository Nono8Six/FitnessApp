"""Le canal d'arrêt reste local, authentifié et lié à une seule instance."""
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.launcher_control import LauncherControl


class LauncherControlTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.app = create_app(simulation=True, data_root=self.root)
        self.server = SimpleNamespace(should_exit=False)
        with patch("backend.launcher_control.data_root", return_value=self.root):
            self.control = LauncherControl(self.server, 4330, self.app.state.instance_id)
        self.app.state.launcher_control = self.control

    def client(self, host="127.0.0.1"):
        return TestClient(self.app, base_url="http://127.0.0.1:4330", client=(host, 50000))

    def test_local_authorized_request_stops_and_cleans_channel(self):
        with self.client() as client:
            self.assertTrue(self.control.path.is_file())
            health = client.get("/api/health").json()
            self.assertNotIn("token", health)
            response = client.post("/api/launcher/stop", json={"instance_id": self.control.instance_id},
                                   headers={"Authorization": f"Bearer {self.control.token}"})
            self.assertEqual(response.status_code, 202)
            self.assertTrue(self.server.should_exit)
        self.assertFalse(self.control.path.exists())

    def test_missing_secret_browser_origin_and_wrong_instance_are_refused(self):
        with self.client() as client:
            cases = [
                ({}, self.control.instance_id, 403),
                ({"Authorization": "Bearer incorrect"}, self.control.instance_id, 403),
                ({"Authorization": f"Bearer {self.control.token}", "Origin": "http://127.0.0.1:4330"}, self.control.instance_id, 403),
                ({"Authorization": f"Bearer {self.control.token}"}, "ancienne-instance", 409),
            ]
            for headers, instance_id, status in cases:
                with self.subTest(status=status, instance_id=instance_id):
                    response = client.post("/api/launcher/stop", json={"instance_id": instance_id}, headers=headers)
                    self.assertEqual(response.status_code, status)
                    self.assertFalse(self.server.should_exit)

    def test_network_request_is_refused_even_with_correct_secret(self):
        with self.client("192.168.1.20") as client:
            response = client.post("/api/launcher/stop", json={"instance_id": self.control.instance_id},
                                   headers={"Authorization": f"Bearer {self.control.token}"})
            self.assertEqual(response.status_code, 403)
            self.assertFalse(self.server.should_exit)
