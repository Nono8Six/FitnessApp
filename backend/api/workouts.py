"""Routes minces : toutes les règles de séance résident dans training.workouts."""
import logging
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.exc import SQLAlchemyError

from .profiles import database, validation_message as profile_validation_message
from ..training import workouts
from ..training.profiles import ProfileNotFound
from ..training.workouts import SelectionInput, WorkoutInput, WorkoutUpdate

router = APIRouter(prefix="/api/profiles/{profile_id}/workouts")
logger = logging.getLogger(__name__)


@contextmanager
def transaction(request: Request, *, write: bool = False):
    db = database(request)
    try:
        with (db.write() if write else db.transaction()) as session:
            yield session
    except ProfileNotFound:
        raise HTTPException(404, "Profil introuvable") from None
    except workouts.WorkoutNotFound:
        raise HTTPException(404, "Séance introuvable dans ce profil") from None
    except workouts.WorkoutConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        logger.exception("Accès aux séances impossible : %s %s", request.method, request.url.path)
        raise HTTPException(503, "Base de données indisponible. Réessayez dans quelques instants.") from None


@router.get("")
def list_workouts(profile_id: str, request: Request):
    with transaction(request) as session:
        return workouts.list_workouts(session, profile_id)


@router.post("/preview")
def preview(profile_id: str, data: WorkoutInput, request: Request):
    with transaction(request) as session:
        workouts.get_profile(session, profile_id)
        return workouts.preview(data)


@router.patch("/selection")
def select_workout(profile_id: str, data: SelectionInput, request: Request):
    with transaction(request, write=True) as session:
        return workouts.select_workout(session, profile_id, data.workout_id)


@router.post("", status_code=201)
def create_workout(profile_id: str, data: WorkoutInput, request: Request):
    with transaction(request, write=True) as session:
        return workouts.create_workout(session, profile_id, data)


@router.get("/{workout_id}")
def get_workout(profile_id: str, workout_id: str, request: Request):
    with transaction(request) as session:
        return workouts.get_workout(session, profile_id, workout_id)


@router.patch("/{workout_id}")
def update_workout(profile_id: str, workout_id: str, data: WorkoutUpdate, request: Request):
    with transaction(request, write=True) as session:
        return workouts.update_workout(session, profile_id, workout_id, data)


@router.post("/{workout_id}/duplicate", status_code=201)
def duplicate_workout(profile_id: str, workout_id: str, request: Request):
    with transaction(request, write=True) as session:
        return workouts.duplicate_workout(session, profile_id, workout_id)


@router.delete("/{workout_id}")
def delete_workout(profile_id: str, workout_id: str, request: Request):
    with transaction(request, write=True) as session:
        return workouts.delete_workout(session, profile_id, workout_id)


@router.get("/{workout_id}/versions")
def versions(profile_id: str, workout_id: str, request: Request):
    with transaction(request) as session:
        return workouts.versions(session, profile_id, workout_id)


FIELDS = {
    "name": "Nom : de 1 à 80 caractères, sans caractère de contrôle",
    "sec": "Durée : nombre entier de secondes, de 30 à 3 600",
    "speed": "Vitesse : de 1 à 16 km/h",
    "incline": "Pente : de 0 à 10 %",
    "repeat": "Répétitions : nombre entier de 1 à 120",
    "steps": "Une répétition doit contenir de 1 à 120 blocs",
    "items": "La séance doit contenir de 1 à 120 blocs ou répétitions",
    "kind": "Type de bloc inconnu",
    "base_version": "La version d’origine est requise pour modifier une séance",
    "workout_id": "Choisissez une séance de ce profil",
}


def validation_issue(errors: list[dict], body: object) -> dict:
    # Une union Step/Repeat produit des erreurs pour les deux branches.
    # Ne montrer que celles correspondant à la forme réellement envoyée.
    for error in errors:
        loc = error.get("loc", ())
        if "items" in loc and isinstance(body, dict):
            at = loc.index("items") + 1
            if len(loc) > at and isinstance(loc[at], int):
                index = loc[at]
                items = body.get("items")
                if isinstance(items, list) and index < len(items) and isinstance(items[index], dict):
                    branch = "Repeat" if "repeat" in items[index] else "Step"
                    if loc[at + 1:at + 2] and loc[at + 1] in ("Step", "Repeat") and loc[at + 1] != branch:
                        continue
        field = next((p for p in reversed(loc) if isinstance(p, str) and p != "body"), "")
        prefix = ""
        if "items" in loc and len(loc) > loc.index("items") + 1 and isinstance(loc[loc.index("items") + 1], int):
            prefix = f"Bloc {loc[loc.index('items') + 1] + 1} · "
        if error.get("type") == "extra_forbidden":
            message = prefix + f"Champ non autorisé : {field}"
        elif field in FIELDS:
            message = prefix + FIELDS[field]
        else:
            message = profile_validation_message([error])
        return {"path": [p for p in loc if p not in ("body", "Step", "Repeat")], "message": message}
    return {"path": [], "message": "Séance invalide"}
