"""Transport Responses SIWC, asynchrone, sans répétition automatique d'inférence."""
import asyncio
import json
import logging
import re

import httpx2 as httpx
from pydantic import ValidationError

from .protocol import MESSAGES, RESOURCE

logger = logging.getLogger(__name__)
ERRORS = {**MESSAGES,
    'memory_error': 'Certains faits n’ont pas pu être mémorisés. Vérifiez la Mémoire du coach avant de vous appuyer dessus.',
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


async def structured(runtime, *, instructions, data, name, response, effort="low", timeout=45, strict=True):
    """Un appel structuré avec le compte choisi. Le résultat ne déclenche aucune action."""
    async with asyncio.timeout(timeout):
        token, model, identity = await asyncio.to_thread(runtime.connection.inference_credentials)
        payload = {
            "model": model,
            "input": [{"role": "developer", "content": instructions},
                      {"role": "user", "content": json.dumps(data, ensure_ascii=False)}],
            "store": False,
            "stream": True,
            "tool_choice": "required",
            "tools": [{"type": "namespace", "name": "fitness", "description": "Proposition à valider dans FitnessApp.",
                       "tools": [{"type": "function", "name": name, "description": "Rendre une proposition structurée.",
                                  "parameters": response.model_json_schema(), "strict": strict}]}],
        }
        if model.startswith(("gpt-5", "gpt-6", "o3", "o4")):
            payload["reasoning"] = {"effort": effort}
        streamed = []
        completed = None
        async for event in runtime.transport(token, payload):
            kind = event.get("type")
            if kind == "response.output_item.done":
                streamed.append(event.get("item"))
            elif kind == "response.completed":
                completed = event.get("response")
        if not isinstance(completed, dict) or completed.get("status") != "completed":
            raise InferenceError("incomplete")
        output = completed.get("output") or streamed
        if not isinstance(output, list):
            raise InferenceError("incomplete")
        calls = [item for item in output if isinstance(item, dict)
                 and item.get("type") == "function_call" and item.get("name") == name]
        if len(calls) != 1:
            raise InferenceError("incomplete")
        try:
            advice = response.model_validate_json(calls[0].get("arguments"))
        except ValidationError:
            logger.warning("Coach : proposition structurée mal formée (%s)", name)
            raise InferenceError("incomplete") from None
        if runtime.connection_changing or not await asyncio.to_thread(runtime.connection.inference_valid, identity):
            raise InferenceError("disconnected")
        return advice


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
