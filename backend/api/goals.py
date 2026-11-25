import logging
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError

from ..coach import goal_guidance, inference
from ..coach.protocol import ConnectionIssue
from ..training import goals
from ..training.profiles import ProfileConflict, ProfileNotFound

router = APIRouter(prefix="/api/profiles/{profile_id}/goal")
logger = logging.getLogger(__name__)


@contextmanager
def goal_storage():
    try:
        yield
    except ProfileNotFound:
        raise HTTPException(404, "Profil introuvable.") from None
    except ProfileConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError as exc:
        logger.error("Objectif : accès au stockage impossible (%s)", type(exc).__name__)
        raise HTTPException(503, "Stockage local indisponible.") from None


@router.get("")
def read(profile_id: str, request: Request) -> goals.Goal | None:
    with goal_storage(), request.app.state.database.transaction() as session:
        return goals.read(session, profile_id)


@router.patch("")
def save(profile_id: str, draft: goals.Save, request: Request) -> goals.Goal:
    with goal_storage(), request.app.state.database.write() as session:
        return goals.save(session, profile_id, draft)


@router.post("/suggest")
async def suggest(profile_id: str, draft: goal_guidance.Request, request: Request) -> goal_guidance.Advice:
    runtime = request.app.state.coach
    if runtime.connection_changing:
        raise HTTPException(409, "La connexion ChatGPT change. Réessayez dans un instant.")
    try:
        with goal_storage():
            return await goal_guidance.suggest(runtime, profile_id, draft)
    except TimeoutError:
        raise HTTPException(408, "Le coach met trop de temps. Réessayez ou saisissez votre repère.") from None
    except ConnectionIssue as exc:
        raise HTTPException(409, str(exc)) from None
    except inference.InferenceError as exc:
        detail = ("Le coach n’a pas renvoyé de repère utilisable. Réessayez ou saisissez le vôtre."
                  if exc.code == "incomplete" else str(exc))
        raise HTTPException(429 if exc.code == "limit" else 424, detail) from None
