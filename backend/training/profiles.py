"""Profils d'entraînement. Ce n'est pas une authentification : chaque appareil choisit son profil.

Un profil se crée, se renomme et se supprime. Son identifiant est fixé à la création et ne change
jamais, même si le nom change. Il reste toujours au moins un profil.
"""

import re
import unicodedata
from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..storage.models import Profile

WEEKLY_GOAL_MIN = 1
WEEKLY_GOAL_MAX = 14
NAME_MAX = 40
SpeedUnit = Literal["kmh", "pace"]

# Profils du premier lancement : créés uniquement quand la table est vide (une base neuve,
# puisque le dernier profil ne peut pas être supprimé). Un profil supprimé ne revient donc jamais.
DEFAULT_PROFILES = (("arnaud", "Arnaud"), ("ophelie", "Ophélie"))
DEFAULT_WEEKLY_GOAL = 3
DEFAULT_SPEED_UNIT: SpeedUnit = "kmh"


class ProfileNotFound(LookupError):
    pass


class ProfileConflict(ValueError):
    """Règle métier refusée : le message est affiché tel quel."""


def clean_name(value: str) -> str:
    name = unicodedata.normalize("NFC", value).strip()
    if not 1 <= len(name) <= NAME_MAX:
        raise ValueError(f"de 1 à {NAME_MAX} caractères")
    if any(unicodedata.category(c).startswith("C") for c in name):
        raise ValueError("caractères de contrôle interdits")
    return name


Name = Annotated[str, AfterValidator(clean_name)]
WeeklyGoal = Annotated[int, Field(ge=WEEKLY_GOAL_MIN, le=WEEKLY_GOAL_MAX)]
Weight = Annotated[float, Field(ge=20, le=300, allow_inf_nan=False)]


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    weekly_goal: int
    speed_unit: SpeedUnit
    weight_kg: float | None
    created_at: str
    updated_at: str


class ProfileCreate(BaseModel):
    """Types stricts : ni booléen, ni nombre décimal, ni texte pour un entier."""

    model_config = ConfigDict(extra="forbid", strict=True)

    name: Name
    weekly_goal: WeeklyGoal = DEFAULT_WEEKLY_GOAL
    speed_unit: SpeedUnit = DEFAULT_SPEED_UNIT
    weight_kg: Weight | None = None


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    name: Name | None = None
    weekly_goal: WeeklyGoal | None = None
    speed_unit: SpeedUnit | None = None
    weight_kg: Weight | None = None

    @model_validator(mode="after")
    def at_least_one_value(self):
        if not self.model_fields_set:
            raise ValueError("aucun champ à modifier")
        for name in self.model_fields_set:
            if name != "weight_kg" and getattr(self, name) is None:
                raise ValueError(f"{name} ne peut pas être vide")
        return self


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def name_key(name: str) -> str:
    """Deux noms identiques à la casse près (« léa », « LÉA ») désignent le même profil."""
    return unicodedata.normalize("NFC", name).casefold()


def slug(name: str) -> str:
    ascii_name = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", ascii_name.lower()).strip("-")[:24].strip("-") or "profil"


def ensure_default_profiles(session: Session) -> int:
    """Crée Arnaud et Ophélie dans une base sans profil. Renvoie le nombre créé."""
    if session.scalar(select(func.count()).select_from(Profile)):
        return 0
    now = utc_now()
    session.add_all(
        Profile(id=profile_id, name=name, weekly_goal=DEFAULT_WEEKLY_GOAL, speed_unit=DEFAULT_SPEED_UNIT,
                created_at=now, updated_at=now)
        for profile_id, name in DEFAULT_PROFILES
    )
    return len(DEFAULT_PROFILES)


def list_profiles(session: Session) -> list[ProfileOut]:
    rows = session.scalars(select(Profile).order_by(Profile.created_at, Profile.id))
    return [ProfileOut.model_validate(row) for row in rows]


def _row(session: Session, profile_id: str) -> Profile:
    row = session.get(Profile, profile_id)
    if row is None:
        raise ProfileNotFound(profile_id)
    return row


def get_profile(session: Session, profile_id: str) -> ProfileOut:
    return ProfileOut.model_validate(_row(session, profile_id))


def _check_name_free(session: Session, name: str, except_id: str | None = None) -> None:
    key = name_key(name)
    for other_id, other_name in session.execute(select(Profile.id, Profile.name)):
        if other_id != except_id and name_key(other_name) == key:
            raise ProfileConflict(f"Un profil s’appelle déjà {other_name}")


def _flush(session: Session) -> None:
    try:
        session.flush()
    except IntegrityError as exc:
        # Garde-fou de la base (index unique) ; le service a normalement refusé avant.
        raise ProfileConflict("Un profil porte déjà ce nom") from exc


def create_profile(session: Session, data: ProfileCreate) -> ProfileOut:
    """À appeler dans une transaction d'écriture (Database.write)."""
    _check_name_free(session, data.name)
    base = slug(data.name)
    taken = set(session.scalars(select(Profile.id)))
    profile_id = base
    n = 2
    while profile_id in taken:
        profile_id = f"{base}-{n}"
        n += 1
    now = utc_now()
    row = Profile(id=profile_id, name=data.name, weekly_goal=data.weekly_goal, speed_unit=data.speed_unit,
                  weight_kg=data.weight_kg, created_at=now, updated_at=now)
    session.add(row)
    _flush(session)
    return ProfileOut.model_validate(row)


def update_profile(session: Session, profile_id: str, changes: ProfileUpdate) -> ProfileOut:
    """À appeler dans une transaction d'écriture (Database.write)."""
    row = _row(session, profile_id)
    values = changes.model_dump(include=changes.model_fields_set)
    if "name" in values:
        _check_name_free(session, values["name"], except_id=profile_id)
    for field, value in values.items():
        setattr(row, field, value)
    row.updated_at = utc_now()
    _flush(session)
    return ProfileOut.model_validate(row)


def delete_profile(session: Session, profile_id: str) -> list[ProfileOut]:
    """Supprime le profil et, par cascade, toutes ses données. Renvoie les profils restants.
    À appeler dans une transaction d'écriture (Database.write)."""
    _row(session, profile_id)
    if session.scalar(select(func.count()).select_from(Profile)) <= 1:
        raise ProfileConflict("Il faut garder au moins un profil")
    session.execute(delete(Profile).where(Profile.id == profile_id))
    return list_profiles(session)
