from fastapi import APIRouter, HTTPException, Request

from ..storage import Database
from ..training import profiles
from ..training.profiles import ProfileConflict, ProfileCreate, ProfileNotFound, ProfileOut, ProfileUpdate

router = APIRouter(prefix="/api/profiles")


def database(request: Request) -> Database:
    return request.app.state.database


@router.get("")
def list_profiles(request: Request) -> list[ProfileOut]:
    with database(request).transaction() as session:
        return profiles.list_profiles(session)


@router.post("", status_code=201)
def create_profile(data: ProfileCreate, request: Request) -> ProfileOut:
    try:
        with database(request).write() as session:
            return profiles.create_profile(session, data)
    except ProfileConflict as exc:
        raise HTTPException(409, str(exc)) from None


@router.get("/{profile_id}")
def get_profile(profile_id: str, request: Request) -> ProfileOut:
    try:
        with database(request).transaction() as session:
            return profiles.get_profile(session, profile_id)
    except ProfileNotFound:
        raise HTTPException(404, "Profil introuvable") from None


@router.patch("/{profile_id}")
def update_profile(profile_id: str, changes: ProfileUpdate, request: Request) -> ProfileOut:
    try:
        with database(request).write() as session:
            return profiles.update_profile(session, profile_id, changes)
    except ProfileNotFound:
        raise HTTPException(404, "Profil introuvable") from None
    except ProfileConflict as exc:
        raise HTTPException(409, str(exc)) from None


@router.delete("/{profile_id}")
def delete_profile(profile_id: str, request: Request) -> list[ProfileOut]:
    """Renvoie les profils restants."""
    try:
        with database(request).write() as session:
            return profiles.delete_profile(session, profile_id)
    except ProfileNotFound:
        raise HTTPException(404, "Profil introuvable") from None
    except ProfileConflict as exc:
        raise HTTPException(409, str(exc)) from None


FIELDS = {
    "name": f"Nom : de 1 à {profiles.NAME_MAX} caractères, sans caractère de contrôle",
    "weekly_goal": f"Objectif hebdomadaire : nombre entier de {profiles.WEEKLY_GOAL_MIN} à {profiles.WEEKLY_GOAL_MAX}",
    "speed_unit": "Unité : « kmh » ou « pace »",
}


def validation_message(errors: list[dict]) -> str:
    """Première erreur de validation, en une phrase lisible dans l'interface."""
    if not errors:
        return "Requête invalide"
    error = errors[0]
    kind = error.get("type", "")
    field = next((str(part) for part in reversed(error.get("loc", ())) if isinstance(part, str) and part != "body"), "")
    if kind == "json_invalid":
        return "JSON invalide"
    if kind == "extra_forbidden":
        return f"Champ non modifiable : {field}"
    if kind == "missing" and not field:
        return "Corps JSON requis"
    if kind == "missing" and field in FIELDS:
        return f"Champ requis : {field}"
    if field in FIELDS:
        return FIELDS[field]
    if kind == "value_error":
        return "Requête invalide : " + str(error.get("msg", "")).removeprefix("Value error, ")
    if kind == "model_attributes_type" or kind.endswith("_type"):
        return "Objet JSON requis"
    return "Requête invalide"
