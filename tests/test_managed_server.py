"""Arrêt du vrai backend sur le canal privé du lanceur, sans données utilisateur."""
import json
import os
import socket
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import URLError
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parent.parent


class ManagedServerTests(unittest.TestCase):
    def start(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        env = {**os.environ, "FITNESS_DATA_DIR": temporary.name, "PYTHONUTF8": "1", "FITNESS_SERVER_INSTANCE": "test-managed"}
        process = subprocess.Popen(
            [os.sys.executable, "-u", "-m", "backend", "--managed", "--simulation", "--port", str(port)],
            cwd=ROOT, env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            text=True, encoding="utf-8",
        )

        def close():
            if not process.stdin.closed:
                process.stdin.close()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
            finally:
                process.stdout.close()
                process.stderr.close()

        self.addCleanup(close)
        url = f"http://127.0.0.1:{port}/api/health"
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            if process.poll() is not None:
                self.fail(process.stderr.read())
            try:
                with urlopen(url, timeout=0.5) as response:
                    self.assertEqual(json.load(response)["instance_id"], "test-managed")
                return process, url
            except (URLError, OSError):
                time.sleep(0.05)
        self.fail("Le backend n'est pas prêt sous 12 secondes.")

    def test_stop_is_graceful_and_unknown_command_does_not_stop(self):
        process, url = self.start()
        process.stdin.write("inconnue\n")
        process.stdin.flush()
        with urlopen(url, timeout=1) as response:
            self.assertEqual(response.status, 200)
        process.stdin.write("stop\n")
        process.stdin.flush()
        self.assertEqual(process.wait(timeout=10), 0)
        self.assertIn("non reconnue", process.stderr.read())
        with self.assertRaises(URLError):
            urlopen(url, timeout=0.5)

    def test_parent_channel_closed_stops_the_server(self):
        process, _url = self.start()
        process.stdin.close()
        self.assertEqual(process.wait(timeout=10), 0)


if __name__ == "__main__":
    unittest.main()
