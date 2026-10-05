"""Contrat SIWC officiel, vérifié le 4 octobre 2026 (sources dans le plan § 4)."""
import hmac
import base64
import hashlib
import logging
import math
import re
from urllib.parse import urlsplit

import httpx2 as httpx
import jwt

ISSUER = "https://auth.openai.com"
RESOURCE = "https://api.openai.com/v1"
SCOPES = "openid profile email offline_access resource.invoke chatgpt.tokens.use.direct"
PLAN_SCOPES = {"resource.invoke", "chatgpt.tokens.use.direct"}
UNUSABLE = {"invalid_grant", "invalid_refresh_token", "token_expired", "refresh_token_expired",
            "refresh_token_invalidated", "refresh_token_reused"}
MESSAGES = {
    "network": "OpenAI est injoignable. Vérifiez Internet puis réessayez.",
    "unavailable": "ChatGPT est momentanément indisponible. Réessayez plus tard.",
    "invalid_response": "La réponse de connexion est invalide. Recommencez depuis les Réglages.",
    "invalid_callback": "Ce retour de connexion est invalide ou déjà utilisé.",
    "expired": "La connexion a expiré. Reconnectez-vous depuis le PC.",
    "revoked": "La session n’est plus valide. Reconnectez-vous depuis le PC.",
    "denied": "Connexion refusée. Vous pouvez recommencer quand vous le souhaitez.",
    "cancelled": "Connexion annulée.",
    "permission_missing": "L’utilisation du forfait n’est pas autorisée. Autorisez-la depuis le PC.",
    "renewal_missing": "La connexion ne peut pas être conservée. Reconnectez-vous depuis le PC.",
    "not_eligible": "Ce compte ou cet espace ChatGPT ne permet pas l’utilisation du forfait ici.",
    "restricted": "L’accès est refusé par ChatGPT. Vérifiez les autorisations du compte.",
    "invalid_client": "L’enregistrement FitnessApp est refusé par OpenAI. La connexion doit être vérifiée.",
    "browser": "Le navigateur n’a pas pu être ouvert sur le PC. Réessayez depuis votre session Windows.",
    "busy": "Une connexion est déjà en cours. Terminez-la ou annulez-la.",
    "remote_revocation_unconfirmed": "Déconnecté sur ce PC. La révocation distante n’a pas été confirmée ; retirez FitnessApp dans les réglages ChatGPT.",
    "storage": "Le coffre ChatGPT est indisponible. Les données existantes ont été conservées.",
}


class ConnectionIssue(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(MESSAGES[code])


def text_field(value, maximum=4096) -> bool:
    return isinstance(value, str) and 0 < len(value) <= maximum and not any(ord(c) < 32 for c in value)


class OpenAIConnection:
    def __init__(self, client=None):
        self.http = client or httpx.Client(timeout=10, follow_redirects=False)
        self._metadata = None

    def close(self):
        self.http.close()

    def request(self, method: str, url: str, *, revoking=False, **kwargs):
        try:
            response = self.http.request(method, url, **kwargs)
        except (httpx.HTTPError, OSError):
            raise ConnectionIssue("network") from None
        if revoking and response.status_code == 200:
            return None
        try:
            body = response.json()
        except ValueError:
            body = None
        if response.status_code != 200:
            error = body.get("error") if isinstance(body, dict) else None
            code = error.get("code") if isinstance(error, dict) else error
            # Ne jamais journaliser URL d'autorisation, corps, en-têtes ou exception HTTP.
            request_id = response.headers.get("x-request-id", "")
            safe_id = request_id if re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", request_id) else "absent"
            logging.getLogger(__name__).warning("ChatGPT : opération %s, HTTP %s, requête %s",
                                               urlsplit(url).path, response.status_code, safe_id)
            if isinstance(code, str) and code in UNUSABLE:
                raise ConnectionIssue("expired" if "expired" in code else "revoked")
            if code == "invalid_client":
                raise ConnectionIssue("invalid_client")
            if code == "subscription_sharing_user_not_eligible":
                raise ConnectionIssue("not_eligible")
            if response.status_code == 401:
                raise ConnectionIssue("revoked")
            if response.status_code == 403:
                raise ConnectionIssue("restricted")
            raise ConnectionIssue("unavailable")
        if not isinstance(body, dict):
            raise ConnectionIssue("invalid_response")
        return body

    def metadata(self):
        if self._metadata is None:
            data = self.request("GET", ISSUER + "/.well-known/openid-configuration")
            if data.get("issuer") != ISSUER or "RS256" not in data.get("id_token_signing_alg_values_supported", []):
                raise ConnectionIssue("invalid_response")
            for name in ("authorization_endpoint", "token_endpoint", "jwks_uri", "revocation_endpoint"):
                url = data.get(name)
                if not isinstance(url, str):
                    raise ConnectionIssue("invalid_response")
                parsed = urlsplit(url)
                if parsed.scheme != "https" or parsed.netloc != "auth.openai.com" or parsed.query or parsed.fragment:
                    raise ConnectionIssue("invalid_response")
            self._metadata = data
        return self._metadata

    def identity(self, token: str, client_id: str, *, nonce: str | None, subject: str | None = None,
                 access_token: str | None = None):
        try:
            header = jwt.get_unverified_header(token)
            if header.get("alg") != "RS256" or not text_field(header.get("kid"), 256):
                raise ValueError()
            keys = self.request("GET", self.metadata()["jwks_uri"]).get("keys")
            if not isinstance(keys, list):
                raise ValueError()
            matching = [k for k in keys if isinstance(k, dict) and k.get("kid") == header["kid"]
                        and k.get("kty") == "RSA" and k.get("use", "sig") == "sig"
                        and k.get("alg", "RS256") == "RS256"]
            if len(matching) != 1:
                raise ValueError()
            key = jwt.PyJWK.from_dict(matching[0], algorithm="RS256").key
            claims = jwt.decode(token, key, algorithms=["RS256"], issuer=ISSUER, audience=client_id,
                                options={"require": ["iss", "aud", "sub", "exp", "iat"]}, leeway=15)
            if not text_field(claims.get("sub")):
                raise ValueError()
            if subject is not None and claims["sub"] != subject:
                raise ValueError()
            if (isinstance(claims["aud"], list) and len(claims["aud"]) > 1 and claims.get("azp") != client_id
                    or "azp" in claims and claims["azp"] != client_id):
                raise ValueError()
            if nonce is not None and (not isinstance(claims.get("nonce"), str)
                                      or not hmac.compare_digest(claims["nonce"].encode(), nonce.encode())):
                raise ValueError()
            if "at_hash" in claims:
                if access_token is None or not isinstance(claims["at_hash"], str):
                    raise ValueError()
                expected = base64.urlsafe_b64encode(hashlib.sha256(access_token.encode()).digest()[:16]).rstrip(b"=")
                if not hmac.compare_digest(claims["at_hash"].encode(), expected):
                    raise ValueError()
            return claims
        except (jwt.PyJWTError, ValueError, TypeError, KeyError):
            raise ConnectionIssue("invalid_response") from None

    def tokens(self, form: dict):
        data = self.request("POST", self.metadata()["token_endpoint"], data={**form, "resource": RESOURCE})
        expiry = data.get("expires_in")
        if (not text_field(data.get("access_token"), 32768) or not isinstance(data.get("token_type"), str)
                or data["token_type"].lower() != "bearer"
                or isinstance(expiry, bool) or not isinstance(expiry, (int, float))
                or not math.isfinite(expiry) or not 0 < expiry <= 86400):
            raise ConnectionIssue("invalid_response")
        for key in ("refresh_token", "id_token"):
            if key in data and not text_field(data[key], 32768):
                raise ConnectionIssue("invalid_response")
        if "scope" in data and not isinstance(data["scope"], str):
            raise ConnectionIssue("invalid_response")
        return data

    def models(self, access_token: str):
        data = self.request("GET", RESOURCE + "/models", headers={"Authorization": "Bearer " + access_token})
        raw = data.get("models")
        if not isinstance(raw, list):
            raise ConnectionIssue("invalid_response")
        models, seen = [], set()
        for item in raw:
            if not isinstance(item, dict):
                raise ConnectionIssue("invalid_response")
            if item.get("visibility") != "list":
                continue
            if not text_field(item.get("slug"), 200) or not text_field(item.get("display_name"), 200):
                raise ConnectionIssue("invalid_response")
            if item["slug"] not in seen:
                models.append({"id": item["slug"], "name": item["display_name"]})
                seen.add(item["slug"])
        return models

    def revoke(self, client_id: str, refresh_token: str):
        self.request("POST", self.metadata()["revocation_endpoint"], revoking=True,
                     data={"token": refresh_token, "token_type_hint": "refresh_token", "client_id": client_id})
