"""Objectif explicite du profil, confirmé indépendamment du chat."""
from datetime import date
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ..storage.models import TrainingGoal
from .profiles import ProfileConflict, get_profile

Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]
Milestone = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    description: Description
    target_date: str | None = Field(default=None, pattern=r"^[0-9]{4}-[0-9]{2}-[0-9]{2}$")

    @field_validator("target_date")
    @classmethod
    def calendar_date(cls, value):
        if value is not None:
            date.fromisoformat(value)
        return value


class Save(Draft):
    milestone: Milestone
    revision: int = Field(ge=0)


class Goal(Save):
    model_config = ConfigDict(from_attributes=True)


def read(session, profile_id: str) -> Goal | None:
    get_profile(session, profile_id)
    row = session.get(TrainingGoal, profile_id)
    return Goal.model_validate(row) if row else None


def save(session, profile_id: str, payload: Save) -> Goal:
    """Sous le verrou d'écriture, une ancienne feuille ne remplace pas une modification récente."""
    get_profile(session, profile_id)
    row = session.get(TrainingGoal, profile_id)
    values = payload.model_dump(exclude={"revision"})
    if row and all(getattr(row, key) == value for key, value in values.items()):
        return Goal.model_validate(row)  # Réessai après un accusé de réception perdu.
    revision = row.revision if row else 0
    if revision != payload.revision:
        raise ProfileConflict("L’objectif a changé sur un autre écran. Rechargez-le avant de modifier.")
    if row is None:
        row = TrainingGoal(profile_id=profile_id)
        session.add(row)
    for field, value in values.items():
        setattr(row, field, value)
    row.revision = revision + 1
    return Goal.model_validate(row)
