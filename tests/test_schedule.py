"""Contrats critiques du planning : isolation, bilans, révision et acceptation."""
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

from fastapi.testclient import TestClient

from backend.app import create_app
from backend.coach import schedule_guidance, tools
from backend.recording.metrics import VERSION
from backend.storage.models import RecordedSession
from tests.test_coach import Connected, completed


class ScheduleTests(unittest.TestCase):
    url = "/api/profiles/arnaud/schedule"
    date = date(2026, 11, 23)
    week = "2026-11-23"

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.app = create_app(data_root=Path(self.temp.name))
        self.db = self.app.state.database
        self.client = TestClient(self.app, base_url="http://127.0.0.1")
        self.runtime = self.app.state.coach
        self.runtime.connection = Connected()
        self.day = self.date
        clock = patch("backend.training.schedule.local_day", side_effect=lambda: self.day)
        clock.start()
        self.addCleanup(clock.stop)
        self.addCleanup(self.temp.cleanup)
        self.addCleanup(self.db.close)
        self.goal = {"description": "Faire trois sorties chaque semaine", "milestone": "Séances terminées",
                     "target_date": None, "revision": 0}
        self.assertEqual(self.client.patch("/api/profiles/arnaud/goal", json=self.goal).status_code, 200)
        self.contexts = []

    def request(self, **fields):
        return {"week": self.week, "availability": {"weekdays": [0, 1, 2, 3, 5], "minutes": 30, "venue": "both"},
                **fields}

    def spec(self, day, venue="treadmill"):
        return {"day": day, "minutes": 20, "name": f"Endurance {day}", "purpose": "Bouger à un effort facile.",
                "effort": 4, "venue": venue, "blocks": [
                    {"kind": kind, "sec": sec, "speed": 4, "incline": 0, "movement": "walk"}
                    for kind, sec in [("warmup", 300), ("steady", 600), ("cooldown", 300)]
                ] if venue == "treadmill" else []}

    def propose(self, *items, request=None, invalid_first=False):
        async def transport(_token, payload):
            self.contexts.append(json.loads(payload["input"][-1]["content"]))
            sessions = list(items) if not invalid_first or "erreur_de_validation" in self.contexts[-1] else [
                {**items[0], "day": "2026-11-22"}
            ]
            yield completed([{"type": "function_call", "name": schedule_guidance.TOOL, "arguments": json.dumps({
                "focus": "Retrouver le rythme", "explanation": "Des séances réparties selon les créneaux.",
                "phases": [], "sessions": sessions,
            })}])
        self.runtime.transport = transport
        return self.client.post(self.url + "/suggest", json=request or self.request())

    def accept(self, draft, placements=None, profile="arnaud"):
        if placements is None:
            placements = [{"slot": index, "day": item["day"]} for index, item in enumerate(draft["data"]["sessions"])]
        return self.client.post(f"/api/profiles/{profile}/schedule/{self.week}/accept",
                                json={"id": draft["id"], "placements": placements})

    def record(self, workout, mode="reel", phase="completed", feeling=4):
        identifier = uuid4().hex
        at = "2026-11-23T14:00:00.000+00:00"
        with self.db.write() as session:
            session.add(RecordedSession(id=identifier, profile_id="arnaud", mode=mode, started_at=at, closed_at=at,
                profile_snapshot={"id": "arnaud", "weight_kg": None}, workout_snapshot=workout,
                calculation_version=VERSION, checkpoint={"phase": phase, "active_s": 1200, "wall_s": 1200, "pause_s": 0},
                persisted_at=at, persisted_seq=0, lost_entries=0, feeling=feeling))
        return identifier

    def test_confirmed_week_routes_to_workouts_and_is_profile_scoped(self):
        response = self.propose(self.spec("2026-11-23"), self.spec("2026-11-24", "outdoor"), invalid_first=True)
        self.assertEqual(response.status_code, 200, response.text)
        self.assertIn("erreur_de_validation", self.contexts[-1])
        draft = response.json()
        self.assertIsNone(self.client.get(self.url).json()["plan"])
        self.assertEqual(self.accept(draft, profile="ophelie").status_code, 409)
        self.assertEqual(self.accept(draft, [{"slot": 0, "day": "2026-11-27"}]).status_code, 409)
        placements = [{"slot": 0, "day": "2026-11-25"}, {"slot": 1, "day": "2026-11-24"}]
        accepted = self.accept(draft, placements)
        self.assertEqual(accepted.status_code, 200, accepted.text)
        plan = accepted.json()["plan"]
        self.assertEqual([item["day"] for item in plan["sessions"]], ["2026-11-24", "2026-11-25"])
        workout = plan["sessions"][1]["workout"]
        self.assertEqual(workout["summary"]["sec"], 1200)
        self.assertEqual(self.accept(draft, placements).json()["plan"], plan)
        self.assertEqual(self.client.get("/api/profiles/arnaud/workouts").json()["workouts"], [])
        with self.db.transaction() as session:
            self.assertEqual(len(tools.profile_context(session, "arnaud", False)["training_schedule"]), 1)
            self.assertEqual(tools.profile_context(session, "ophelie", False)["training_schedule"], [])

    def test_adaptation_preserves_done_and_missed_and_reads_feedback(self):
        draft = self.propose(self.spec("2026-11-23"), self.spec("2026-11-24"),
                             self.spec("2026-11-25", "outdoor"), self.spec("2026-11-26")).json()
        initial = self.accept(draft).json()["plan"]["sessions"]
        report = self.record(initial[0]["workout"], feeling=8)
        self.record(initial[1]["workout"], mode="simulation")
        self.day = date(2026, 11, 25)
        outdoor = self.client.patch(f"{self.url}/{self.week}/outdoor/{initial[2]['id']}",
                                    json={"revision": 1, "minutes": 12, "km": 1.1, "feeling": 6})
        self.assertEqual(outdoor.status_code, 200, outdoor.text)
        self.assertEqual([item["status"] for item in outdoor.json()["plan"]["sessions"]],
                         ["done", "missed", "shortened", "planned"])
        revised = self.propose(self.spec("2026-11-28", "outdoor"), request=self.request(report_id=report))
        self.assertEqual(revised.status_code, 200, revised.text)
        new = revised.json()
        self.assertEqual(self.contexts[-1]["bilan_choisi"]["feeling"], 8)
        self.assertEqual(self.contexts[-1]["semaine_a_adapter"][1]["status"], "missed")
        self.assertEqual(self.contexts[-1]["semaine_a_adapter"][2]["manual"]["feeling"], 6)
        self.assertEqual([item["day"] for item in new["replaces"]], ["2026-11-26"])
        saved = self.accept(new).json()["plan"]["sessions"]
        self.assertEqual([item["id"] for item in saved[:3]], [item["id"] for item in initial[:3]])
        self.assertEqual(saved[3]["day"], "2026-11-28")
        self.assertEqual(saved[0]["report"]["id"], report)

    def test_updated_goal_or_feedback_requires_a_fresh_proposal(self):
        initial = self.accept(self.propose(self.spec("2026-11-23")).json()).json()
        record = self.record(initial["plan"]["sessions"][0]["workout"])
        self.day = date(2026, 11, 24)
        draft = self.propose(self.spec("2026-11-26"), request=self.request(report_id=record)).json()
        changed = self.client.patch(f"/api/profiles/arnaud/recordings/{record}/feeling", json={"feeling": 9})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(self.accept(draft).status_code, 409)
        draft = self.propose(self.spec("2026-11-26")).json()
        fresh_goal = self.client.patch("/api/profiles/arnaud/goal", json={**self.goal, "revision": 1, "description": "Récupérer"})
        self.assertEqual(fresh_goal.status_code, 200)
        self.assertEqual(self.accept(draft).status_code, 409)
        self.assertEqual(len(self.client.get(self.url).json()["plan"]["sessions"]), 1)

    def test_treadmill_budget_includes_automatic_cooldown(self):
        full = self.spec("2026-11-23")
        full["minutes"] = 30
        full["blocks"][1]["sec"] = 1200
        reply = self.propose(full)
        self.assertEqual(reply.status_code, 409)
        self.assertIn("retour au calme automatique", reply.json()["detail"])
        self.assertIsNone(self.client.get(self.url).json()["proposal"])

    def test_month_reads_both_sides_of_a_week_only_in_the_right_month_and_profile(self):
        self.week = "2026-11-30"
        self.day = date(2026, 11, 30)
        draft = self.propose(self.spec("2026-11-30"), self.spec("2026-12-02", "outdoor")).json()
        sessions = self.accept(draft).json()["plan"]["sessions"]
        self.record(sessions[0]["workout"], feeling=6)
        self.week = "2026-12-07"
        next_draft = self.propose(self.spec("2026-12-07", "outdoor")).json()
        self.assertEqual(self.accept(next_draft).status_code, 200)
        november = self.client.get(self.url + "/month?month=2026-11").json()
        self.assertEqual([(entry["day"], entry["status"]) for entry in november["sessions"]], [("2026-11-30", "done")])
        self.assertNotIn("workout", november["sessions"][0])
        self.day = date(2026, 12, 3)
        december = self.client.get(self.url + "/month").json()
        self.assertEqual([(entry["day"], entry["status"]) for entry in december["sessions"]],
                         [("2026-12-02", "missed"), ("2026-12-07", "planned")])
        self.assertEqual(self.client.get("/api/profiles/ophelie/schedule/month").json()["sessions"], [])
        self.assertEqual(self.client.get(self.url + "/month?month=2026-13").status_code, 409)
