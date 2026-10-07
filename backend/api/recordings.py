import logging
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError

from ..recording import service
from ..training.profiles import ProfileNotFound

router = APIRouter(prefix="/api/profiles/{profile_id}/recordings")
LOGGER = logging.getLogger(__name__)


class Feeling(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    feeling: int | None = Field(ge=1, le=10)


@contextmanager
def transaction(request, *, write=False):
    db = request.app.state.database
    try:
        with (db.write() if write else db.transaction()) as session:
            yield session
    except (ProfileNotFound, service.RecordingNotFound):
        raise HTTPException(404, "Bilan introuvable dans ce profil.") from None
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        LOGGER.exception("Accès au bilan impossible")
        raise HTTPException(503, "Stockage des bilans indisponible. Réessayez.") from None


@router.get("")
def list_recordings(profile_id: str, request: Request, after: str | None = Query(None, pattern=r"^[a-f0-9]{32}$"),
                    workout_id: str | None = Query(None, pattern=r"^[a-f0-9]{32}$")):
    with transaction(request) as session:
        return service.list_recordings(session, profile_id, after, workout_id)


@router.get("/{session_id}")
def read(profile_id: str, session_id: str, request: Request):
    with transaction(request) as session:
        return service.read(session, profile_id, session_id)


@router.patch("/{session_id}/feeling")
def feeling(profile_id: str, session_id: str, data: Feeling, request: Request):
    with transaction(request, write=True) as session:
        return service.set_feeling(session, profile_id, session_id, data.feeling)
