import logging
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Query, Request
from sqlalchemy.exc import SQLAlchemyError

from ..coach import inference, schedule_guidance
from ..coach.protocol import ConnectionIssue
from ..recording.service import RecordingNotFound
from ..training import schedule
from ..training.execution import ACTIVE
from ..training.profiles import ProfileConflict, ProfileNotFound

router = APIRouter(prefix="/api/profiles/{profile_id}/schedule")
logger = logging.getLogger(__name__)


@contextmanager
def errors():
    try:
        yield
    except (ProfileNotFound, RecordingNotFound):
        raise HTTPException(404, "Profil ou bilan introuvable.") from None
    except ProfileConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError as exc:
        logger.error("Planning : accès au stockage impossible (%s)", type(exc).__name__)
        raise HTTPException(503, "Planning local indisponible.") from None


def active(request):
    engine = request.app.state.execution
    workout = engine.workout
    if workout and (engine.phase in ACTIVE or engine.recorder.session_id and not engine.recorder.finalized):
        return workout["id"]
    return None


@router.get("")
def read(profile_id: str, request: Request, week: str | None = Query(default=None, max_length=10)):
    runtime = request.app.state.coach
    with errors(), runtime.database.transaction() as session:
        return schedule.view(session, profile_id, week, runtime.simulation, active(request))


@router.post("/suggest")
async def suggest(profile_id: str, body: schedule.Request, request: Request):
    runtime = request.app.state.coach
    if runtime.connection_changing:
        raise HTTPException(409, "La connexion ChatGPT change. Réessayez dans un instant.")
    if profile_id in runtime.planning_profiles:
        raise HTTPException(409, "Le coach prépare déjà le planning de ce profil.")
    runtime.planning_profiles.add(profile_id)
    try:
        with errors():
            return await schedule_guidance.suggest(runtime, profile_id, body, lambda: active(request))
    except TimeoutError:
        raise HTTPException(408, "Le coach met trop de temps. Vos créneaux sont conservés à l’écran.") from None
    except ConnectionIssue as exc:
        raise HTTPException(409, str(exc)) from None
    except inference.InferenceError as exc:
        detail = ("Le coach n’a pas renvoyé de planning utilisable. Réessayez."
                  if exc.code == "incomplete" else str(exc))
        raise HTTPException(429 if exc.code == "limit" else 424, detail) from None
    finally:
        runtime.planning_profiles.discard(profile_id)


@router.post("/{week}/accept")
def accept(profile_id: str, week: schedule.Day, body: schedule.Accept, request: Request):
    runtime = request.app.state.coach
    with errors(), runtime.database.write() as session:
        return schedule.accept(session, profile_id, week, body, runtime.simulation, active(request))


@router.patch("/{week}/outdoor/{entry_id}")
def outdoor(profile_id: str, week: schedule.Day, entry_id: schedule.ID, body: schedule.OutdoorLog, request: Request):
    runtime = request.app.state.coach
    with errors(), runtime.database.write() as session:
        return schedule.outdoor(session, profile_id, week, entry_id, body, runtime.simulation, active(request))
