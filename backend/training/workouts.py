"""Séances enregistrées uniquement : aucune commande ni dépendance au tapis.

Bornes de conception : 1–16 km/h, 0–10 % (consigne d'Arnaud),
blocs de 30 s à 60 min. Les plafonds d'exécution du POC restent distincts.
"""
import unicodedata
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from ..storage.models import Workout, WorkoutSelection, WorkoutVersion
from .profiles import get_profile, utc_now
from .energy import estimate

MAX_SECONDS = 3600
MAX_SEGMENTS = 120
KIND_LABEL = {"warmup": "Échauffement", "steady": "Allure continue", "run": "Course",
              "recover": "Récupération", "cooldown": "Retour au calme"}


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, allow_inf_nan=False)


class Step(Input):
    kind: Literal["warmup", "steady", "run", "recover", "cooldown"]
    sec: Annotated[int, Field(ge=30, le=MAX_SECONDS)]
    speed: Annotated[float, Field(ge=1, le=16)]
    incline: Annotated[float, Field(ge=0, le=10)]
    # Compatibilité des anciennes versions/clients : accepté, ignoré par le calcul,
    # et absent des nouveaux snapshots. Le choix dépend uniquement de la vitesse.
    gait: Literal["auto", "walk", "run"] = Field(default="auto", exclude=True)


class Repeat(Input):
    repeat: Annotated[int, Field(ge=1, le=MAX_SEGMENTS)]
    steps: Annotated[list[Step], Field(min_length=1, max_length=MAX_SEGMENTS)]


class WorkoutInput(Input):
    name: Annotated[str, Field(min_length=1, max_length=80)]
    items: Annotated[list[Step | Repeat], Field(min_length=1, max_length=MAX_SEGMENTS)]

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = unicodedata.normalize("NFC", value).strip()
        if not value or any(unicodedata.category(c).startswith("C") for c in value):
            raise ValueError("Le nom doit contenir du texte, sans caractère de contrôle")
        return value

    @model_validator(mode="after")
    def totals(self):
        # Compter avant d'allouer : une répétition excessive n'est jamais développée.
        count = sum(len(i.steps) * i.repeat if isinstance(i, Repeat) else 1 for i in self.items)
        if count > MAX_SEGMENTS:
            raise ValueError("120 segments maximum après répétitions")
        seconds = sum(sum(s.sec for s in i.steps) * i.repeat if isinstance(i, Repeat) else i.sec for i in self.items)
        if seconds > MAX_SECONDS:
            raise ValueError("Durée maximale : 60 minutes, répétitions comprises")
        return self


class WorkoutUpdate(WorkoutInput):
    base_version: Annotated[int, Field(ge=1)]


class SelectionInput(Input):
    workout_id: str | None


class WorkoutNotFound(Exception):
    pass


class WorkoutConflict(Exception):
    pass


def preview(data: WorkoutInput, weight_kg: float | None = None) -> dict:
    """Expansion ordonnée et calculs partagés par aperçu, lecture et enregistrement."""
    blocks = []
    elapsed = 0
    distance = 0.0
    for item in data.items:
        steps = item.steps * item.repeat if isinstance(item, Repeat) else [item]
        for step in steps:
            blocks.append({**step.model_dump(), "index": len(blocks), "label": KIND_LABEL[step.kind],
                           "start": elapsed, "end": elapsed + step.sec})
            elapsed += step.sec
            distance += step.speed * step.sec / 3600
    return {"blocks": blocks, "summary": {"sec": elapsed, "km": round(distance, 6), "count": len(blocks),
            "minSpeed": min(b["speed"] for b in blocks), "maxSpeed": max(b["speed"] for b in blocks),
            **estimate(blocks, weight_kg)}}


def _workout(session: Session, profile_id: str, workout_id: str) -> Workout:
    get_profile(session, profile_id)
    row = session.get(Workout, workout_id)
    if row is None or row.profile_id != profile_id:
        raise WorkoutNotFound()
    return row


def _latest(session: Session, workout_id: str) -> WorkoutVersion:
    return session.scalars(select(WorkoutVersion).where(WorkoutVersion.workout_id == workout_id)
                           .order_by(WorkoutVersion.version.desc()).limit(1)).one()


def _out(row: WorkoutVersion, weight_kg: float | None) -> dict:
    data = WorkoutInput(name=row.name, items=row.items)
    return {"id": row.workout_id, "version": row.version, "name": row.name, "items": row.items,
            "author": row.author, "author_name": row.author_name, "created_at": row.created_at, **preview(data, weight_kg)}


def get_workout(session: Session, profile_id: str, workout_id: str) -> dict:
    _workout(session, profile_id, workout_id)
    return _out(_latest(session, workout_id), get_profile(session, profile_id).weight_kg)


def list_workouts(session: Session, profile_id: str) -> dict:
    profile = get_profile(session, profile_id)
    latest = select(WorkoutVersion.workout_id, func.max(WorkoutVersion.version).label("version")).group_by(
        WorkoutVersion.workout_id).subquery()
    rows = session.scalars(select(WorkoutVersion).join(Workout).join(latest,
        (WorkoutVersion.workout_id == latest.c.workout_id) & (WorkoutVersion.version == latest.c.version))
        .where(Workout.profile_id == profile_id).order_by(WorkoutVersion.created_at.desc(), Workout.id))
    selected = session.get(WorkoutSelection, profile_id)
    return {"workouts": [_out(row, profile.weight_kg) for row in rows], "selected_id": selected.workout_id if selected else None}


def _add_version(session: Session, profile_id: str, workout_id: str, version: int, data: WorkoutInput) -> dict:
    row = WorkoutVersion(workout_id=workout_id, version=version, name=data.name,
        items=[i.model_dump() for i in data.items], author="human",
        author_name=get_profile(session, profile_id).name, created_at=utc_now())
    session.add(row)
    session.flush()
    return _out(row, get_profile(session, profile_id).weight_kg)


def create_workout(session: Session, profile_id: str, data: WorkoutInput) -> dict:
    get_profile(session, profile_id)
    row = Workout(id=uuid4().hex, profile_id=profile_id, created_at=utc_now())
    session.add(row)
    session.flush()
    return _add_version(session, profile_id, row.id, 1, data)


def update_workout(session: Session, profile_id: str, workout_id: str, data: WorkoutUpdate) -> dict:
    _workout(session, profile_id, workout_id)
    previous = _latest(session, workout_id)
    if previous.version != data.base_version:
        raise WorkoutConflict("Cette séance a changé sur un autre écran. Rechargez-la avant de modifier.")
    return _add_version(session, profile_id, workout_id, previous.version + 1, data)


def duplicate_workout(session: Session, profile_id: str, workout_id: str) -> dict:
    source = get_workout(session, profile_id, workout_id)
    return create_workout(session, profile_id, WorkoutInput(name=source["name"][:72] + " · copie", items=source["items"]))


def delete_workout(session: Session, profile_id: str, workout_id: str) -> dict:
    _workout(session, profile_id, workout_id)
    session.execute(delete(Workout).where(Workout.id == workout_id))
    return {"deleted": True}


def select_workout(session: Session, profile_id: str, workout_id: str | None) -> dict:
    get_profile(session, profile_id)
    if workout_id is not None:
        _workout(session, profile_id, workout_id)
    session.execute(delete(WorkoutSelection).where(WorkoutSelection.profile_id == profile_id))
    if workout_id is not None:
        session.add(WorkoutSelection(profile_id=profile_id, workout_id=workout_id))
    session.flush()
    return {"selected_id": workout_id}


def versions(session: Session, profile_id: str, workout_id: str) -> list[dict]:
    _workout(session, profile_id, workout_id)
    weight_kg = get_profile(session, profile_id).weight_kg
    return [_out(row, weight_kg) for row in session.scalars(select(WorkoutVersion)
        .where(WorkoutVersion.workout_id == workout_id).order_by(WorkoutVersion.version.desc()))]
