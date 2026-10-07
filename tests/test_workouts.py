"""Brique 3 : calculs, validation directe, versionnement et conservation des données."""
import copy
import tempfile
import unittest
from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient
from pydantic import ValidationError

from backend.app import create_app
from backend.storage.database import alembic_config, create_db_engine
from backend.training.workouts import WorkoutInput, preview

BASE = {"name": "Côtes", "items": [{"kind": "warmup", "sec": 300, "speed": 6, "incline": 0},
    {"repeat": 3, "steps": [{"kind": "run", "sec": 120, "speed": 9, "incline": 10},
                            {"kind": "recover", "sec": 60, "speed": 4, "incline": 0}]}]}
URL = "/api/profiles/arnaud/workouts"


class ValidationTests(unittest.TestCase):
    def test_expansion_order_timing_and_distance(self):
        result = preview(WorkoutInput.model_validate(BASE))
        self.assertEqual({k: result["summary"][k] for k in ("sec", "km", "count", "minSpeed", "maxSpeed")},
                         {"sec": 840, "km": 1.6, "count": 7, "minSpeed": 4, "maxSpeed": 9})
        self.assertEqual([b["kind"] for b in result["blocks"]], ["warmup", "run", "recover", "run", "recover", "run", "recover"])
        self.assertEqual([b["start"] for b in result["blocks"]], [0, 300, 420, 480, 600, 660, 780])
        self.assertEqual(result["blocks"][-1]["end"], 840)

    def test_exact_limits_and_one_beyond(self):
        data = {"name": "Limites", "items": [{"repeat": 120, "steps": [{"kind": "steady", "sec": 30, "speed": 16, "incline": 10}]}]}
        self.assertEqual(preview(WorkoutInput.model_validate(data))["summary"]["sec"], 3600)
        self.assertEqual(preview(WorkoutInput.model_validate(data))["summary"]["km"], 16)
        data["items"].append({"kind": "steady", "sec": 30, "speed": 1, "incline": 0})
        with self.assertRaisesRegex(ValidationError, "120 segments"):
            WorkoutInput.model_validate(data)
        data["items"] = [{"repeat": 2, "steps": [{"kind": "steady", "sec": 1801, "speed": 1, "incline": 0}]}]
        with self.assertRaisesRegex(ValidationError, "60 minutes"):
            WorkoutInput.model_validate(data)


class WorkoutApiTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.start()

    def start(self):
        self.app = create_app(data_root=self.root, dist=self.root / "no-build")
        self.client = TestClient(self.app, base_url="http://127.0.0.1:4330")

    def tearDown(self):
        self.app.state.database.close()
        self.tmp.cleanup()

    def create(self, data=None):
        response = self.client.post(URL, json=data or BASE)
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def test_crud_versions_authors_selection_and_restart(self):
        first = self.create()
        path = f"{URL}/{first['id']}"
        self.assertEqual(first["version"], 1)
        self.assertEqual(first["author"], "human")
        self.assertEqual(first["author_name"], "Arnaud")
        self.assertEqual(self.client.patch(URL + "/selection", json={"workout_id": first["id"]}).status_code, 200)
        self.client.patch("/api/profiles/arnaud", json={"name": "Arnaud renommé"})
        revised = {**BASE, "name": "Côtes longues", "base_version": 1}
        second = self.client.patch(path, json=revised)
        self.assertEqual(second.status_code, 200, second.text)
        versions = self.client.get(path + "/versions").json()
        self.assertEqual([v["version"] for v in versions], [2, 1])
        self.assertEqual(versions[1], first)
        self.assertEqual(versions[0]["author_name"], "Arnaud renommé")
        self.app.state.database.close()
        self.start()
        library = self.client.get(URL).json()
        self.assertEqual(library["selected_id"], first["id"])
        self.assertEqual(library["workouts"][0]["name"], "Côtes longues")
        other_client = TestClient(self.app, base_url="http://127.0.0.1:4330")
        self.assertEqual(other_client.get(URL).json(), library)
        response = self.client.post(path + "/duplicate", headers={"content-type": "application/json"})
        self.assertEqual(response.status_code, 201, response.text)
        duplicate = response.json()
        self.assertNotEqual(duplicate["id"], first["id"])
        self.assertEqual(duplicate["version"], 1)
        self.assertEqual(duplicate["items"], first["items"])
        deleted = self.client.delete(path, headers={"content-type": "application/json"})
        self.assertEqual(deleted.status_code, 200, deleted.text)
        library = self.client.get(URL).json()
        self.assertIsNone(library["selected_id"])
        self.assertEqual([w["id"] for w in library["workouts"]], [duplicate["id"]])
        with self.app.state.database.engine.connect() as conn:
            self.assertEqual(conn.exec_driver_sql("SELECT count(*) FROM workout_versions WHERE workout_id = ?", (first["id"],)).scalar(), 0)

    def test_profile_isolation_and_cascade(self):
        first = self.create()
        other = "/api/profiles/ophelie/workouts"
        second = self.client.post(other, json=BASE).json()
        self.assertEqual(self.client.get(other + "/" + first["id"]).status_code, 404)
        self.assertEqual(self.client.patch(other + "/selection", json={"workout_id": first["id"]}).status_code, 404)
        for suffix in ("", "/versions"):
            self.assertEqual(self.client.get(other + "/" + first["id"] + suffix).status_code, 404)
        self.assertEqual(self.client.post(other + "/" + first["id"] + "/duplicate", headers={"content-type": "application/json"}).status_code, 404)
        self.assertEqual(self.client.patch(other + "/" + first["id"], json={**BASE, "base_version": 1}).status_code, 404)
        self.assertEqual(self.client.delete(other + "/" + first["id"], headers={"content-type": "application/json"}).status_code, 404)
        self.client.patch(URL + "/selection", json={"workout_id": first["id"]})
        self.client.patch(other + "/selection", json={"workout_id": second["id"]})
        self.assertEqual(self.client.delete("/api/profiles/arnaud", headers={"content-type": "application/json"}).status_code, 200)
        self.assertEqual(self.client.get(other).json()["selected_id"], second["id"])
        with self.app.state.database.engine.connect() as conn:
            for table in ("workouts", "workout_versions", "workout_selections"):
                self.assertEqual(conn.exec_driver_sql(f"SELECT count(*) FROM {table}").scalar(), 1)
            self.assertEqual(conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall(), [])

    def test_stale_update_refused_without_losing_versions(self):
        first = self.create()
        path = f"{URL}/{first['id']}"
        update = {**BASE, "base_version": 1}
        self.assertEqual(self.client.patch(path, json=update).status_code, 200)
        self.assertEqual(self.client.patch(path, json=update).status_code, 409)
        self.assertEqual(len(self.client.get(path + "/versions").json()), 2)

    def test_invalid_direct_requests_do_not_write(self):
        cases = []
        for field, invalid_values in {"sec": [29, 3601, 30.5, True, "60", None],
                "speed": [0.99, 16.01, True, "5", None], "incline": [-0.1, 10.01, True, None],
                "kind": ["unknown"], "gait": ["unknown", None, 1]}.items():
            for value in invalid_values:
                data = copy.deepcopy(BASE); data["items"][0][field] = value; cases.append(data)
        for value in [0, -1, 121, 1.5, True, "3"]:
            data = copy.deepcopy(BASE); data["items"][1]["repeat"] = value; cases.append(data)
        cases.extend([{"name": " ", "items": BASE["items"]}, {"name": "Vide", "items": []},
                      {**BASE, "author": "chatgpt"}, {**BASE, "profile_id": "ophelie"},
                      {"name": "Imbriquée", "items": [{"repeat": 2, "steps": [BASE["items"][1]]}]}])
        for data in cases:
            with self.subTest(data=data):
                response = self.client.post(URL, json=data)
                self.assertEqual(response.status_code, 422, response.text)
                self.assertIsInstance(response.json()["detail"], str)
                self.assertLess(len(response.json()["detail"]), 200)
        self.assertEqual(self.client.get(URL).json()["workouts"], [])

    def test_preview_and_save_use_same_calculations_and_limits(self):
        expected = self.client.post(URL + "/preview", json=BASE)
        self.assertEqual(expected.status_code, 200, expected.text)
        saved = self.create()
        self.assertEqual(expected.json(), {k: saved[k] for k in ("blocks", "summary")})
        self.assertEqual(saved["blocks"][1]["incline"], 10)
        data = copy.deepcopy(BASE); data["items"][1]["steps"][0]["incline"] = 11
        response = self.client.post(URL, json=data)
        self.assertEqual(response.status_code, 422)
        self.assertIn("Pente : de 0 à 10 %", response.json()["detail"])
        data = copy.deepcopy(BASE); data["items"][1]["repeat"] = 60
        self.assertEqual(self.client.post(URL, json=data).status_code, 422)

    def test_selection_can_be_cleared(self):
        first = self.create()
        self.client.patch(URL + "/selection", json={"workout_id": first["id"]})
        response = self.client.patch(URL + "/selection", json={"workout_id": None})
        self.assertEqual(response.json(), {"selected_id": None})


class MigrationTests(unittest.TestCase):
    def test_upgrade_preserves_existing_profile_settings(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "reel").mkdir()
            engine = create_db_engine(root / "reel" / "fitness.db")
            with engine.begin() as conn:
                config = alembic_config(); config.attributes["connection"] = conn
                command.upgrade(config, "0002")
                conn.exec_driver_sql("INSERT INTO profiles VALUES ('ancien', 'Profil conservé', 7, 'pace', '2026-01-01', '2026-01-01')")
            engine.dispose()
            app = create_app(data_root=root, dist=root / "no-build")
            try:
                client = TestClient(app, base_url="http://127.0.0.1:4330")
                profiles = client.get("/api/profiles").json()
                self.assertEqual(len(profiles), 1)
                self.assertEqual(profiles[0]["name"], "Profil conservé")
                self.assertEqual(profiles[0]["weekly_goal"], 7)
                self.assertEqual(profiles[0]["speed_unit"], "pace")
                self.assertEqual(client.get("/api/health").json()["schema"], "0008")
            finally:
                app.state.database.close()


if __name__ == "__main__":
    unittest.main()
