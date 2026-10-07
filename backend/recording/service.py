"""Lecture et ressenti toujours limités au profil demandé côté serveur."""
from sqlalchemy import func, select, tuple_

from ..storage.models import RecordedEntry, RecordedSession
from ..training.profiles import get_profile, utc_now
from .metrics import calculate_version


class RecordingNotFound(LookupError):
    pass


def owned(session, profile_id, session_id):
    get_profile(session, profile_id)
    row = session.scalar(select(RecordedSession).where(RecordedSession.id == session_id,
                                                     RecordedSession.profile_id == profile_id))
    if row is None:
        raise RecordingNotFound(session_id)
    return row


def brief(row):
    return {"id": row.id, "name": row.workout_snapshot["name"], "started_at": row.started_at,
            "mode": row.mode, "phase": row.checkpoint["phase"], "active_s": row.checkpoint["active_s"],
            "feeling": row.feeling, "closed": row.closed_at is not None}


def list_recordings(session, profile_id, after=None, workout_id=None):
    get_profile(session, profile_id)
    query = select(RecordedSession).where(RecordedSession.profile_id == profile_id)
    if workout_id:
        query = query.where(RecordedSession.workout_snapshot["id"].as_string() == workout_id)
    if after:
        cursor = owned(session, profile_id, after)
        query = query.where(tuple_(RecordedSession.started_at, RecordedSession.id) < (cursor.started_at, cursor.id))
    rows = list(session.scalars(query.order_by(RecordedSession.started_at.desc(), RecordedSession.id.desc()).limit(26)))
    return {"items": [brief(r) for r in rows[:25]], "next": rows[24].id if len(rows) > 25 else None}


def read(session, profile_id, session_id):
    row = owned(session, profile_id, session_id)
    samples = [r.data for r in session.scalars(select(RecordedEntry).where(
        RecordedEntry.session_id == row.id, RecordedEntry.kind == "sample").order_by(RecordedEntry.seq))]
    events = [{"t": r.t, "at": r.at, "kind": r.kind, "data": r.data} for r in session.scalars(
        select(RecordedEntry).where(RecordedEntry.session_id == row.id,
            RecordedEntry.kind.not_in(["sample", "measurement"])).order_by(RecordedEntry.seq))]
    raw_count = session.scalar(select(func.count()).select_from(RecordedEntry).where(
        RecordedEntry.session_id == row.id, RecordedEntry.kind == "measurement"))
    return {**brief(row), "profile": row.profile_snapshot, "workout": row.workout_snapshot,
            "checkpoint": row.checkpoint, "calculation_version": row.calculation_version,
            "persisted_at": row.persisted_at, "persisted_seq": row.persisted_seq, "lost_entries": row.lost_entries,
            "feeling_updated_at": row.feeling_updated_at,
            "samples": samples, "events": events, "raw_count": raw_count,
            "metrics": calculate_version(row.calculation_version, samples, row.checkpoint, row.profile_snapshot["weight_kg"], row.workout_snapshot["blocks"])}


def set_feeling(session, profile_id, session_id, value):
    row = owned(session, profile_id, session_id)
    if row.closed_at is None:
        raise ValueError("Le ressenti sera disponible après la clôture de la séance.")
    row.feeling = value
    row.feeling_updated_at = utc_now()
    return {"feeling": row.feeling, "updated_at": row.feeling_updated_at}
