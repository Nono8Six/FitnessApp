"""Calculs ACSM, cohérence API et migration sans cascades accidentelles."""
import json
import tempfile
import unittest
from pathlib import Path

from alembic import command
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.storage.database import alembic_config, create_db_engine
from backend.training.workouts import WorkoutInput, preview


def step(speed=6, incline=0, gait="walk", sec=600):
    return dict(kind="steady", sec=sec, speed=speed, incline=incline, gait=gait)


def calculation(items, weight=80):
    return preview(WorkoutInput(name="Calcul", items=items), weight)["summary"]


class EnergyTests(unittest.TestCase):
    def test_reference_walking_running_and_grade(self):
        # 6 km/h = 100 m/min, 10 minutes, 80 kg : 40 actives + 14 repos.
        self.assertEqual(calculation([step()])["energy"]["active_kcal"], 40)
        self.assertEqual(calculation([step()])["energy"]["total_kcal"], 54)
        # Course 12 km/h : 0.2 * 200 * 80 / 200 * 10 = 160.
        self.assertEqual(calculation([step(12, gait="run")])["energy"]["active_kcal"], 160)
        slope = calculation([step(incline=10)])
        self.assertEqual(slope["energy"]["active_kcal"], 112)
        self.assertEqual(slope["energy"]["total_kcal"], 126)
        self.assertEqual(slope["ascent_m"], 99.5)

    def test_repeat_expansion_weight_and_missing_weight(self):
        items = [{"repeat": 3, "steps": [step(sec=60), step(12, 10, "run", 60)]}]
        result = calculation(items)
        self.assertEqual(result["energy"]["active_kcal"], 81.6)
        self.assertEqual(result["energy"]["total_kcal"], 90)
        self.assertEqual(calculation(items, 40)["energy"]["active_kcal"], 40.8)
        missing = calculation(items, None)
        self.assertIsNone(missing["energy"]["active_kcal"])
        self.assertIsNone(missing["energy"]["total_kcal"])
        self.assertEqual(missing["ascent_m"], result["ascent_m"])

    def test_gait_override_and_validity_flags(self):
        for speed, gait, outside in [(3, "walk", False), (6, "walk", False), (2.9, "walk", True),
                                     (6.1, "walk", True), (8, "run", True), (8.04, "run", False), (16, "run", False)]:
            with self.subTest(speed=speed, gait=gait):
                self.assertEqual(calculation([step(speed, gait=gait)])["energy"]["outside_range"], outside)
        auto = calculation([step(6, gait="auto")])["energy"]
        self.assertTrue(auto["automatic_gait"])
        self.assertEqual(auto["active_kcal"], 40)
        self.assertEqual(calculation([step(6, gait="run")])["energy"]["active_kcal"], 80)
        self.assertFalse(calculation([step()])["energy"]["automatic_gait"])

    def test_migration_and_api_keep_versions_selection_and_profile_data(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); (root / "reel").mkdir()
            engine = create_db_engine(root / "reel" / "fitness.db")
            legacy = [{k: v for k, v in step().items() if k != "gait"}]
            with engine.begin() as conn:
                config = alembic_config(); config.attributes["connection"] = conn
                command.upgrade(config, "0003")
                conn.exec_driver_sql("INSERT INTO profiles VALUES ('a', 'Ancien', 7, 'pace', 't', 't'), ('b', 'Autre', 3, 'kmh', 't', 't')")
                conn.exec_driver_sql("INSERT INTO workouts VALUES ('w', 'a', 't')")
                for version in (1, 2):
                    conn.exec_driver_sql("INSERT INTO workout_versions VALUES ('w', ?, 'Marche', 'human', 'Ancien', ?, 't')", (version, json.dumps(legacy)))
                conn.exec_driver_sql("INSERT INTO workout_selections VALUES ('a', 'w')")
            engine.dispose()
            app = create_app(data_root=root, dist=root / "absent")
            try:
                client = TestClient(app, base_url="http://127.0.0.1:4330")
                url = "/api/profiles/a/workouts"
                profile = client.get("/api/profiles/a").json()
                self.assertEqual((profile["weekly_goal"], profile["speed_unit"], profile["weight_kg"]), (7, "pace", None))
                library = client.get(url).json()
                self.assertEqual(library["selected_id"], "w")
                self.assertIsNone(library["workouts"][0]["summary"]["energy"]["active_kcal"])
                self.assertEqual(client.patch("/api/profiles/a", json={"weight_kg": 80}).status_code, 200)
                before = client.get(url + "/w").json()
                expected = client.post(url + "/preview", json={"name": "Marche", "items": legacy}).json()
                self.assertEqual(before["summary"], expected["summary"])
                self.assertEqual(before["summary"]["energy"]["active_kcal"], 40)
                self.assertIsNone(client.post("/api/profiles/b/workouts/preview", json={"name": "Marche", "items": legacy}).json()["summary"]["energy"]["active_kcal"])
                client.patch("/api/profiles/a", json={"weight_kg": 40})
                versions = client.get(url + "/w/versions").json()
                self.assertEqual([v["version"] for v in versions], [2, 1])
                self.assertTrue(all(v["items"] == legacy and v["summary"]["energy"]["active_kcal"] == 20 for v in versions))
                # Poids actuel : recalcul de prévision uniquement, aucun snapshot réécrit.
                client.patch("/api/profiles/a", json={"weight_kg": None})
                self.assertIsNone(client.get(url + "/w").json()["summary"]["energy"]["active_kcal"])
                with app.state.database.engine.connect() as conn:
                    self.assertEqual(conn.exec_driver_sql("PRAGMA foreign_key_check").fetchall(), [])
            finally:
                app.state.database.close()


if __name__ == "__main__":
    unittest.main()
