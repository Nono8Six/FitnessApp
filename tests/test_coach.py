"""Brique 5 : données, isolation, flux et cache. Aucun appel à OpenAI dans ces tests."""
import asyncio
import json
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from uuid import uuid4

import httpx2 as httpx
from fastapi.testclient import TestClient
from sqlalchemy import select
from alembic import command
from backend.storage.database import alembic_config

from backend.app import create_app
from backend.coach import inference, store, tools
from backend.coach.runtime import Runtime
from backend.storage.models import CoachTurn, Profile
from backend.training import workouts
from backend.training.profiles import ProfileUpdate, update_profile


class Connected:
    valid = True
    refreshes = 0
    def inference_credentials(self, **kwargs):
        if kwargs.get("refresh"):
            self.refreshes += 1
        return "SECRET_ACCESS", "gpt-5.6-luna", (0, "account")
    def inference_valid(self, identity):
        return self.valid


def completed(output=None):
    return {"type": "response.completed", "response": {"status": "completed", "output": output or [],
        "usage": {"input_tokens": 2000, "output_tokens": 50, "input_tokens_details": {"cached_tokens": 1024}}}}


class CoachDataTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(data_root=Path(self.tmp.name))
        self.db = self.app.state.database
        self.client = TestClient(self.app, base_url="http://127.0.0.1")
        with self.db.write() as s:
            self.conversation = store.create_conversation(s, "arnaud")["id"]
            self.workout = workouts.create_workout(s, "arnaud", workouts.WorkoutInput(name="Courte semaine", items=[
                {"kind": "steady", "sec": 600, "speed": 4., "incline": 1.}]))

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def reserve(self, key=None, text="Bonjour"):
        with self.db.write() as s:
            return store.reserve(s, "arnaud", self.conversation, store.Send(request_id=key or uuid4().hex, text=text))

    def tool(self, name, data=None, profile="arnaud"):
        return tools.execute(self.db, profile, name, json.dumps(data or {}), user_text="Retiens que je préfère vingt minutes.")

    def test_profile_scope_conversations_memories_and_tools(self):
        with self.db.write() as s:
            store.save_memory(s, "arnaud", store.MemoryInput(content="Préférence privée"))
        base = "/api/profiles/ophelie/coach"
        self.assertEqual(self.client.get(base + "/conversations").json()["total"], 0)
        self.assertEqual(self.client.get(base + "/memories").json()["total"], 0)
        self.assertEqual(self.client.get(base + "/conversations/" + self.conversation).status_code, 404)
        self.assertIn("error", self.tool("get_workout", {"workout_id": self.workout["id"]}, "ophelie"))
        self.assertIn("error", self.tool("read_conversation", {"conversation_id": self.conversation}, "ophelie"))
        self.assertIn("error", self.tool("get_profile", {"profile_id": "ophelie"}))
        self.assertIn("error", self.tool("execute_sql", {"query": "select * from profiles"}))

    def test_idempotency_and_concurrent_profile_reservation(self):
        key = uuid4().hex
        with ThreadPoolExecutor(2) as pool:
            results = list(pool.map(lambda _: self.reserve(key), range(2)))
        self.assertEqual(sum(fresh for _, fresh in results), 1)
        self.assertEqual(results[0][0]["id"], results[1][0]["id"])
        with self.assertRaises(store.CoachConflict):
            self.reserve(text="Autre demande concurrente")
        with self.assertRaises(store.CoachConflict):
            self.reserve(key, "Message remplacé")

    def test_read_only_detailed_versions_and_backend_estimates(self):
        with self.db.write() as s:
            update_profile(s, "arnaud", ProfileUpdate(weight_kg=80.))
            updated = workouts.update_workout(s, "arnaud", self.workout["id"], workouts.WorkoutUpdate(
                name="Autre nom", base_version=1, items=[{"kind": "steady", "sec": 1200, "speed": 5., "incline": 2.}]))
            workouts.select_workout(s, "arnaud", self.workout["id"])
        detail = self.tool("get_workout", {"workout_id": updated["id"], "version": 1})
        with self.db.transaction() as s:
            expected = workouts.versions(s, "arnaud", updated["id"])[1]
        self.assertEqual(detail["items"], expected["items"])
        self.assertEqual(detail["summary"], expected["summary"])
        self.assertNotIn("blocks", detail)  # Pas de duplication du programme pour le quota.
        versions = self.tool("list_versions", {"workout_id": updated["id"], "limit": 1})
        self.assertEqual((versions["total"], versions["next_offset"], versions["partial"]), (2, 1, True))
        self.assertEqual(self.tool("get_profile")["selected_workout_id"], updated["id"])
        self.assertFalse(self.tool("get_profile")["activities"]["available"])
        self.assertEqual(self.tool("list_workouts", {"query": "' OR 1=1 --"})["total"], 0)

    def test_old_conversations_search_and_full_text_pagination(self):
        turn, _ = self.reserve(text="Conseil très ancien")
        with self.db.write() as s:
            store.save_turn(s, "arnaud", turn["id"], answer="a" * 3500 + "FIN", status="completed")
        self.assertEqual(self.tool("search_conversations", {"query": "ancien"})["total"], 1)
        excerpt = self.tool("read_conversation", {"conversation_id": self.conversation})["items"][0]
        self.assertTrue(excerpt["answer_partial"])
        self.assertEqual(self.tool("read_message", {"turn_id": turn["id"], "offset": 3500})["answer"], "FIN")
        self.assertIn("error", self.tool("read_message", {"turn_id": turn["id"]}, "ophelie"))

    def test_archive_hides_without_losing_exchanges(self):
        base = "/api/profiles/arnaud/coach/conversations"
        turn, _ = self.reserve(text="Conseil à archiver")
        self.assertEqual(self.client.patch(f"{base}/{self.conversation}", json={"archived": True}).status_code, 409)
        with self.db.write() as s:
            store.save_turn(s, "arnaud", turn["id"], answer="Réponse", status="completed")
        self.assertEqual(self.client.patch(f"/api/profiles/ophelie/coach/conversations/{self.conversation}", json={"archived": True}).status_code, 404)
        self.assertEqual(self.client.patch(f"{base}/{self.conversation}", json={"archived": "oui"}).status_code, 422)
        archived = self.client.patch(f"{base}/{self.conversation}", json={"archived": True}).json()
        self.assertIsNotNone(archived["archived_at"])
        self.assertEqual(self.client.get(base).json()["total"], 0)
        self.assertEqual(self.client.get(base, params={"archived": True}).json()["items"][0]["id"], self.conversation)
        self.assertEqual(self.client.get(f"{base}/{self.conversation}").json()["items"][0]["answer"], "Réponse")
        self.assertEqual(self.tool("search_conversations", {"query": "archiver"})["total"], 1)
        self.reserve(text="Je reprends")
        self.assertEqual(self.client.get(base).json()["total"], 1)
        self.assertIsNone(self.client.get(base).json()["items"][0]["archived_at"])

    def test_memory_requires_user_write_and_proposal_ownership(self):
        proposal = self.tool("propose_memory", {"content": "Séances de vingt minutes", "quote": "je préfère vingt minutes"})
        self.assertFalse(proposal["saved"])
        self.assertEqual(self.tool("search_memories")["total"], 0)
        self.assertIn("error", self.tool("propose_memory", {"content": "Fatigue durable", "quote": "citation inventée"}))
        turn, _ = self.reserve()
        with self.db.write() as s:
            store.save_turn(s, "arnaud", turn["id"], proposals=[proposal["proposal"]], status="completed")
        payload = {"content": "Texte corrigé par l'utilisateur", "source_turn_id": turn["id"], "proposal_index": 0}
        url = "/api/profiles/arnaud/coach/memories"
        first = self.client.post(url, json=payload)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(self.client.post(url, json=payload).json()["id"], first.json()["id"])
        self.assertEqual(self.client.post("/api/profiles/ophelie/coach/memories", json=payload).status_code, 404)
        self.assertEqual(self.client.patch(url + "/" + first.json()["id"], json={"content": "Corrigé"}).json()["content"], "Corrigé")
        self.assertEqual(self.client.request("DELETE", url + "/" + first.json()["id"], json={}).status_code, 200)

    def test_restart_preserves_partial_and_sport_data(self):
        turn, _ = self.reserve()
        with self.db.write() as s:
            store.save_turn(s, "arnaud", turn["id"], answer="Texte partiel")
        self.db.close()
        self.app = create_app(data_root=Path(self.tmp.name))
        self.db = self.app.state.database
        with self.db.transaction() as s:
            recovered = store.turns(s, "arnaud", self.conversation)["items"][0]
            self.assertEqual((recovered["status"], recovered["answer"]), ("interrupted", "Texte partiel"))
            self.assertEqual(workouts.get_workout(s, "arnaud", self.workout["id"])["items"], self.workout["items"])

    def test_profile_delete_cascades(self):
        self.reserve()
        with self.db.write() as s:
            store.save_memory(s, "arnaud", store.MemoryInput(content="À supprimer avec le profil"))
            s.delete(s.get(Profile, "arnaud"))
        with self.db.transaction() as s:
            self.assertEqual(list(s.scalars(select(CoachTurn))), [])

    def test_migration_from_brick_four_preserves_sport_tables(self):
        # Base de test uniquement : revenir au schéma réellement présent avant cette brique.
        config = alembic_config()
        with self.db.engine.begin() as connection:
            config.attributes["connection"] = connection
            command.downgrade(config, "0004")
        self.db.close()
        self.app = create_app(data_root=Path(self.tmp.name))
        self.db = self.app.state.database
        self.assertEqual(self.db.schema, "0006")
        with self.db.transaction() as session:
            self.assertEqual(workouts.get_workout(session, "arnaud", self.workout["id"]), self.workout)
            self.assertEqual(store.conversations(session, "arnaud")["total"], 0)

    def test_http_stream_and_idempotent_retry(self):
        runtime = self.app.state.coach
        runtime.connection = Connected()
        calls = []
        async def transport(token, payload):
            calls.append(1)
            yield {"type": "response.output_text.delta", "delta": "Bonjour Arnaud"}
            yield completed()
        runtime.transport = transport
        payload = {"text": "Bonjour", "request_id": uuid4().hex}
        url = f"/api/profiles/arnaud/coach/conversations/{self.conversation}/messages"
        with TestClient(self.app, base_url="http://127.0.0.1") as client:
            response = client.post(url, json=payload)
            self.assertEqual(response.status_code, 200)
            self.assertIn("text/event-stream", response.headers["content-type"])
            self.assertNotIn("content-encoding", response.headers)
            self.assertIn('"status": "completed"', response.text)
            self.assertNotIn("SECRET", response.text)
            self.assertEqual(client.post(url, json=payload).status_code, 200)
            self.assertEqual(len(calls), 1)
            self.assertEqual(client.post(url.replace("arnaud", "ophelie"), json=payload).status_code, 404)
            result = client.get(url.removesuffix("/messages")).json()
            self.assertEqual((result["total"], result["items"][0]["answer"]), (1, "Bonjour Arnaud"))


class CoachStreamTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.app = create_app(data_root=Path(self.tmp.name))
        self.db = self.app.state.database
        self.connection = Connected()
        self.runtime = Runtime(self.db, self.connection)
        with self.db.write() as s:
            self.conversation = store.create_conversation(s, "arnaud")["id"]

    async def asyncTearDown(self):
        await self.runtime.close()
        self.db.close()
        self.tmp.cleanup()

    async def run_turn(self):
        turn, fresh = await self.runtime.start("arnaud", self.conversation, store.Send(request_id=uuid4().hex, text="Conseil ?"))
        frames = [frame async for frame in self.runtime.stream("arnaud", turn, fresh)]
        return json.loads(frames[-1][6:]), frames

    async def test_tools_stream_usage_and_stable_cache_prefix(self):
        payloads = []
        async def transport(token, payload):
            self.assertEqual(token, "SECRET_ACCESS")
            payloads.append(json.loads(json.dumps(payload)))
            if len(payloads) == 1:
                yield completed([{"type": "function_call", "namespace": "fitness", "name": "get_profile", "arguments": "{}", "call_id": "call_1"}])
            else:
                yield {"type": "response.output_text.delta", "delta": "Pas d’historique réalisé."}
                yield completed()
        self.runtime.transport = transport
        turn, frames = await self.run_turn()
        self.assertEqual(turn["status"], "completed")
        self.assertEqual(turn["usage"]["requests"], 2)
        self.assertEqual(sum(x["cached_input_tokens"] for x in turn["usage"]["reports"]), 2048)
        self.assertEqual(payloads[1]["input"][:len(payloads[0]["input"])], payloads[0]["input"])
        self.assertNotIn("prompt_cache_breakpoint", json.dumps(payloads[0]))
        self.assertNotIn("SECRET", "".join(frames))
        self.assertNotIn("SECRET", json.dumps(payloads))
        self.assertFalse(payloads[0]["store"])
        self.assertTrue(payloads[0]["stream"])
        self.assertNotIn("max_output_tokens", payloads[0])
        self.assertNotIn("prompt_cache_options", payloads[0])
        self.assertNotIn("previous_response_id", payloads[0])
        # Un nouveau message conserve le préfixe du premier envoi, dates comprises.
        await self.run_turn()
        self.assertEqual(payloads[2]["input"][:len(payloads[0]["input"])], payloads[0]["input"])

    async def test_eof_preserves_partial_as_failed(self):
        async def transport(*_):
            yield {"type": "response.output_text.delta", "delta": "Texte reçu"}
        self.runtime.transport = transport
        turn, _ = await self.run_turn()
        self.assertEqual((turn["status"], turn["error"], turn["answer"]), ("failed", "incomplete", "Texte reçu"))

    async def test_tool_items_from_stream_with_empty_terminal_output(self):
        calls = []
        item = {"type": "function_call", "namespace": "fitness", "name": "get_profile",
                "arguments": "{}", "call_id": "call_stream"}
        async def transport(token, payload):
            calls.append(payload)
            if len(calls) == 1:
                yield {"type": "response.output_item.done", "output_index": 0, "item": item}
            else:
                yield {"type": "response.output_text.delta", "delta": "Données consultées."}
            yield completed()
        self.runtime.transport = transport
        turn, _ = await self.run_turn()
        self.assertEqual((turn["status"], turn["usage"]["requests"]), ("completed", 2))
        self.assertIn(item, calls[1]["input"])
        self.assertEqual(calls[1]["input"][-1]["call_id"], "call_stream")

    async def test_stop_and_disconnection_preserve_partial(self):
        for disconnect in (False, True):
            self.connection.valid = True
            received = asyncio.Event()
            async def transport(*_):
                yield {"type": "response.output_text.delta", "delta": "Partie conservée"}
                received.set()
                await asyncio.sleep(30)
            self.runtime.transport = transport
            turn, _ = await self.runtime.start("arnaud", self.conversation, store.Send(request_id=uuid4().hex, text="Interrompre"))
            task = self.runtime.tasks[turn["id"]]
            await asyncio.wait_for(received.wait(), 3)
            if disconnect:
                self.connection.valid = False
                await asyncio.wait_for(task, 3)
            else:
                await self.runtime.stop(turn["id"])
            with self.db.transaction() as s:
                row = s.get(CoachTurn, turn["id"])
                self.assertEqual((row.status, row.answer), ("interrupted", "Partie conservée"))

    async def test_usage_failure_after_text_has_no_retry(self):
        calls = []
        async def transport(*_):
            calls.append(1)
            yield {"type": "response.output_text.delta", "delta": "Partiel"}
            raise inference.InferenceError("limit")
        self.runtime.transport = transport
        turn, _ = await self.run_turn()
        self.assertEqual((turn["status"], turn["error"], len(calls)), ("failed", "limit", 1))
        self.assertEqual(turn["usage"]["reports"], [])  # Inconnu, jamais inventé à zéro.

    async def test_single_token_refresh_before_stream_without_model_substitution(self):
        calls = []
        async def transport(token, payload):
            calls.append(payload["model"])
            if len(calls) == 1:
                raise inference.InferenceError("revoked")
            yield {"type": "response.output_text.delta", "delta": "Connexion renouvelée"}
            yield completed()
        self.runtime.transport = transport
        turn, _ = await self.run_turn()
        self.assertEqual((turn["status"], self.connection.refreshes), ("completed", 1))
        self.assertEqual(calls, ["gpt-5.6-luna", "gpt-5.6-luna"])

    async def test_no_token_retry_after_stream_started(self):
        async def transport(*_):
            yield {"type": "response.created"}
            raise inference.InferenceError("revoked")
        self.runtime.transport = transport
        turn, _ = await self.run_turn()
        self.assertEqual((turn["status"], self.connection.refreshes), ("failed", 0))

    async def test_connection_change_prevents_new_inference(self):
        self.runtime.connection_changing = True
        with self.assertRaises(store.CoachConflict):
            await self.run_turn()

    async def test_transport_error_body_never_leaks(self):
        async def handler(request):
            return httpx.Response(403, json={"detail": "SECRET_PROVIDER_DETAIL"}, headers={"x-request-id": "safe-id"})
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            with self.assertLogs("backend.coach.inference", level="WARNING") as logs:
                with self.assertRaises(inference.InferenceError) as caught:
                    async for _ in inference.events("SECRET_ACCESS", {}, client=client):
                        pass
            self.assertEqual(caught.exception.code, "restricted")
            self.assertNotIn("SECRET", str(caught.exception) + str(logs.output))

    async def test_transport_multiline_and_terminal_usage_error(self):
        data = 'data: {"type":"response.output_text.delta",\ndata: "delta":"Bonjour"}\n\ndata: {"type":"response.failed","response":{"error":{"code":"subscription_sharing_usage_limit_exceeded","message":"SECRET"}}}\n\n'
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: httpx.Response(200, text=data))) as client:
            received = []
            with self.assertRaises(inference.InferenceError) as caught:
                async for event in inference.events("SECRET_ACCESS", {}, client=client):
                    received.append(event)
            self.assertEqual(received[0]["delta"], "Bonjour")
            self.assertEqual(caught.exception.code, "limit")


if __name__ == "__main__":
    unittest.main()
