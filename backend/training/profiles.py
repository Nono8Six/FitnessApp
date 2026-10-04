"""Profils d'entraînement. Ce n'est pas une authentification : chaque appareil choisit son profil."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import Session

from ..storage.models import Profile

WEEKLY_GOAL_MIN = 1
WEEKLY_GOAL_MAX = 14
SpeedUnit = Literal["kmh", "pace"]

# Réglages par défaut, modifiables ensuite ; jamais réappliqués à un profil existant.
DEFAULT_PROFILES = (("arnaud", "Arnaud"), ("ophelie", "Ophélie"))
DEFAULT_WEEKLY_GOAL = 3
DEFAULT_SPEED_UNIT: SpeedUnit = "kmh"


class ProfileNotFound(LookupError):
    pass


class ProfileOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    weekly_goal: int
    speed_unit: SpeedUnit
    created_at: str
    updated_at: str


class ProfileUpdate(BaseModel):
    """Champs modifiables. Types stricts : ni booléen, ni nombre décimal, ni texte pour un entier."""

    model_config = ConfigDict(extra="forbid", strict=True)

    weekly_goal: int | None = Field(default=None, ge=WEEKLY_GOAL_MIN, le=WEEKLY_GOAL_MAX)
    speed_unit: SpeedUnit | None = None

    @model_validator(mode="after")
    def at_least_one_value(self):
        if not self.model_fields_set:
            raise ValueError("aucun champ à modifier")
        for name in self.model_fields_set:
            if getattr(self, name) is None:
                raise ValueError(f"{name} ne peut pas être vide")
        return self


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def ensure_default_profiles(session: Session) -> int:
    """Crée les profils manquants ; un profil existant n'est jamais modifié. Renvoie le nombre créé."""
    now = utc_now()
    created = 0
    for profile_id, name in DEFAULT_PROFILES:
        result = session.execute(
            insert(Profile)
            .values(id=profile_id, name=name, weekly_goal=DEFAULT_WEEKLY_GOAL, speed_unit=DEFAULT_SPEED_UNIT,
                    created_at=now, updated_at=now)
            .on_conflict_do_nothing(index_elements=[Profile.id])
        )
        created += result.rowcount
    return created


def list_profiles(session: Session) -> list[ProfileOut]:
    rows = session.scalars(select(Profile).order_by(Profile.created_at, Profile.id))
    return [ProfileOut.model_validate(row) for row in rows]


def get_profile(session: Session, profile_id: str) -> ProfileOut:
    row = session.get(Profile, profile_id)
    if row is None:
        raise ProfileNotFound(profile_id)
    return ProfileOut.model_validate(row)


def update_profile(session: Session, profile_id: str, changes: ProfileUpdate) -> ProfileOut:
    # L'écriture vient en premier : SQLite prend le verrou d'écriture sans lecture préalable,
    # donc deux appareils qui modifient en même temps attendent leur tour au lieu d'échouer.
    values = changes.model_dump(include=changes.model_fields_set)
    result = session.execute(
        update(Profile).where(Profile.id == profile_id).values(**values, updated_at=utc_now())
        .execution_options(synchronize_session=False)
    )
    if result.rowcount == 0:
        raise ProfileNotFound(profile_id)
    session.expire_all()
    return get_profile(session, profile_id)
