"""Contrat de synchronisation et reprise après perte de réponse."""
import asyncio
import base64
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import httpx2 as httpx
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ed25519, padding, rsa
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from backend import foulee
from backend.foulee_browser import BrowserDelivery, BrowserSettings, TRANSFER_URL
from backend.recording.service import set_feeling
from backend.storage import open_database
from backend.storage.models import RecordedEntry, RecordedSession
from backend.training.profiles import ensure_default_profiles

ENABLED = "2026-11-22T08:00:00.000+00:00"
CLOSED = "2026-11-22T09:00:01.000+00:00"
STARTED = "2026-11-22T09:59:30+01:00"


class FouleeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.database = open_database(Path(directory.name))
        self.addCleanup(self.database.close)
        self.settings = foulee.Settings("test-token", ENABLED)
        with self.database.write() as session:
            ensure_default_profiles(session)

    def add_workout(self, session_id, *, profile="arnaud", mode="reel", phase="completed",
                    confirmed=True, closed=CLOSED, active_seconds=31.25, gap=False):
        with self.database.write() as session:
            session.add(RecordedSession(id=session_id, profile_id=profile, mode=mode,
                started_at=STARTED, closed_at=closed, profile_snapshot={},
                workout_snapshot={"name": "Course sur tapis"}, calculation_version="recording-v1-acsm-v2",
                checkpoint={"phase": phase, "stop_confirmed": confirmed, "active_s": active_seconds},
                persisted_at=CLOSED, persisted_seq=2, lost_entries=0))
            session.flush()
            session.add_all(RecordedEntry(session_id=session_id, seq=seq, at=CLOSED, t=t, kind="sample",
                source="ftms", data={"t": t, "counter_m": meters, "phase": "running"})
                for seq, t, meters in ((1, 0, 50), (2, 3 if gap else 1, 54.5)))

    def test_only_confirmed_real_sessions_for_arnaud_and_revisions_remain_pending(self):
        self.add_workout("0" * 32, profile="ophelie")
        self.add_workout("1" * 32, mode="simulation")
        self.add_workout("2" * 32, phase="interrupted")
        self.add_workout("3" * 32, confirmed=False)
        self.add_workout("4" * 32, closed="2026-11-21T09:00:00.000+00:00")
        self.add_workout("5" * 32, closed=None)
        self.add_workout("6" * 32, active_seconds=0)
        stopped_id, completed_id = "7" * 32, "8" * 32
        self.add_workout(stopped_id, phase="stopped", gap=True)
        self.add_workout(completed_id)

        stopped_revision, stopped = foulee.next_session(self.database, self.settings, [])
        self.assertEqual(stopped["session_id"], stopped_id)
        self.assertIsNone(stopped["distance_m"])
        foulee.acknowledge(self.database, stopped_id, stopped_revision)

        revision, payload = foulee.next_session(self.database, self.settings, [])
        self.assertEqual(payload, {"format": "fitnessapp.session.v1", "session_id": completed_id,
            "started_at": STARTED, "title": "Course sur tapis", "active_seconds": 31.25,
            "distance_m": 4.5, "perceived_effort": None})
        with patch("backend.recording.service.utc_now", return_value="2026-11-22T09:01:00.000+00:00"), self.database.write() as session:
            updated = set_feeling(session, "arnaud", completed_id, 7)
        # La confirmation de l’ancien envoi arrive après la saisie du ressenti.
        foulee.acknowledge(self.database, completed_id, revision)
        latest_revision, latest = foulee.next_session(self.database, self.settings, [])
        self.assertEqual((latest_revision, latest["session_id"], latest["perceived_effort"]),
                         (updated["updated_at"], completed_id, 7))
        foulee.acknowledge(self.database, completed_id, latest_revision)
        self.assertIsNone(foulee.next_session(self.database, self.settings, []))

    async def test_lost_response_retries_the_same_session_and_requires_a_valid_receipt(self):
        session_id = "a" * 32
        self.add_workout(session_id)
        calls = []

        def receive(request):
            calls.append((str(request.url), request.headers["OAI-Sites-Authorization"], request.content))
            if len(calls) == 1:
                raise httpx.ReadTimeout("réponse perdue", request=request)
            if len(calls) == 2:
                return httpx.Response(200, json={"ok": True, "session_id": "autre"})
            return httpx.Response(200, json={"ok": True, "session_id": session_id})

        async with httpx.AsyncClient(transport=httpx.MockTransport(receive)) as client:
            for expected_error in ("injoignable", "confirmation"):
                _, payload = foulee.next_session(self.database, self.settings, [])
                with self.assertRaisesRegex(foulee.DeliveryError, expected_error):
                    await foulee.deliver(client, self.settings, payload)
            revision, payload = foulee.next_session(self.database, self.settings, [])
            await foulee.deliver(client, self.settings, payload)
        foulee.acknowledge(self.database, session_id, revision)
        self.assertEqual(calls, [(foulee.ENDPOINT, "Bearer test-token", calls[0][2])] * 3)
        self.assertIsNone(foulee.next_session(self.database, self.settings, []))

    async def test_browser_transfer_encrypts_the_bilan_and_requires_its_own_receipt(self):
        signing = ed25519.Ed25519PrivateKey.generate()
        receiver = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        browser = BrowserDelivery(BrowserSettings(ENABLED, signing, receiver.public_key()))
        payload = {"session_id": "b" * 32, "title": "Course sur tapis"}
        opened, stopping = asyncio.Event(), asyncio.Event()
        urls = []
        loop = asyncio.get_running_loop()

        def open_url(url, *, new):
            self.assertEqual(new, 2)
            urls.append(url)
            loop.call_soon_threadsafe(opened.set)
            return True

        with patch("backend.foulee_browser.webbrowser.open", side_effect=open_url):
            task = asyncio.create_task(browser.send(payload, stopping))
            await asyncio.wait_for(opened.wait(), timeout=3)
            try:
                self.assertFalse(browser.confirm("f" * 32))
                self.assertFalse(browser.confirm("é" * 32))
                self.assertFalse(task.done())
                address, encrypted = urls[0].split("#", 1)
                self.assertEqual(address, TRANSFER_URL)
                self.assertNotIn(payload["session_id"], encrypted)
                signed, signature = encrypted.rsplit(".", 1)
                _, wrapped, iv, ciphertext = signed.split(".")

                def decode(value):
                    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))

                with self.assertRaises(InvalidSignature):
                    signing.public_key().verify(decode(signature), b"altered")
                signing.public_key().verify(decode(signature), signed.encode("ascii"))
                key = receiver.decrypt(decode(wrapped), padding.OAEP(
                    mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
                decoded = json.loads(AESGCM(key).decrypt(decode(iv), decode(ciphertext), None))
                self.assertEqual(decoded["session"], payload)
                self.assertTrue(browser.confirm(decoded["receipt"]))
                self.assertTrue(await asyncio.wait_for(task, timeout=3))
                self.assertFalse(browser.confirm(decoded["receipt"]))
            finally:
                stopping.set()
                await task

    async def test_server_worker_sends_without_opening_the_report(self):
        session_id = "b" * 32
        self.add_workout(session_id)
        stopping = asyncio.Event()

        def receive(request):
            self.assertEqual(request.method, "POST")
            stopping.set()
            return httpx.Response(201, json={"ok": True, "session_id": session_id})

        client = httpx.AsyncClient(transport=httpx.MockTransport(receive))
        with patch.object(foulee.httpx, "AsyncClient", return_value=client):
            await asyncio.wait_for(foulee.run(self.database, self.settings, stopping), timeout=5)
        self.assertIsNone(foulee.next_session(self.database, self.settings, []))
