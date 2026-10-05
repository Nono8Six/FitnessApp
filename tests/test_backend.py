"""Brique 1 : serveur de l'application, fichiers de l'interface et isolation des données."""

import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient

from backend import __version__
from backend.app import create_app


class BackendTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        root = Path(self.tmp.name)
        self.data_root = root / "donnees"
        self.dist = root / "dist"
        (self.dist / "assets").mkdir(parents=True)
        (self.dist / "index.html").write_text("<!doctype html><title>Fitness</title>", encoding="utf-8")
        (self.dist / "assets" / "index-abc.js").write_text("console.log(1)", encoding="utf-8")
        (self.dist / "icon.svg").write_text("<svg/>", encoding="utf-8")
        (self.dist / ".fitness-source.sha256").write_text("empreinte locale", encoding="utf-8")
        self.apps = []

    def tearDown(self):
        # Les connexions SQLite sont fermées avant la suppression (Windows refuse un fichier ouvert).
        for app in self.apps:
            app.state.database.close()
        self.tmp.cleanup()

    def client(self, **kwargs):
        options = {"data_root": self.data_root, "dist": self.dist, **kwargs}
        app = create_app(**options)
        self.apps.append(app)
        return TestClient(app, base_url="http://127.0.0.1:4330")

    def test_health_reports_version_mode_and_data_dir(self):
        body = self.client().get("/api/health").json()
        self.assertEqual(body["version"], __version__)
        self.assertEqual(body["mode"], "reel")
        self.assertEqual(Path(body["data_dir"]), self.data_root / "reel")
        self.assertTrue(body["interface"])
        self.assertFalse(body["network"]["enabled"])
        self.assertEqual(body["schema"], "0005")

    def test_simulation_data_is_separate(self):
        body = self.client(simulation=True).get("/api/health").json()
        self.assertEqual(body["mode"], "simulation")
        self.assertEqual(Path(body["data_dir"]), self.data_root / "simulation")
        self.assertTrue((self.data_root / "simulation").is_dir())
        self.assertFalse((self.data_root / "reel").exists())

    def test_interface_files_and_cache_policy(self):
        client = self.client()
        index = client.get("/")
        self.assertEqual(index.status_code, 200)
        self.assertIn("Fitness", index.text)
        self.assertEqual(index.headers["cache-control"], "no-store")
        self.assertIn("default-src 'self'", index.headers["content-security-policy"])
        asset = client.get("/assets/index-abc.js")
        self.assertEqual(asset.status_code, 200)
        self.assertIn("immutable", asset.headers["cache-control"])
        self.assertEqual(client.get("/icon.svg").status_code, 200)

    def test_only_build_files_are_served(self):
        client = self.client()
        for path in ("/assets/../index.html", "/assets/absent.js", "/requirements.txt", "/..%2Fbackend%2Fapp.py", "/.fitness-source.sha256"):
            with self.subTest(path=path):
                self.assertIn(client.get(path).status_code, (404,))

    def test_missing_build_is_explicit(self):
        (self.dist / "index.html").unlink()
        response = self.client().get("/")
        self.assertEqual(response.status_code, 503)
        self.assertIn("Interface non construite", response.text)
        self.assertIn("style-src 'self' 'sha256-", response.headers["content-security-policy"])
        self.assertFalse(self.client().get("/api/health").json()["interface"])

    def test_unknown_api_route_is_json_404(self):
        response = self.client().get("/api/inconnue")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Route inconnue")

    def test_foreign_origin_and_host_are_rejected(self):
        client = self.client()
        refused = client.get("/api/health", headers={"origin": "http://exemple.com"})
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(refused.headers["cache-control"], "no-store")
        self.assertEqual(client.get("/api/health", headers={"origin": "http://127.0.0.1:4330"}).status_code, 200)
        self.assertEqual(client.get("/api/health", headers={"host": "exemple.com"}).status_code, 400)


if __name__ == "__main__":
    unittest.main()
