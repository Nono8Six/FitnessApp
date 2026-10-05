"""Protections SIWC : faux fournisseur signé, vrai coffre Windows, aucune connexion réelle."""
import base64
import hashlib
import json
import sys
import tempfile
import time
import unittest
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlsplit

import httpx2 as httpx
import jwt
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.coach.connection import Connection
from backend.coach.protocol import ConnectionIssue, ISSUER, OpenAIConnection, SCOPES
from backend.coach.vault import Vault, VaultError, protect_bytes


class Provider:
    def __init__(self):
        self.key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        self.jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(self.key.public_key()))
        self.jwk.update(kid="test-key", use="sig", alg="RS256")
        self.calls = []
        self.claims = {}
        self.scope = SCOPES
        self.failure = None
        self.catalog = [{"slug": "available-test-model", "display_name": "Modèle du compte", "visibility": "list"},
                        {"slug": "hidden-test-model", "display_name": "Masqué", "visibility": "hide"}]
        self.connection = None
        self.refresh_count = 0
        self.revoked = False
        self.client = OpenAIConnection(httpx.Client(transport=httpx.MockTransport(self.handle)))

    def handle(self, request):
        form = {k: v[0] for k, v in parse_qs(request.content.decode()).items()} if request.content else {}
        path = request.url.path
        self.calls.append((path, form))
        if self.failure and self.failure[0] == path:
            if self.failure[1] == "network":
                raise httpx.ConnectError("SECRET_TRANSPORT_DETAIL", request=request)
            return httpx.Response(self.failure[1], json={"error": self.failure[2]})
        if path.endswith("openid-configuration"):
            return httpx.Response(200, json={"issuer": ISSUER, "authorization_endpoint": ISSUER + "/api/accounts/authorize",
                                            "token_endpoint": ISSUER + "/api/accounts/oauth/token", "jwks_uri": ISSUER + "/.well-known/jwks.json",
                                            "revocation_endpoint": ISSUER + "/api/accounts/oauth/revoke",
                                            "id_token_signing_alg_values_supported": ["RS256"]})
        if path.endswith("jwks.json"):
            return httpx.Response(200, json={"keys": [self.jwk]})
        if path.endswith("/token"):
            refresh = form["grant_type"] == "refresh_token"
            if refresh:
                self.refresh_count += 1
            claims = {"iss": ISSUER, "aud": form["client_id"], "sub": "test-subject", "iat": int(time.time()),
                      "exp": int(time.time()) + 3600, "nonce": self.nonce, "email": "test@example.invalid", **self.claims}
            self.last_id_token = jwt.encode(claims, self.key, algorithm="RS256", headers={"kid": "test-key"})
            body = {"access_token": "SECRET_ACCESS" + str(self.refresh_count), "refresh_token": "SECRET_REFRESH" + str(self.refresh_count),
                    "id_token": self.last_id_token, "token_type": "Bearer", "expires_in": 3600, "scope": self.scope}
            if refresh:
                body.pop("scope")  # OAuth : un scope omis conserve le précédent.
            return httpx.Response(200, json=body)
        if path == "/v1/models":
            return httpx.Response(200, json={"models": self.catalog})
        if path.endswith("/revoke"):
            self.revoked = True
            return httpx.Response(200)
        raise AssertionError("Endpoint non prévu")

    def attach(self, connection):
        self.connection = connection

    def prepare(self):
        self.nonce = self.connection.pending["nonce"]


@unittest.skipUnless(sys.platform == "win32", "Coffre DPAPI Windows")
class ConnectionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.provider = Provider()
        self.urls = []
        self.connection = Connection(Path(self.tmp.name) / "chatgpt", provider=self.provider.client,
                                     opener=lambda url: self.urls.append(url) or True)
        self.provider.attach(self.connection)
        self.connection.start(background=False)
        self.assertTrue(self.connection.ready)

    def tearDown(self):
        self.connection.close()
        self.tmp.cleanup()

    def begin(self, account=None):
        self.connection.begin(account)
        self.provider.prepare()
        return urlencode({"code": "SECRET_CODE", "state": self.connection.pending["state"], "client_id": "oaiapp_test"})

    def connect(self):
        self.assertTrue(self.connection.callback(self.begin()))

    def test_initial_pkce_loopback_and_stable_installation(self):
        self.begin()
        params = parse_qs(urlsplit(self.urls[-1]).query)
        pending = self.connection.pending
        self.assertEqual(params["client_id"], ["dynamic_agent_client"])
        self.assertEqual(params["agent_name_hint"], ["FitnessApp"])
        self.assertEqual(params["ext_agent_host_id"], [self.connection.saved.host_id])
        self.assertEqual(params["code_challenge"], [base64.urlsafe_b64encode(hashlib.sha256(pending["verifier"].encode()).digest()).rstrip(b"=").decode()])
        self.assertEqual(urlsplit(params["redirect_uri"][0]).hostname, "127.0.0.1")
        self.assertEqual(urlsplit(params["redirect_uri"][0]).path, "/callback")
        self.assertEqual(self.connection.listener.server_address[0], "127.0.0.1")
        saved_host = self.connection.saved.host_id
        self.connection.close()
        self.connection = Connection(Path(self.tmp.name) / "chatgpt")
        self.connection.start(background=False)
        self.assertEqual(self.connection.saved.host_id, saved_host)

    def test_wrong_state_duplicate_parameters_and_replay_do_not_exchange(self):
        query = self.begin()
        self.assertFalse(self.connection.callback("code=SECRET_CODE&state=wrong&client_id=oaiapp_test"))
        self.assertFalse(self.connection.callback(query + "&state=duplicate"))
        self.assertFalse(self.connection.callback(query + "&code=second"))
        self.assertEqual(sum(p.endswith("/token") for p, _ in self.provider.calls), 0)
        self.assertTrue(self.connection.callback(query))
        self.assertFalse(self.connection.callback(query))
        self.assertEqual(sum(p.endswith("/token") for p, _ in self.provider.calls), 1)

    def test_expired_and_cancelled_attempts_cannot_connect(self):
        query = self.begin()
        self.connection.pending["deadline"] = time.monotonic() - 1
        self.assertFalse(self.connection.callback(query))
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "expired")
        query = self.begin()
        self.connection.cancel()
        self.assertFalse(self.connection.callback(query))
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "cancelled")

    def test_concurrent_attempt_rejected_and_denial_consumed(self):
        self.begin()
        with self.assertRaisesRegex(ConnectionIssue, "déjà en cours"):
            self.connection.begin()
        denied = urlencode({"error": "access_denied", "state": self.connection.pending["state"]})
        self.assertFalse(self.connection.callback(denied))
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "denied")
        self.assertFalse(any(p.endswith("/token") for p, _ in self.provider.calls))

    def test_scopes_come_from_token_response_not_callback(self):
        self.provider.scope = "openid profile email offline_access"
        query = self.begin() + "&scope=" + SCOPES.replace(" ", "+")
        self.assertTrue(self.connection.callback(query))
        state = self.connection.snapshot()
        self.assertEqual(state["state"], "connected")
        self.assertEqual(state["issue"]["code"], "permission_missing")
        self.assertFalse(state["plan_enabled"])
        self.assertFalse(any(p == "/v1/models" for p, _ in self.provider.calls))

    def test_id_token_validation_rejects_claims_and_algorithm(self):
        for claims in ({"iss": "https://other.invalid"}, {"aud": "other"}, {"exp": 1}, {"iat": time.time() + 3600},
                       {"nonce": "wrong"}, {"sub": ""}, {"azp": "other"}, {"aud": ["oaiapp_test", "other"]}, {"at_hash": "wrong"}):
            with self.subTest(claims=claims):
                self.provider.claims = claims
                query = self.begin()
                self.assertFalse(self.connection.callback(query))
                self.assertIsNone(self.connection.account())
        forged = jwt.encode({"iss": ISSUER, "sub": "a"}, "x" * 32, algorithm="HS256", headers={"kid": "test-key"})
        with self.assertRaises(ConnectionIssue):
            self.provider.client.identity(forged, "oaiapp_test", nonce="test")

    def test_signature_tampering_and_unknown_key_are_rejected(self):
        self.connect()
        token = self.provider.last_id_token
        with self.assertRaises(ConnectionIssue):
            self.provider.client.identity(token[:-10] + "A" * 10, "oaiapp_test", nonce=self.provider.nonce)
        self.provider.jwk["kid"] = "other-key"
        with self.assertRaises(ConnectionIssue):
            self.provider.client.identity(token, "oaiapp_test", nonce=self.provider.nonce)

    def test_missing_offline_permission_and_missing_openid(self):
        self.provider.scope = "openid resource.invoke chatgpt.tokens.use.direct"
        self.connect()
        self.assertIsNone(self.connection.account().tokens.refresh)
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "renewal_missing")
        account = self.connection.account()
        self.provider.scope = "resource.invoke chatgpt.tokens.use.direct"
        self.assertFalse(self.connection.callback(self.begin(account.id)))

    def test_different_registrations_keep_same_email_separate(self):
        self.connect()
        first = self.connection.account()
        query = self.begin().replace("oaiapp_test", "oaiapp_second")
        self.assertTrue(self.connection.callback(query))
        second = self.connection.account()
        self.assertNotEqual(first.id, second.id)
        self.assertEqual(first.email, second.email)
        self.connection.select_account(first.id)
        self.assertEqual(self.connection.account().client_id, "oaiapp_test")
        labels = [a["label"] for a in self.connection.snapshot()["accounts"]]
        self.assertEqual(len(set(labels)), 2)

    def test_returning_client_and_identity_cannot_be_swapped(self):
        self.connect()
        account = self.connection.account()
        original = account.tokens.access
        query = self.begin(account.id)
        params = parse_qs(urlsplit(self.urls[-1]).query)
        self.assertEqual(params["client_id"], [account.client_id])
        self.assertEqual(params["id_token_hint"], [account.tokens.identity])
        self.assertNotIn("agent_name_hint", params)
        self.assertFalse(self.connection.callback(query.replace("oaiapp_test", "oaiapp_other")))
        self.assertEqual(self.connection.account().tokens.access, original)
        self.provider.claims = {"sub": "other-subject"}
        self.assertFalse(self.connection.callback(self.begin(account.id)))
        self.assertEqual(self.connection.account().subject, "test-subject")

    def test_issued_client_is_retained_after_failed_exchange(self):
        query = self.begin()
        self.provider.failure = ("/api/accounts/oauth/token", 400, "invalid_grant")
        self.assertFalse(self.connection.callback(query))
        self.connection.begin()
        self.assertEqual(parse_qs(urlsplit(self.urls[-1]).query)["client_id"], ["oaiapp_test"])

    def test_refresh_serialized_rotated_and_restored_after_restart(self):
        self.connect()
        account = self.connection.account()
        self.connection.select_model("available-test-model")
        account.tokens.expires_at = time.time() - 1
        self.connection._save()
        host_id, account_id = self.connection.saved.host_id, account.id
        self.connection.close()
        self.connection = Connection(Path(self.tmp.name) / "chatgpt", provider=OpenAIConnection(httpx.Client(transport=httpx.MockTransport(self.provider.handle))))
        self.connection.start(background=False)
        with ThreadPoolExecutor(max_workers=4) as pool:
            list(pool.map(lambda _: self.connection.maintain(force=True), range(4)))
        self.assertEqual(self.provider.refresh_count, 1)
        self.assertEqual(self.connection.account().tokens.refresh, "SECRET_REFRESH1")
        self.assertEqual(self.connection.account().id, account_id)
        self.assertEqual(self.connection.saved.host_id, host_id)
        self.assertEqual(self.connection.snapshot()["selected_model"], "available-test-model")
        raw = json.loads(protect_bytes(self.connection.vault.path.read_bytes(), decrypt=True))
        self.assertEqual(raw["accounts"][0]["tokens"]["refresh"], "SECRET_REFRESH1")

    def test_terminal_refresh_clears_tokens_but_network_keeps_them(self):
        self.connect()
        self.connection.account().tokens.expires_at = time.time() - 1
        self.provider.failure = ("/api/accounts/oauth/token", "network", None)
        self.connection.maintain(force=True)
        self.assertIsNotNone(self.connection.account().tokens)
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "network")
        self.provider.failure = ("/api/accounts/oauth/token", 400, "refresh_token_reused")
        self.connection.maintain(force=True)
        self.assertIsNone(self.connection.account().tokens)
        self.assertEqual(self.connection.account().client_id, "oaiapp_test")
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "revoked")

    def test_disconnect_revokes_and_erases_all_tokens_retains_registration(self):
        self.connect()
        account_id, host = self.connection.account().id, self.connection.saved.host_id
        self.connection.disconnect()
        self.assertTrue(self.provider.revoked)
        self.assertIsNone(self.connection.account().tokens)
        self.assertEqual(self.connection.saved.host_id, host)
        raw = protect_bytes(self.connection.vault.path.read_bytes(), decrypt=True)
        self.assertNotIn(b"SECRET_", raw)
        self.begin(account_id)
        params = parse_qs(urlsplit(self.urls[-1]).query)
        self.assertNotIn("id_token_hint", params)
        self.assertEqual(params["client_id"], ["oaiapp_test"])

    def test_failed_revocation_still_clears_locally_and_is_visible(self):
        self.connect()
        self.provider.failure = ("/api/accounts/oauth/revoke", "network", None)
        self.connection.disconnect()
        state = self.connection.snapshot()
        self.assertEqual(state["state"], "disconnected")
        self.assertEqual(state["issue"]["code"], "remote_revocation_unconfirmed")
        self.assertIsNone(self.connection.account().tokens)

    def test_catalog_filter_empty_and_model_validation(self):
        self.connect()
        self.assertEqual(self.connection.snapshot()["models"], [{"id": "available-test-model", "name": "Modèle du compte"}])
        with self.assertRaises(ConnectionIssue):
            self.connection.select_model("hidden-test-model")
        self.connection.select_model("available-test-model")
        self.provider.catalog = []
        self.connection.maintain(force=True)
        self.assertTrue(self.connection.snapshot()["models_loaded"])
        self.assertEqual(self.connection.snapshot()["models"], [])
        self.assertIsNone(self.connection.snapshot()["selected_model"])

    def test_permission_failure_does_not_retry_automatically(self):
        self.connect()
        self.provider.failure = ("/v1/models", 403, "subscription_sharing_user_not_eligible")
        self.connection.models_loaded = False
        self.connection.maintain(force=True)
        self.assertEqual(self.connection.snapshot()["issue"]["code"], "not_eligible")
        count = len(self.provider.calls)
        self.connection.maintain()
        self.assertEqual(len(self.provider.calls), count)
        self.assertIsNotNone(self.connection.account().tokens)

    def test_no_secrets_in_status_logs_or_encrypted_files(self):
        self.connect()
        with self.assertLogs("backend.coach.protocol", level="WARNING") as logs:
            self.provider.failure = ("/v1/models", 500, "SECRET_UPSTREAM_BODY")
            self.connection.maintain(force=True)
        public = json.dumps(self.connection.snapshot()) + "\n".join(logs.output)
        for secret in ("SECRET_", self.provider.last_id_token, "oaiapp_test", "urn:uuid:"):
            self.assertNotIn(secret, public)
        for path in self.connection.vault.directory.iterdir():
            if path.suffix != ".lock":  # Le verrou interdit volontairement la lecture du premier octet.
                self.assertNotIn(b"SECRET_", path.read_bytes())

    def test_one_process_only_and_atomic_failure_preserves_file(self):
        other = Vault(self.connection.vault.directory)
        with self.assertRaises(VaultError):
            other.open()
        before = self.connection.vault.path.read_bytes()
        with patch("backend.coach.vault.os.replace", side_effect=OSError("SECRET_ERROR")):
            with self.assertRaises(VaultError):
                self.connection.vault.save({"secret": "SECRET_NEW"})
        self.assertEqual(self.connection.vault.path.read_bytes(), before)
        self.assertEqual(list(self.connection.vault.directory.glob("*.tmp")), [])

    def test_corrupt_vault_not_overwritten(self):
        self.connection.close()
        self.connection.vault.path.write_bytes(b"invalid")
        self.connection = Connection(Path(self.tmp.name) / "chatgpt")
        self.connection.start(background=False)
        self.assertFalse(self.connection.ready)
        self.assertEqual(self.connection.vault.path.read_bytes(), b"invalid")

    def test_http_callback_scrubs_url_and_does_not_reflect_code(self):
        query = self.begin()
        redirect = self.connection.pending["redirect_uri"]
        response = httpx.get(redirect + "?" + query, follow_redirects=False)
        self.assertEqual(response.status_code, 303)
        self.assertEqual(response.headers["location"], "/complete")
        self.assertNotIn("SECRET", response.text)
        self.assertEqual(response.headers["referrer-policy"], "no-referrer")
        complete = httpx.get(redirect.replace("/callback", "/complete"))
        self.assertEqual(complete.status_code, 200)
        replay = httpx.get(redirect + "?" + query)
        self.assertEqual(replay.headers["location"], "/failed")

    def test_api_is_safe_and_connect_is_pc_only(self):
        app = create_app(data_root=Path(self.tmp.name) / "app")
        app.state.chatgpt.provider.close()
        app.state.chatgpt = self.connection
        self.connect()
        client = TestClient(app, base_url="http://127.0.0.1", client=("127.0.0.1", 12345))
        try:
            response = client.get("/api/chatgpt")
            self.assertTrue(response.json()["local"])
            self.assertNotIn("SECRET_", response.text)
            self.assertNotIn(self.provider.last_id_token, response.text)
            self.assertEqual(response.headers["cache-control"], "no-store")
            self.assertEqual(client.post("/api/chatgpt/connect", json={}, headers={"origin": "https://evil.invalid"}).status_code, 403)
            self.assertEqual(client.post("/api/chatgpt/connect", content="{}").status_code, 415)
            phone = TestClient(app, base_url="http://127.0.0.1", client=("192.168.1.50", 12345))
            self.assertFalse(phone.get("/api/chatgpt").json()["local"])
            for endpoint in ("connect", "disconnect", "cancel", "account"):
                body = {"id": self.connection.account().id} if endpoint == "account" else {}
                self.assertEqual(phone.post("/api/chatgpt/" + endpoint, json=body).status_code, 403)
        finally:
            app.state.database.close()


if __name__ == "__main__":
    unittest.main()
