"""Réception Windows du superviseur Rust compilé. Bases et ports isolés.

Exécuter après build-launcher.ps1 : .venv/Scripts/python.exe launcher/test_supervisor.py -v
"""
import json
import os
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.request import urlopen

from dev_bridge import ROOT, RustBridge


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            self.port = sock.getsockname()[1]
        self.url = f"http://127.0.0.1:{self.port}"
        self.env = {**os.environ, "FITNESS_LAUNCHER_PORT": str(self.port), "FITNESS_DATA_DIR": self.temporary.name}
        self.bridge = RustBridge(self.env)
        self.addCleanup(self.bridge.close)

    def invoke(self, command, **args):
        response = self.bridge.invoke({"command": command, **args})
        if "error" in response:
            self.fail(response["error"])
        return response["ok"]

    def wait(self, phase, *, can_stop=None):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            snapshot = self.invoke("get_snapshot")
            if (snapshot["phase"] == phase and (phase != "preparing" or snapshot["owned"])
                    and (can_stop is None or snapshot["can_stop"] == can_stop)):
                return snapshot
            if snapshot["phase"] == "error" and phase != "error":
                self.fail(json.dumps(snapshot, ensure_ascii=False))
            time.sleep(0.1)
        self.fail(f"État attendu absent : {phase}. {snapshot}")

    def start(self):
        self.invoke("start_server", options={"simulation": True, "network": False})
        return self.wait("running")

    def assert_integrity(self):
        with sqlite3.connect(Path(self.temporary.name) / "simulation" / "fitness.db") as conn:
            self.assertEqual(conn.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        conn.close()

    def test_start_stop_restart_keeps_data_and_unique_process(self):
        snapshot = self.start()
        self.assertTrue(snapshot["owned"])
        self.assertEqual(snapshot["mode"], "simulation")
        self.assertEqual(snapshot["url"], self.url)
        self.assertEqual(snapshot["phone_urls"], [])
        with urlopen(self.url + "/api/profiles") as response:
            before = json.load(response)
        self.invoke("start_server", options={"simulation": True, "network": False})
        self.assertEqual(self.invoke("get_snapshot")["pid"], snapshot["pid"])
        self.invoke("stop_server")
        self.wait("stopped")
        self.assert_integrity()
        self.start()
        with urlopen(self.url + "/api/profiles") as response:
            self.assertEqual(json.load(response), before)
        self.invoke("stop_server")
        self.wait("stopped")

    def test_closing_parent_stops_server_and_closes_database(self):
        self.start()
        self.bridge.close()
        self.assert_integrity()
        with socket.socket() as sock:
            self.assertNotEqual(sock.connect_ex(("127.0.0.1", self.port)), 0)

    def test_crashed_launcher_does_not_leave_python_orphan(self):
        self.start()
        self.bridge.process.kill()
        self.bridge.process.wait(timeout=5)
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            with socket.socket() as sock:
                if sock.connect_ex(("127.0.0.1", self.port)) != 0:
                    break
            time.sleep(0.1)
        else:
            self.fail("Le serveur détenu est resté actif après le crash du lanceur.")
        self.assert_integrity()

    def serve_external(self, fitness):
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                payload = {"app": "Fitness" if fitness else "Autre", "mode": "reel", "interface": True, "network": {"enabled": False, "addresses": []}}
                body = json.dumps(payload).encode()
                self.send_response(200)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *_args):
                pass

        server = ThreadingHTTPServer(("127.0.0.1", self.port), Handler)
        server.daemon_threads = True
        Thread(target=server.serve_forever, daemon=True).start()
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)

    def test_unverified_external_fitness_cannot_be_stopped_or_replaced(self):
        self.serve_external(True)
        self.wait("external")
        self.assertIn("error", self.bridge.invoke({"command": "stop_server"}))
        self.invoke("start_server", options={"simulation": True, "network": False})
        snapshot = self.wait("external")
        self.assertFalse(snapshot["owned"])
        self.assertFalse(snapshot["can_stop"])
        self.assertIsNone(snapshot["pid"])
        with urlopen(self.url + "/api/health") as response:
            self.assertEqual(json.load(response)["mode"], "reel")

    def start_console(self, env=None):
        process = subprocess.Popen(
            [os.sys.executable, "-m", "backend", "--simulation", "--port", str(self.port)],
            cwd=ROOT, env=env or self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )

        def close():
            if process.poll() is None:
                # Python 3.12 sous Windows peut être un redirecteur .venv avec un enfant.
                subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
                process.wait(timeout=5)

        self.addCleanup(close)
        return process

    def test_console_server_can_be_stopped_without_losing_data(self):
        process = self.start_console()
        snapshot = self.wait("external")
        self.assertFalse(snapshot["owned"])
        self.assertTrue(snapshot["can_stop"])
        with urlopen(self.url + "/api/health") as response:
            health = json.load(response)
        self.assertEqual(snapshot["pid"], health["pid"])
        control = Path(self.temporary.name) / "launcher" / "servers" / f'{health["pid"]}.json'
        self.assertTrue(control.is_file())
        with urlopen(self.url + "/api/profiles") as response:
            before = json.load(response)
        self.invoke("stop_server")
        self.wait("stopped")
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertFalse(control.exists())
        self.assert_integrity()
        self.start()
        with urlopen(self.url + "/api/profiles") as response:
            self.assertEqual(json.load(response), before)
        self.invoke("stop_server")
        self.wait("stopped")

    def test_closing_launcher_preserves_server_started_elsewhere(self):
        process = self.start_console()
        self.assertTrue(self.wait("external")["can_stop"])
        self.bridge.close()
        with urlopen(self.url + "/api/health") as response:
            self.assertEqual(json.load(response)["app"], "Fitness")
        self.assertIsNone(process.poll())
        self.bridge = RustBridge(self.env)
        self.addCleanup(self.bridge.close)
        self.assertTrue(self.wait("external")["can_stop"])
        self.invoke("stop_server")
        self.wait("stopped")
        self.assertEqual(process.wait(timeout=5), 0)
        self.assert_integrity()

    def test_console_channel_redirected_by_msix_is_verified_and_stoppable(self):
        self.bridge.close()
        self.env = {key: value for key, value in self.env.items() if key.upper() != "FITNESS_DATA_DIR"}
        self.env["LOCALAPPDATA"] = self.temporary.name
        self.bridge = RustBridge(self.env)
        self.addCleanup(self.bridge.close)
        redirected = Path(self.temporary.name) / "Packages" / "Fitness.Test" / "LocalCache" / "Local" / "FitnessApp"
        process = self.start_console({**self.env, "FITNESS_DATA_DIR": str(redirected)})
        snapshot = self.wait("external", can_stop=True)
        path = redirected / "launcher" / "servers" / f'{snapshot["pid"]}.json'
        self.assertTrue(path.is_file())
        primary = Path(self.temporary.name) / "FitnessApp" / "launcher" / "servers" / path.name
        self.assertFalse(primary.exists())
        original = json.loads(path.read_text(encoding="utf-8"))
        for field, value in [("instance_id", "ancienne-instance"), ("port", self.port + 1),
                             ("project_root", self.temporary.name), ("token", "invalide")]:
            with self.subTest(field=field):
                path.write_text(json.dumps({**original, field: value}), encoding="utf-8")
                self.wait("external", can_stop=False)
                self.assertIn("error", self.bridge.invoke({"command": "stop_server"}))
                self.assertIsNone(process.poll())
                path.write_text(json.dumps(original), encoding="utf-8")
                self.wait("external", can_stop=True)
        self.invoke("stop_server")
        self.wait("stopped")
        self.assertEqual(process.wait(timeout=5), 0)
        self.assertFalse(path.exists())
        with sqlite3.connect(redirected / "simulation" / "fitness.db") as connection:
            self.assertEqual(connection.execute("PRAGMA integrity_check").fetchone()[0], "ok")
        connection.close()

    def test_mismatched_project_or_instance_is_not_controllable(self):
        process = self.start_console()
        snapshot = self.wait("external", can_stop=True)
        path = Path(self.temporary.name) / "launcher" / "servers" / f'{snapshot["pid"]}.json'
        original = json.loads(path.read_text(encoding="utf-8"))
        for field, value in [("project_root", self.temporary.name), ("instance_id", "ancienne-instance"), ("port", self.port + 1)]:
            with self.subTest(field=field):
                path.write_text(json.dumps({**original, field: value}), encoding="utf-8")
                self.wait("external", can_stop=False)
                self.assertIn("error", self.bridge.invoke({"command": "stop_server"}))
                self.assertIsNone(process.poll())
                path.write_text(json.dumps(original), encoding="utf-8")
                self.wait("external", can_stop=True)
        self.invoke("stop_server")
        self.wait("stopped")
        self.assertEqual(process.wait(timeout=5), 0)

    def test_foreign_service_is_preserved_and_error_is_visible(self):
        self.serve_external(False)
        self.invoke("start_server", options={"simulation": True, "network": False})
        snapshot = self.wait("error")
        self.assertIn("occupé", snapshot["error"])
        self.assertFalse(snapshot["owned"])
        with urlopen(self.url) as response:
            self.assertEqual(json.load(response)["app"], "Autre")

    def test_cancel_preparation_does_not_start_backend(self):
        self.invoke("start_server", options={"simulation": True, "network": False})
        self.wait("preparing")
        self.invoke("stop_server")
        self.wait("stopped")
        time.sleep(0.3)
        with socket.socket() as sock:
            self.assertNotEqual(sock.connect_ex(("127.0.0.1", self.port)), 0)


if __name__ == "__main__":
    unittest.main()
