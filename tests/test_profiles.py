"""Brique 2 : base SQLite par mode, migrations Alembic, profils et API."""

import shutil
import sqlite3
import tempfile
import unittest
from contextlib import contextmanager
from pathlib import Path

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.config import StartupError, data_dir
from alembic import command

from backend.storage import DATABASE_FILE, StorageError, open_database
from backend.storage.database import MIGRATIONS, alembic_config, create_db_engine

URL = "http://127.0.0.1:4330"
HEAD = "0008"


class ProfileTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / "donnees"
        self.dist = Path(self.tmp.name) / "dist"
        self.dist.mkdir()
        self.apps = []

    def tearDown(self):
        self.stop()
        self.tmp.cleanup()

    def start(self, simulation=False):
        app = create_app(simulation=simulation, data_root=self.root, dist=self.dist)
        self.apps.append(app)
        return TestClient(app, base_url=URL)

    def stop(self):
        """Équivaut à l'arrêt du serveur : toutes les connexions à la base sont fermées."""
        for app in self.apps:
            app.state.database.close()
        self.apps.clear()

    def restart(self, simulation=False):
        self.stop()
        return self.start(simulation)

    @contextmanager
    def db(self, mode="reel"):
        # Le contexte sqlite3 valide la transaction mais ne ferme pas la connexion.
        conn = sqlite3.connect(self.root / mode / DATABASE_FILE)
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    # ---------- Base et migrations ----------

    def test_migration_creates_database_from_scratch(self):
        self.assertFalse(self.root.exists())
        client = self.start()
        self.assertEqual(client.get("/api/health").json()["schema"], HEAD)
        with self.db() as conn:
            self.assertEqual(conn.execute("SELECT version_num FROM alembic_version").fetchall(), [(HEAD,)])
            columns = [row[1] for row in conn.execute("PRAGMA table_info(profiles)")]
        self.assertEqual(columns, ["id", "name", "weekly_goal", "speed_unit", "created_at", "updated_at", "weight_kg"])

    def test_connections_use_wal_and_foreign_keys(self):
        self.start()
        with self.apps[0].state.database.engine.connect() as conn:
            self.assertEqual(conn.exec_driver_sql("PRAGMA journal_mode").scalar(), "wal")
            self.assertEqual(conn.exec_driver_sql("PRAGMA foreign_keys").scalar(), 1)

    def test_database_constraints_reject_invalid_values(self):
        self.start()
        self.stop()
        with self.db() as conn:
            for statement in ("UPDATE profiles SET weekly_goal = 0", "UPDATE profiles SET weekly_goal = 15",
                              "UPDATE profiles SET speed_unit = 'mph'", "UPDATE profiles SET weight_kg = 0",
                              "UPDATE profiles SET weight_kg = 301"):
                with self.subTest(statement=statement), self.assertRaises(sqlite3.IntegrityError):
                    conn.execute(statement)

    def test_default_profiles_are_created_once(self):
        client = self.start()
        profiles = client.get("/api/profiles").json()
        self.assertEqual([(p["id"], p["name"], p["weekly_goal"], p["speed_unit"]) for p in profiles],
                         [("arnaud", "Arnaud", 3, "kmh"), ("ophelie", "Ophélie", 3, "kmh")])
        for profile in profiles:
            self.assertTrue(profile["created_at"].endswith("+00:00"))
            self.assertEqual(profile["created_at"], profile["updated_at"])
        client = self.restart()
        self.assertEqual(client.get("/api/profiles").json(), profiles)
        with self.db() as conn:
            self.assertEqual(conn.execute("SELECT COUNT(*) FROM profiles").fetchone()[0], 2)

    def test_changes_survive_restart(self):
        client = self.start()
        before = client.get("/api/profiles/ophelie").json()
        changed = client.patch("/api/profiles/ophelie", json={"weekly_goal": 5, "speed_unit": "pace"})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual((changed.json()["weekly_goal"], changed.json()["speed_unit"]), (5, "pace"))
        self.assertGreater(changed.json()["updated_at"], before["updated_at"])
        self.assertEqual(changed.json()["created_at"], before["created_at"])
        client = self.restart()
        self.assertEqual(client.get("/api/profiles/ophelie").json(), changed.json())
        self.assertEqual(client.get("/api/profiles/arnaud").json()["weekly_goal"], 3)

    def test_real_and_simulation_databases_are_separate(self):
        real = self.start()
        simulation = self.start(simulation=True)
        self.assertEqual(real.patch("/api/profiles/arnaud", json={"weekly_goal": 7}).status_code, 200)
        self.assertEqual(simulation.get("/api/profiles/arnaud").json()["weekly_goal"], 3)
        self.assertNotEqual(self.apps[0].state.database.path, self.apps[1].state.database.path)
        self.assertTrue((self.root / "reel" / DATABASE_FILE).is_file())
        self.assertTrue((self.root / "simulation" / DATABASE_FILE).is_file())

    def test_failed_migration_blocks_startup_and_leaves_database_intact(self):
        client = self.start()
        client.patch("/api/profiles/arnaud", json={"weekly_goal": 6})
        self.stop()
        broken = Path(self.tmp.name) / "migrations"
        shutil.copytree(MIGRATIONS, broken, ignore=shutil.ignore_patterns("__pycache__", "*.py[co]"))
        (broken / "versions" / "0002_cassee.py").write_text(
            "from alembic import op\nimport sqlalchemy as sa\n"
            f"revision = '9000'\ndown_revision = '{HEAD}'\n"
            "def upgrade():\n"
            "    op.create_table('essai', sa.Column('id', sa.Integer, primary_key=True))\n"
            "    op.execute('UPDATE profiles SET weekly_goal = 9')\n"
            "    raise RuntimeError('migration cassée')\n",
            encoding="utf-8",
        )
        with self.assertRaises(StorageError) as caught:
            open_database(self.root / "reel", broken)
        self.assertIn("migration cassée", str(caught.exception))
        self.assertIn("Le serveur ne démarre pas", str(caught.exception))
        with self.db() as conn:
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
            self.assertNotIn("essai", tables)
            self.assertEqual(conn.execute("SELECT version_num FROM alembic_version").fetchone()[0], HEAD)
            self.assertEqual(conn.execute("SELECT weekly_goal FROM profiles WHERE id = 'arnaud'").fetchone()[0], 6)

    def test_unreadable_or_newer_database_blocks_startup(self):
        self.start()
        self.stop()
        with self.db() as conn:
            conn.execute("UPDATE alembic_version SET version_num = '9999'")
        conn.close()
        with self.assertRaises(StorageError):
            create_app(data_root=self.root, dist=self.dist)
        (self.root / "simulation").mkdir()
        (self.root / "simulation" / DATABASE_FILE).write_bytes(b"pas une base sqlite" * 100)
        with self.assertRaises(StorageError):
            create_app(simulation=True, data_root=self.root, dist=self.dist)

    def test_data_directory_inside_repository_is_refused(self):
        repository = Path(__file__).resolve().parent.parent
        with self.assertRaises(StartupError):
            data_dir(simulation=False, root=repository / "donnees-test")
        self.assertFalse((repository / "donnees-test").exists())

    # ---------- API ----------

    def test_get_unknown_profile_is_404(self):
        response = self.start().get("/api/profiles/zoe")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.json()["detail"], "Profil introuvable")

    def test_patch_accepts_bounds(self):
        client = self.start()
        for goal in (1, 14):
            with self.subTest(goal=goal):
                response = client.patch("/api/profiles/arnaud", json={"weekly_goal": goal})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["weekly_goal"], goal)
        self.assertEqual(client.patch("/api/profiles/arnaud", json={"speed_unit": "pace"}).json()["speed_unit"], "pace")
        self.assertEqual(client.patch("/api/profiles/arnaud", json={"speed_unit": "kmh"}).json()["speed_unit"], "kmh")

    def test_patch_rejects_invalid_values(self):
        client = self.start()
        before = client.get("/api/profiles/arnaud").json()
        cases = {
            "zéro": {"weekly_goal": 0},
            "quinze": {"weekly_goal": 15},
            "négatif": {"weekly_goal": -1},
            "booléen": {"weekly_goal": True},
            "décimal": {"weekly_goal": 3.0},
            "texte": {"weekly_goal": "3"},
            "nul": {"weekly_goal": None},
            "unité inconnue": {"speed_unit": "mph"},
            "unité en majuscules": {"speed_unit": "KMH"},
            "champ inconnu": {"weekly_goal": 4, "theme": "clair"},
            "nom vide": {"name": "   "},
            "nom trop long": {"name": "x" * 41},
            "nom avec contrôle": {"name": "Arn\naud"},
            "nom non textuel": {"name": 3},
            "identifiant non modifiable": {"id": "autre"},
            "vide": {},
            "liste": [{"weekly_goal": 4}],
        }
        for label, body in cases.items():
            with self.subTest(label):
                response = client.patch("/api/profiles/arnaud", json=body)
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()["detail"], str)
        invalid_json = client.patch("/api/profiles/arnaud", content=b"{weekly_goal: 4", headers={"content-type": "application/json"})
        self.assertEqual(invalid_json.status_code, 422)
        self.assertEqual(client.get("/api/profiles/arnaud").json(), before)

    # ---------- Créer, renommer, supprimer ----------

    def test_weight_validation_persistence_and_removal(self):
        client = self.start()
        for value in [0, 19.9, 300.1, True, "75"]:
            response = client.patch("/api/profiles/arnaud", json={"weight_kg": value})
            self.assertEqual(response.status_code, 422, response.text)
            self.assertIn("Poids", response.json()["detail"])
        response = client.patch("/api/profiles/arnaud", content='{"weight_kg": NaN}', headers={"content-type": "application/json"})
        self.assertEqual(response.status_code, 422)
        for value in [20, 300, 75.5]:
            self.assertEqual(client.patch("/api/profiles/arnaud", json={"weight_kg": value}).json()["weight_kg"], value)
        client = self.restart()
        self.assertEqual(client.get("/api/profiles/arnaud").json()["weight_kg"], 75.5)
        self.assertIsNone(client.get("/api/profiles/ophelie").json()["weight_kg"])
        self.assertIsNone(client.patch("/api/profiles/arnaud", json={"weight_kg": None}).json()["weight_kg"])
        self.assertEqual(client.post("/api/profiles", json={"name": "Test poids", "weight_kg": 80}).json()["weight_kg"], 80)

    def create(self, client, **body):
        return client.post("/api/profiles", json=body)

    def test_create_profile_with_defaults_or_values(self):
        client = self.start()
        created = self.create(client, name="  Léa  ")
        self.assertEqual(created.status_code, 201)
        body = created.json()
        self.assertEqual((body["id"], body["name"], body["weekly_goal"], body["speed_unit"]), ("lea", "Léa", 3, "kmh"))
        other = self.create(client, name="Tom", weekly_goal=5, speed_unit="pace").json()
        self.assertEqual((other["id"], other["weekly_goal"], other["speed_unit"]), ("tom", 5, "pace"))
        self.assertEqual([p["id"] for p in client.get("/api/profiles").json()], ["arnaud", "ophelie", "lea", "tom"])
        client = self.restart()
        self.assertEqual(client.get("/api/profiles/lea").json(), body)

    def test_profile_ids_are_unique_and_stable(self):
        client = self.start()
        self.assertEqual(self.create(client, name="Léa").json()["id"], "lea")
        self.assertEqual(self.create(client, name="Lea").json()["id"], "lea-2")
        self.assertEqual(self.create(client, name="🏃").json()["id"], "profil")
        renamed = client.patch("/api/profiles/lea", json={"name": "Léa B."})
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual((renamed.json()["id"], renamed.json()["name"]), ("lea", "Léa B."))

    def test_names_are_unique_ignoring_case(self):
        client = self.start()
        for name in ("Arnaud", "ARNAUD", " ophélie ", "OPHÉLIE"):
            with self.subTest(name=name):
                response = self.create(client, name=name)
                self.assertEqual(response.status_code, 409)
                self.assertIn("déjà", response.json()["detail"])
        self.assertEqual(client.patch("/api/profiles/ophelie", json={"name": "arnaud"}).status_code, 409)
        self.assertEqual(client.patch("/api/profiles/arnaud", json={"name": "ARNAUD"}).json()["name"], "ARNAUD")
        self.assertEqual(len(client.get("/api/profiles").json()), 2)

    def test_create_rejects_invalid_bodies(self):
        client = self.start()
        for label, body in {
            "sans nom": {}, "nom vide": {"name": ""}, "espaces": {"name": "  "}, "41 caractères": {"name": "x" * 41},
            "tabulation": {"name": "a\tb"}, "nombre": {"name": 7}, "objectif 0": {"name": "Zoé", "weekly_goal": 0},
            "unité inconnue": {"name": "Zoé", "speed_unit": "mph"}, "identifiant imposé": {"name": "Zoé", "id": "zoe"},
            "horodatage": {"name": "Zoé", "created_at": "2020-01-01"},
        }.items():
            with self.subTest(label):
                response = client.post("/api/profiles", json=body)
                self.assertEqual(response.status_code, 422)
                self.assertIsInstance(response.json()["detail"], str)
        self.assertEqual(client.post("/api/profiles", json={"name": "x" * 40}).status_code, 201)
        self.assertEqual(client.post("/api/profiles", content='{"name": "Zoé"}'.encode(), headers={"content-type": "text/plain"}).status_code, 415)

    def test_delete_profile(self):
        client = self.start()
        self.create(client, name="Léa")
        deleted = client.request("DELETE", "/api/profiles/arnaud", headers={"content-type": "application/json"})
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual([p["id"] for p in deleted.json()], ["ophelie", "lea"])
        self.assertEqual(client.get("/api/profiles/arnaud").status_code, 404)
        self.assertEqual(client.request("DELETE", "/api/profiles/arnaud", headers={"content-type": "application/json"}).status_code, 404)
        # Le nom libéré peut resservir ; l'identifiant aussi, puisque les données de l'ancien profil ont disparu avec lui.
        self.assertEqual(self.create(client, name="Arnaud").json()["id"], "arnaud")

    def test_deleted_default_profile_is_not_recreated(self):
        client = self.start()
        client.request("DELETE", "/api/profiles/ophelie", headers={"content-type": "application/json"})
        client = self.restart()
        self.assertEqual([p["id"] for p in client.get("/api/profiles").json()], ["arnaud"])

    def test_last_profile_cannot_be_deleted(self):
        client = self.start()
        json_header = {"content-type": "application/json"}
        self.assertEqual(client.request("DELETE", "/api/profiles/ophelie", headers=json_header).status_code, 200)
        refused = client.request("DELETE", "/api/profiles/arnaud", headers=json_header)
        self.assertEqual(refused.status_code, 409)
        self.assertEqual(refused.json()["detail"], "Il faut garder au moins un profil")
        self.assertEqual(len(client.get("/api/profiles").json()), 1)

    def test_deleting_a_profile_deletes_its_data(self):
        """Règle des briques suivantes : une donnée de profil disparaît avec lui (clé étrangère en cascade)."""
        self.start()
        engine = self.apps[0].state.database.engine
        # Table d'essai créée puis annulée avec la transaction : le schéma réel reste intact.
        with engine.connect() as conn, conn.begin() as transaction:
            conn.exec_driver_sql("CREATE TABLE essai (id INTEGER PRIMARY KEY, "
                                 "profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE)")
            conn.exec_driver_sql("INSERT INTO essai (profile_id) VALUES ('arnaud'), ('ophelie')")
            conn.exec_driver_sql("DELETE FROM profiles WHERE id = 'arnaud'")
            self.assertEqual(conn.exec_driver_sql("SELECT profile_id FROM essai").fetchall(), [("ophelie",)])
            transaction.rollback()

    def test_upgrade_from_first_schema_keeps_profiles(self):
        """Une base livrée avec la révision 0001 passe à la suivante sans perdre ses profils."""
        path = self.root / "reel"
        path.mkdir(parents=True)
        engine = create_db_engine(path / DATABASE_FILE)
        config = alembic_config()
        with engine.begin() as conn:
            config.attributes["connection"] = conn
            command.upgrade(config, "0001")
            conn.exec_driver_sql("INSERT INTO profiles VALUES ('arnaud', 'Arnaud', 6, 'pace', 't', 't'), "
                                 "('ophelie', 'Ophélie', 3, 'kmh', 't', 't')")
        engine.dispose()
        client = self.start()
        self.assertEqual(client.get("/api/health").json()["schema"], HEAD)
        self.assertEqual([(p["id"], p["weekly_goal"]) for p in client.get("/api/profiles").json()], [("arnaud", 6), ("ophelie", 3)])

    def test_patch_unknown_profile_is_404(self):
        client = self.start()
        response = client.patch("/api/profiles/zoe", json={"weekly_goal": 4})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(client.get("/api/profiles").json()), 2)

    def test_write_methods_require_json(self):
        client = self.start()
        for headers in ({"content-type": "text/plain"}, {"content-type": "application/x-www-form-urlencoded"},
                        {"content-type": "application/jsonp"}, {}):
            with self.subTest(headers=headers):
                response = client.patch("/api/profiles/arnaud", content=b'{"weekly_goal": 4}', headers=headers)
                self.assertEqual(response.status_code, 415)
        self.assertEqual(client.patch("/api/profiles/arnaud", content=b'{"weekly_goal": 4}',
                                      headers={"content-type": "application/json; charset=utf-8"}).status_code, 200)
        self.assertEqual(client.post("/api/profiles", content=b"{}", headers={"content-type": "text/plain"}).status_code, 415)
        self.assertEqual(client.delete("/api/profiles/arnaud").status_code, 415)
        self.assertEqual(len(client.get("/api/profiles").json()), 2)

    def test_write_methods_limit_body_size(self):
        client = self.start()
        padding = " " * 16000
        response = client.patch("/api/profiles/arnaud", content=('{"weekly_goal": 4}' + padding).encode(),
                                headers={"content-type": "application/json"})
        self.assertEqual(response.status_code, 413)
        chunked = client.patch("/api/profiles/arnaud", content=iter([b'{"weekly_goal": 4}']),
                               headers={"content-type": "application/json"})
        self.assertEqual(chunked.status_code, 413)
        self.assertEqual(client.get("/api/profiles/arnaud").json()["weekly_goal"], 3)

    def test_foreign_origin_cannot_read_or_change_profiles(self):
        client = self.start()
        foreign = {"origin": "http://exemple.com"}
        self.assertEqual(client.get("/api/profiles", headers=foreign).status_code, 403)
        refused = client.patch("/api/profiles/arnaud", json={"weekly_goal": 9}, headers=foreign)
        self.assertEqual(refused.status_code, 403)
        self.assertEqual(client.get("/api/profiles/arnaud").json()["weekly_goal"], 3)
        same = client.patch("/api/profiles/arnaud", json={"weekly_goal": 9}, headers={"origin": URL})
        self.assertEqual(same.status_code, 200)


if __name__ == "__main__":
    unittest.main()
