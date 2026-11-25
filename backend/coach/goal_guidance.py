"""Proposer un repère sans enregistrer l'objectif ni créer une conversation."""
import asyncio
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from ..training.goals import Draft, Milestone, read
from . import inference

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
    return await inference.structured(runtime, instructions=INSTRUCTIONS, data=draft.model_dump(), name=TOOL, response=Advice)
