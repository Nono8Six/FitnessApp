"""Transport Responses SIWC, asynchrone, sans répétition automatique d'inférence."""
import json
import logging
import re

import httpx2 as httpx

from .protocol import MESSAGES, RESOURCE

logger = logging.getLogger(__name__)
ERRORS = {**MESSAGES,
    'workout_invalid': 'La proposition reste invalide. Aucun programme correspondant n’a été enregistré. Précisez la demande pour réessayer.',
    "limit": "Limite d’utilisation ChatGPT atteinte. Consultez votre usage avant de réessayer.",
    "usage_unavailable": "L’usage du forfait ne peut pas être vérifié. Réessayez plus tard.",
    "unsupported": "Ce modèle ou cette fonction n’est pas disponible avec la connexion actuelle.",
    "context": "Le contexte est trop long pour ce modèle. Ouvrez une nouvelle conversation.",
    "incomplete": "La réponse s’est arrêtée avant sa fin. Le texte reçu est conservé.",
    "tool_limit": "La recherche demande trop d’étapes. Précisez la séance ou la période recherchée.",
    "tool_error": "La lecture d’une donnée a échoué. Le texte reçu est conservé.",
    "persistence": "Enregistrement local impossible. Rechargez la conversation pour vérifier le texte conservé.",
    "restart": "Réponse interrompue par le redémarrage du PC ou du serveur.",
    "interrupted": "Réponse interrompue. Le texte reçu est conservé.",
    "timeout": "ChatGPT n’a pas terminé dans le délai prévu. Le texte reçu est conservé.",
}
CODE_MAP = {
    "subscription_sharing_usage_limit_exceeded": "limit",
    "subscription_sharing_usage_unavailable": "usage_unavailable",
    "subscription_sharing_user_unavailable": "unavailable",
    "subscription_sharing_user_not_eligible": "not_eligible",
    "subscription_sharing_unsupported_capability": "unsupported",
    "subscription_sharing_route_not_supported": "restricted",
    "subscription_sharing_invalid_user": "revoked",
    "chatpass_v2_scope_not_authorized": "permission_missing",
    "chatpass_v2_invalid_authorization_context": "restricted",
    "model_not_found": "model_unavailable", "context_length_exceeded": "context",
}


class InferenceError(Exception):
    def __init__(self, code):
        self.code = code
        super().__init__(ERRORS.get(code, ERRORS["unavailable"]))


def failure(body, status=None, request_id=""):
    error = body.get("error", {}) if isinstance(body, dict) else {}
    error = error if isinstance(error, dict) else {}
    raw_code = error.get("code")
    safe = lambda v: v if isinstance(v, str) and re.fullmatch(r"[a-zA-Z0-9_.-]{1,100}", v) else "absent"
    # Conserve le statut, la forme, le code, le paramètre, l'identifiant. Jamais de corps ou secret.
    logger.warning("Coach : HTTP %s, forme %s, code %s, paramètre %s, requête %s", status,
        "error" if error else "detail" if isinstance(body, dict) and "detail" in body else "autre",
        safe(raw_code), safe(error.get("param")), safe(request_id))
    code = CODE_MAP.get(raw_code) if isinstance(raw_code, str) else None
    code = code or {401: "revoked", 403: "restricted", 429: "limit", 404: "model_unavailable",
                   400: "unsupported"}.get(status, "unavailable")
    return InferenceError(code)


async def events(token, payload, *, client=None):
    """SSE multi-lignes ; EOF sans événement terminal reste un échec."""
    owned_client = client is None
    client = client or httpx.AsyncClient(timeout=httpx.Timeout(75, connect=15), follow_redirects=False)
    try:
        async with client.stream("POST", RESOURCE + "/responses", json=payload,
                headers={"Authorization": "Bearer " + token, "Accept": "text/event-stream"}) as response:
            request_id = response.headers.get("x-request-id", "")
            if response.status_code != 200:
                raw = await response.aread()
                try:
                    body = json.loads(raw)
                except (ValueError, UnicodeError):
                    body = None
                raise failure(body, response.status_code, request_id)
            data = []
            size = 0
            async for line in response.aiter_lines():
                if line.startswith("data:"):
                    value = line[5:].lstrip(" ")
                    data.append(value)
                    size += len(value)
                    if size > 2_000_000:
                        raise InferenceError("incomplete")
                elif not line and data:
                    raw = "\n".join(data)
                    data, size = [], 0
                    if raw == "[DONE]":
                        continue
                    try:
                        event = json.loads(raw)
                    except ValueError:
                        raise InferenceError("incomplete") from None
                    if not isinstance(event, dict):
                        raise InferenceError("incomplete")
                    if event.get("type") == "response.failed":
                        raise failure(event.get("response"), request_id=request_id)
                    if event.get("type") == "error":
                        raise failure({"error": event}, request_id=request_id)
                    if event.get("type") == "response.incomplete":
                        raise InferenceError("incomplete")
                    yield event
                    if event.get("type") == "response.completed":
                        return
    except (httpx.HTTPError, OSError):
        raise InferenceError("network") from None
    finally:
        if owned_client:
            await client.aclose()
