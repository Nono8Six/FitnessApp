"""Une connexion partagée par le PC, distincte des profils sportifs.

Toutes les mutations sont sérialisées, y compris les retours et le renouvellement.
Le verrou du coffre interdit à deux processus de renouveler le même jeton.
"""
import base64
import hashlib
import hmac
import logging
import secrets
import threading
import time
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlsplit
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .protocol import ConnectionIssue, ISSUER, MESSAGES, OpenAIConnection, PLAN_SCOPES, RESOURCE, SCOPES, text_field
from .vault import Vault, VaultError

logger = logging.getLogger(__name__)
ATTEMPT_SECONDS = 300


class Tokens(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    access: str = Field(repr=False, min_length=1, max_length=32768)
    refresh: str | None = Field(default=None, repr=False, max_length=32768)
    identity: str = Field(repr=False, min_length=1, max_length=32768)
    expires_at: float
    scopes: list[str]


class Account(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(default_factory=lambda: uuid4().hex)
    client_id: str = Field(pattern=r"^oaiapp_[A-Za-z0-9_-]+$")
    subject: str
    issuer: str = ISSUER
    email: str | None = None
    name: str | None = None
    tokens: Tokens | None = Field(default=None, repr=False)
    model: str | None = None
    welcome_seen: bool = False
    needs_login: str | None = None


class SavedConnection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    version: int = 1
    host_id: str = Field(default_factory=lambda: "urn:uuid:" + str(uuid4()))
    accounts: list[Account] = Field(default_factory=list)
    active_id: str | None = None


class Connection:
    def __init__(self, directory, *, provider=None, opener=None):
        self.vault = Vault(directory)
        self.provider = provider or OpenAIConnection()
        self.opener = opener or webbrowser.open
        self.saved = SavedConnection()
        self.lock = threading.RLock()
        self.pending = None
        self.listener = None
        self.listener_close_at = 0.0
        self.retry_client_id = None
        self.worker = None
        self.stopping = threading.Event()
        self.ready = False
        self.issue = None
        self.models = []
        self.models_loaded = False
        self.next_check = 0.0
        self.retry_seconds = 15
        self.generation = 0  # Invalide les flux lors d'un changement de compte ou d'une déconnexion.

    def start(self, *, background=True):
        with self.lock:
            try:
                stored = self.vault.open()
                if stored is not None:
                    self.saved = SavedConnection.model_validate(stored)
                    if (self.saved.version != 1 or not self.saved.host_id.startswith("urn:uuid:")
                            or any(a.issuer != ISSUER for a in self.saved.accounts)
                            or self.saved.active_id is not None and self.account() is None):
                        raise ValueError()
                else:
                    self.vault.save(self.saved.model_dump())
                self.ready = True
            except (VaultError, ValidationError, ValueError):
                self.vault.close()
                self.issue = "storage"
                logger.error("ChatGPT : ouverture du coffre impossible ; aucun contenu journalisé.")
        if background and self.ready:
            self.worker = threading.Thread(target=self._run, name="chatgpt-session", daemon=True)
            self.worker.start()

    def close(self):
        self.stopping.set()
        if self.worker:
            self.worker.join(timeout=40)
        with self.lock:
            self.pending = None
            self._close_listener()
            self.provider.close()
            self.vault.close()
            self.ready = False

    def _run(self):
        while not self.stopping.is_set():
            try:
                self.maintain()
            except Exception:
                # Les erreurs inattendues restent visibles, sans sérialiser un secret.
                with self.lock:
                    self.issue = "unavailable"
                logger.error("ChatGPT : maintenance interrompue ; diagnostic requis.")
            self.stopping.wait(5)

    def account(self, account_id=None):
        return next((a for a in self.saved.accounts if a.id == (account_id or self.saved.active_id)), None)

    def _save(self):
        try:
            self.vault.save(self.saved.model_dump())
        except VaultError:
            self.ready = False
            self.issue = "storage"
            raise ConnectionIssue("storage") from None

    def _require_ready(self):
        if not self.ready:
            raise ConnectionIssue("storage")

    def snapshot(self, *, local=False):
        with self.lock:
            self._expire_attempt()
            account = self.account()
            token = account.tokens if account else None
            permitted = bool(token and PLAN_SCOPES.issubset(token.scopes))
            issue = self.issue or (account.needs_login if account else None)
            if not issue and token and not permitted:
                issue = "permission_missing"
            if not issue and token and not token.refresh:
                issue = "renewal_missing"
            if not issue and token and token.expires_at <= time.time():
                issue = "expired"
            state = "connecting" if self.pending else "connected" if token else "disconnected"
            return {
                "state": state, "local": local, "available": self.ready,
                "account": {"id": account.id, "email": account.email, "name": account.name} if account else None,
                "accounts": [{"id": a.id, "label": f"{a.email or a.name or 'Compte ChatGPT'} · {i + 1}"}
                             for i, a in enumerate(self.saved.accounts)],
                "plan_enabled": permitted, "models": self.models,
                "models_loaded": self.models_loaded, "selected_model": account.model if account else None,
                "issue": {"code": issue, "message": MESSAGES[issue]} if issue else None,
                "welcome": bool(token and permitted and not account.welcome_seen),
            }

    def _close_listener(self):
        if self.listener:
            self.listener.shutdown()
            self.listener.server_close()
            self.listener = None

    def _expire_attempt(self):
        if self.pending and time.monotonic() >= self.pending["deadline"]:
            self.pending = None
            self.issue = "expired"
            self._close_listener()

    def begin(self, account_id: str | None = None, *, consent=False):
        with self.lock:
            self._require_ready()
            self._expire_attempt()
            if self.pending:
                raise ConnectionIssue("busy")
            account = self.account(account_id) if account_id else None
            if account_id and account is None:
                raise ConnectionIssue("invalid_response")
            metadata = self.provider.metadata()
            self._close_listener()
            verifier = secrets.token_urlsafe(48)
            self.pending = {
                "state": secrets.token_urlsafe(32), "nonce": secrets.token_urlsafe(32), "verifier": verifier,
                "deadline": time.monotonic() + ATTEMPT_SECONDS, "account_id": account_id,
                "client_id": account.client_id if account else self.retry_client_id,
            }
            try:
                self.listener = callback_server(self)
                self.listener_close_at = time.monotonic() + ATTEMPT_SECONDS + 15
                redirect = f"http://127.0.0.1:{self.listener.server_port}/callback"
                self.pending["redirect_uri"] = redirect
                threading.Thread(target=self.listener.serve_forever, daemon=True).start()
                params = {
                    "client_id": self.pending["client_id"] or "dynamic_agent_client",
                    "ext_agent_host_id": self.saved.host_id, "response_type": "code", "redirect_uri": redirect,
                    "scope": SCOPES, "resource": RESOURCE, "state": self.pending["state"], "nonce": self.pending["nonce"],
                    "code_challenge_method": "S256",
                    "code_challenge": base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode(),
                }
                if account:
                    if account.tokens:
                        params["id_token_hint"] = account.tokens.identity
                    if account.email:
                        params["login_hint"] = account.email
                elif not self.pending["client_id"]:
                    params["agent_name_hint"] = "FitnessApp"
                if consent:
                    params["prompt"] = "consent"
                # L'URL d'autorisation reste dans le processus et le navigateur système.
                if not self.opener(metadata["authorization_endpoint"] + "?" + urlencode(params)):
                    raise OSError()
                self.issue = None
            except (OSError, webbrowser.Error):
                self.pending = None
                self._close_listener()
                self.issue = "browser"
                raise ConnectionIssue("browser") from None

    def cancel(self):
        with self.lock:
            self.pending = None
            self._close_listener()
            self.issue = "cancelled"

    def callback(self, query: str) -> bool:
        with self.lock:
            try:
                values = parse_qs(query, keep_blank_values=True, max_num_fields=12)
                if any(len(v) != 1 for v in values.values()):
                    return False
                values = {k: v[0] for k, v in values.items()}
                attempt = self.pending
                if (not attempt or time.monotonic() >= attempt["deadline"]
                        or not hmac.compare_digest(values.get("state", "").encode(), attempt["state"].encode())):
                    self._expire_attempt()
                    return False
                self.pending = None  # Consommation unique AVANT tout échange réseau.
                self.listener_close_at = time.monotonic() + 15
                if "error" in values:
                    raise ConnectionIssue("denied" if values["error"] == "access_denied" else "invalid_callback")
                client_id = values.get("client_id", attempt["client_id"])
                if (not text_field(client_id, 256) or not client_id.startswith("oaiapp_")
                        or attempt["client_id"] and client_id != attempt["client_id"]
                        or not text_field(values.get("code"), 8192)):
                    raise ConnectionIssue("invalid_callback")
                old = self.account(attempt["account_id"]) if attempt["account_id"] else None
                # Inscription incomplète gardée séparément des identités vérifiées.
                if old is None:
                    self.retry_client_id = client_id
                raw = self.provider.tokens({"grant_type": "authorization_code", "client_id": client_id,
                                            "code": values["code"], "code_verifier": attempt["verifier"],
                                            "redirect_uri": attempt["redirect_uri"]})
                if not raw.get("id_token") or "openid" not in raw.get("scope", "").split():
                    raise ConnectionIssue("invalid_response")
                identity = self.provider.identity(raw["id_token"], client_id, nonce=attempt["nonce"],
                                                  subject=old.subject if old else None, access_token=raw["access_token"])
                # Une même inscription revenue du fournisseur ne crée pas de doublon.
                existing = next((a for a in self.saved.accounts if a.client_id == client_id), None)
                if existing and existing.subject != identity["sub"]:
                    raise ConnectionIssue("invalid_response")
                account = (old or existing).model_copy(deep=True) if old or existing else Account(
                    client_id=client_id, subject=identity["sub"])
                account.email = identity.get("email") if text_field(identity.get("email"), 320) else None
                account.name = identity.get("name") if text_field(identity.get("name"), 200) else None
                account.tokens = self._token_record(raw)
                account.needs_login = None
                if old or existing:
                    self.saved.accounts = [account if a.id == account.id else a for a in self.saved.accounts]
                else:
                    self.saved.accounts.append(account)
                self.saved.active_id = account.id
                self._save()
                self.retry_client_id = None
                self.issue = None
                self.models = []
                self.models_loaded = False
                self._load_models(account)
                return True
            except ConnectionIssue as exc:
                self.issue = exc.code
                logger.warning("ChatGPT : connexion arrêtée (%s).", exc.code)
                return False
            except (ValueError, TypeError, ValidationError):
                self.issue = "invalid_callback"
                return False

    def _token_record(self, raw, previous=None):
        scopes = raw["scope"].split() if "scope" in raw else previous.scopes
        return Tokens(access=raw["access_token"], refresh=raw.get("refresh_token") if "offline_access" in scopes else None,
                      identity=raw.get("id_token") or previous.identity,
                      expires_at=time.time() + raw["expires_in"],
                      scopes=scopes)

    def _refresh(self, account):
        if not account.tokens or not account.tokens.refresh:
            raise ConnectionIssue("expired")
        try:
            raw = self.provider.tokens({"grant_type": "refresh_token", "client_id": account.client_id,
                                        "refresh_token": account.tokens.refresh})
            if not raw.get("refresh_token"):
                raise ConnectionIssue("invalid_response")
            if raw.get("id_token"):
                self.provider.identity(raw["id_token"], account.client_id, nonce=None, subject=account.subject,
                                       access_token=raw["access_token"])
            account.tokens = self._token_record(raw, account.tokens)
            self._save()
        except ConnectionIssue as exc:
            if exc.code in {"revoked", "expired"}:
                account.tokens = None
                account.needs_login = exc.code
                self.models = []
                self.models_loaded = False
                self._save()
            raise

    def _load_models(self, account):
        if not account.tokens or not PLAN_SCOPES.issubset(account.tokens.scopes):
            self.models = []
            self.models_loaded = False
            return
        try:
            self.models = self.provider.models(account.tokens.access)
        except ConnectionIssue as exc:
            if exc.code != "revoked":
                raise
            # Un seul renouvellement sur 401, jamais de boucle OAuth.
            self._refresh(account)
            self.models = self.provider.models(account.tokens.access)
        self.models_loaded = True
        if account.model not in {m["id"] for m in self.models}:
            account.model = None  # Le choix doit rester explicite.
            self._save()

    def maintain(self, *, force=False):
        with self.lock:
            self._expire_attempt()
            if not self.pending and time.monotonic() >= self.listener_close_at:
                self._close_listener()
            account = self.account()
            if not self.ready or not account or not account.tokens or self.pending:
                return
            if not force and time.time() < self.next_check:
                return
            try:
                if account.tokens.expires_at <= time.time() + 60:
                    self._refresh(account)
                if force or not self.models_loaded:
                    self._load_models(account)
                if self.issue not in {"remote_revocation_unconfirmed", "cancelled", "denied"}:
                    self.issue = None
                self.retry_seconds = 15
                self.next_check = min(time.time() + 300, account.tokens.expires_at - 60)
            except ConnectionIssue as exc:
                self.issue = exc.code
                # Seules les pannes temporaires justifient une répétition automatique.
                # Une permission ou un client refusé demande une action explicite.
                self.next_check = time.time() + self.retry_seconds if exc.code in {"network", "unavailable"} else float("inf")
                self.retry_seconds = min(300, self.retry_seconds * 2)

    def select_account(self, account_id):
        with self.lock:
            self._require_ready()
            if self.pending:
                raise ConnectionIssue("busy")
            if self.account(account_id) is None:
                raise ConnectionIssue("invalid_response")
            self.saved.active_id = account_id
            self.generation += 1
            self.models, self.models_loaded = [], False
            self.issue = None
            self.next_check = 0
            self._save()
            self.maintain(force=True)

    def select_model(self, model_id):
        with self.lock:
            self._require_ready()
            account = self.account()
            if (self.pending or not account or not account.tokens or not self.models_loaded
                    or not PLAN_SCOPES.issubset(account.tokens.scopes)
                    or model_id not in {m["id"] for m in self.models}):
                raise ConnectionIssue("invalid_response")
            account.model = model_id
            self._save()

    def acknowledge(self):
        with self.lock:
            self._require_ready()
            if self.account():
                self.account().welcome_seen = True
                self._save()

    def disconnect(self):
        with self.lock:
            self._require_ready()
            self.generation += 1
            self.pending = None
            self.retry_client_id = None
            self._close_listener()
            account = self.account()
            confirmed = True
            if account and account.tokens:
                if account.tokens.refresh:
                    for attempt in range(2):
                        try:
                            self.provider.revoke(account.client_id, account.tokens.refresh)
                            confirmed = True
                            break
                        except ConnectionIssue as exc:
                            confirmed = False
                            if attempt == 0 and exc.code in {"network", "unavailable"}:
                                self.stopping.wait(0.5)
                            else:
                                break
                account.tokens = None
                account.needs_login = None
                self._save()
            self.models, self.models_loaded = [], False
            self.issue = None if confirmed else "remote_revocation_unconfirmed"

    def inference_credentials(self, *, refresh=False, expected=None):
        """Secret interne, jamais sérialisé. Aucun verrou tenu pendant le streaming."""
        with self.lock:
            self._require_ready()
            account = self.account()
            if not account or not account.tokens:
                raise ConnectionIssue(account.needs_login if account and account.needs_login else "disconnected")
            identity = (self.generation, account.id)
            if expected is not None and identity != expected:
                raise ConnectionIssue("disconnected")
            if refresh or account.tokens.expires_at <= time.time() + 60:
                self._refresh(account)
            if not PLAN_SCOPES.issubset(account.tokens.scopes):
                raise ConnectionIssue("permission_missing")
            if not self.models_loaded:
                self._load_models(account)
            if not account.model or account.model not in {m["id"] for m in self.models}:
                raise ConnectionIssue("model_unavailable")
            return account.tokens.access, account.model, identity

    def inference_valid(self, identity):
        with self.lock:
            account = self.account()
            return bool(account and account.tokens and identity == (self.generation, account.id))


def callback_server(connection):
    class Handler(BaseHTTPRequestHandler):
        def setup(self):
            self.request.settimeout(10)
            super().setup()

        def log_message(self, *_args):
            pass  # L'URL contient un code à usage unique ; aucun journal d'accès.

        def do_GET(self):
            url = urlsplit(self.path)
            accepted = (len(self.path) <= 16000 and url.path == "/callback" and not url.scheme
                        and self.headers.get("Host") == f"127.0.0.1:{self.server.server_port}")
            success = connection.callback(url.query) if accepted else False
            self.send_response(303 if accepted else 200 if url.path in {"/complete", "/failed"} else 400)
            # Efface le code de la barre d'adresse avant d'afficher un résultat.
            if accepted:
                self.send_header("Location", "/complete" if success else "/failed")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.end_headers()
            if not accepted:
                message = "Revenez dans les Réglages de FitnessApp pour consulter la connexion. Vous pouvez fermer cet onglet."
                if url.path == "/complete":
                    message = "Compte connecté. Revenez dans les Réglages de FitnessApp. Vous pouvez fermer cet onglet."
                try:
                    self.wfile.write(("<!doctype html><html lang='fr'><meta charset='utf-8'><meta name='viewport' "
                                      "content='width=device-width,initial-scale=1'><title>Fitness · ChatGPT</title><h1>Fitness</h1><p>"
                                      + message + "</p></html>").encode())
                except (BrokenPipeError, ConnectionResetError):
                    pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    server.block_on_close = False
    return server
