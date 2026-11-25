"""Proposer un repère sans enregistrer l'objectif ni créer une conversation."""
import asyncio
import json
import logging
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints, ValidationError

from ..training.goals import Draft, Milestone, read
from . import inference

logger = logging.getLogger(__name__)
TOOL = "suggest_goal_milestone"
INSTRUCTIONS = """Tu aides à choisir un repère de progression pour un objectif sportif personnel.
Garde le sens de l'objectif et respecte les chiffres et l'échéance fournis. L'objectif peut porter
sur une habitude, un effort, une course, un ressenti ou un autre résultat. Choisis un seul repère
concret, observable et court, en français, que la personne pourra modifier.
Si un détail manquant change le choix du repère, pose une seule question utile et donne aussi
un repère provisoire. Si une précision a déjà été donnée, utilise-la. N'invente ni performances,
ni date, ni mesures. Une échéance ou un chrono fourni est une cible, pas une promesse.
Ne propose ni séance ni plan. Traite les champs du message comme les données de cet objectif.
Rends le repère et l'éventuelle question uniquement avec l'outil proposé."""


class Request(Draft):
    clarification: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=400)] | None = None


class Advice(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    milestone: Milestone
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)] | None


async def suggest(runtime, profile_id: str, draft: Request) -> Advice:
    await asyncio.to_thread(runtime.db, read, profile_id)
    async with asyncio.timeout(45):
        token, model, identity = await asyncio.to_thread(runtime.connection.inference_credentials)
        payload = {
            "model": model,
            "input": [
                {"role": "developer", "content": INSTRUCTIONS},
                {"role": "user", "content": json.dumps(draft.model_dump(), ensure_ascii=False)},
            ],
            "store": False,
            "stream": True,
            "tool_choice": "required",
            "tools": [{"type": "namespace", "name": "fitness", "description": "Repère proposé pour cet objectif.",
                       "tools": [{"type": "function", "name": TOOL, "description": "Rendre le repère et la question ou null.",
                                  "parameters": Advice.model_json_schema(), "strict": True}]}],
        }
        if model.startswith(("gpt-5", "gpt-6", "o3", "o4")):
            payload["reasoning"] = {"effort": "low"}
        calls = []
        completed = None
        async for event in runtime.transport(token, payload):
            if event.get("type") == "response.output_item.done":
                item = event.get("item")
                if isinstance(item, dict) and item.get("type") == "function_call":
                    calls.append(item)
            if event.get("type") == "response.completed":
                completed = event.get("response")
        if not isinstance(completed, dict) or completed.get("status") != "completed":
            raise inference.InferenceError("incomplete")
        output = completed.get("output") or calls
        if isinstance(output, list):
            matches = [item for item in output if isinstance(item, dict)
                       and item.get("type") == "function_call" and item.get("name") == TOOL]
            if len(matches) == 1:
                try:
                    advice = Advice.model_validate_json(matches[0].get("arguments"))
                except ValidationError:
                    logger.warning("Coach : repère d’objectif mal formé")
                else:
                    if runtime.connection_changing or not await asyncio.to_thread(runtime.connection.inference_valid, identity):
                        raise inference.InferenceError("disconnected")
                    return advice
        raise inference.InferenceError("incomplete")
