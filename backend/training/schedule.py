"""Semaines acceptées, états dérivés des bilans et rapprochement des versions de séance."""
import hashlib
import json
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Annotated, Literal
from uuid import uuid4

from pydantic import AfterValidator, Field, StringConstraints, field_validator
from sqlalchemy import select

from ..coach import insights, memory, workout_proposals
from ..recording import service
from ..storage.models import RecordedSession, TrainingWeek
from . import goals, workouts
from .execution import COOLDOWN_SECONDS
from .profiles import ProfileConflict, get_profile

ID = Annotated[str, Field(pattern=r"^[a-f0-9]{32}$")]


def iso_day(value: str) -> str:
    parsed = date.fromisoformat(value)
    if parsed.isoformat() != value:
        raise ValueError("Date au format AAAA-MM-JJ requise.")
    return value


Day = Annotated[str, AfterValidator(iso_day)]
Weekday = Annotated[int, Field(ge=0, le=6)]
ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=240)]


class InvalidProposal(ProfileConflict):
    pass


class Availability(workouts.Input):
    weekdays: list[Weekday] = Field(min_length=1, max_length=7)
    minutes: int = Field(ge=15, le=120)
    venue: Literal["treadmill", "outdoor", "both"]
    baseline: str = Field(default="", max_length=240)

    @field_validator("weekdays")
    @classmethod
    def unique_days(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("Choisissez chaque jour une seule fois.")
        return sorted(value)


class Request(workouts.Input):
    week: Day
    availability: Availability
    note: str = Field(default="", max_length=320)
    report_id: ID | None = None


class SessionSpec(workouts.Input):
    day: Day
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)]
    minutes: int = Field(ge=12, le=120)
    purpose: ShortText
    effort: int = Field(ge=1, le=8)
    venue: Literal["treadmill", "outdoor"]
    blocks: list[workouts.Step] = Field(max_length=12)


class Phase(workouts.Input):
    until: Day
    focus: ShortText


class Proposal(workouts.Input):
    focus: ShortText
    explanation: ShortText
    phases: list[Phase] = Field(max_length=5)
    sessions: list[SessionSpec] = Field(max_length=7)


class Placement(workouts.Input):
    slot: int = Field(ge=0, le=6)
    day: Day


class Accept(workouts.Input):
    id: ID
    placements: list[Placement] = Field(max_length=7)


class OutdoorLog(workouts.Input):
    minutes: int = Field(ge=1, le=720)
    km: float | None = Field(default=None, gt=0, le=200)
    feeling: int | None = Field(default=None, ge=1, le=10)
    revision: int = Field(ge=1)


@dataclass(frozen=True)
class Preparation:
    row: TrainingWeek | None
    goal: goals.Goal
    weight: float | None
    rhythm: int
    limits: dict
    locked: list[dict]
    allowed: list[str]
    source: dict | None
    previous: list[dict]
    entries: list[dict]
    fingerprint: str


def local_day():
    # Même date locale que le Coach sur le PC qui héberge l'application.
    return date.today()


def monday(day):
    return day - timedelta(days=day.weekday())


def week_date(value, today):
    try:
        week = date.fromisoformat(value) if value else monday(today)
    except ValueError:
        raise ProfileConflict("Choisissez une date de semaine valide.") from None
    if not date(1900, 1, 1) < week < date(9999, 1, 1) or week.weekday() != 0:
        raise ProfileConflict("Choisissez le lundi de la semaine à consulter.")
    return week


def _row(session, profile, week):
    return session.get(TrainingWeek, (profile, week.isoformat()))


def _reports(session, profile, ids, simulation):
    if not ids:
        return {}
    mode = "simulation" if simulation else "reel"
    rows = session.scalars(select(RecordedSession).where(
        RecordedSession.profile_id == profile, RecordedSession.mode == mode,
        RecordedSession.workout_snapshot["id"].as_string().in_(ids),
        RecordedSession.workout_snapshot["version"].as_integer() == 1,
    ).order_by(RecordedSession.started_at.desc(), RecordedSession.id.desc()))
    best = {}
    for row in rows:
        key = row.workout_snapshot["id"]
        if not row.closed_at:
            status, rank = "in_progress", 3
        elif row.checkpoint.get("phase") == "completed" and row.checkpoint["active_s"] > 0:
            status, rank = "done", 2
        elif row.checkpoint.get("phase") != "cancelled" and row.checkpoint["active_s"] > 0:
            status, rank = "shortened", 1
        else:
            continue
        if key not in best or best[key][0] < rank:
            best[key] = (rank, status, {**service.brief(row), "source": insights.link(row)})
    return best


def _sessions(session, profile, row, today, simulation, active=None, *, detailed=False):
    if row is None or row.plan is None:
        return []
    entries = row.plan["sessions"]
    reports = _reports(session, profile, [item["workout_id"] for item in entries if item["workout_id"]], simulation)
    results = []
    for item in entries:
        workout_id, recorded = item["workout_id"], reports.get(item["workout_id"])
        manual = item.get("manual")
        status = "missed" if item["day"] < today.isoformat() else "planned"
        if manual is not None:
            status = "done" if manual["minutes"] >= item["minutes"] else "shortened"
        if recorded:
            status = recorded[1]
        if workout_id and workout_id == active:
            status = "in_progress"
        result = {**item, "status": status, "report": recorded[2] if recorded else None}
        if detailed:
            result["workout"] = None
            if workout_id and status == "planned":
                try:
                    result["workout"] = next((w for w in workouts.versions(session, profile, workout_id) if w["version"] == 1), None)
                except workouts.WorkoutNotFound:
                    pass  # Un programme supprimé reste identifiable dans le planning.
        results.append(result)
    return results


def view(session, profile, requested=None, simulation=False, active=None):
    today = local_day()
    week = week_date(requested, today)
    goal = goals.read(session, profile)
    row = _row(session, profile, week)
    prior = session.scalars(select(TrainingWeek).where(
        TrainingWeek.profile_id == profile, TrainingWeek.week <= week.isoformat(),
        TrainingWeek.revision > 0).order_by(TrainingWeek.week.desc()).limit(1)).first()
    plan = row.plan if row else None
    result = _sessions(session, profile, row, today, simulation, active, detailed=True)
    return {"today": today.isoformat(), "week": week.isoformat(), "revision": row.revision if row else 0,
            "goal": goal.model_dump() if goal else None, "available": prior.plan["availability"] if prior else None,
            "plan": {**plan, "sessions": result} if plan else None, "proposal": row.proposal if row else None}


def coach_context(session, profile, simulation=False):
    today = local_day()
    start = monday(today)
    result = []
    for offset in (-7, 0, 7):
        row = _row(session, profile, start + timedelta(days=offset))
        if row and row.plan:
            result.append({
                "week": row.week, "focus": row.plan["focus"], "phases": row.plan["phases"],
                "sessions": _sessions(session, profile, row, today, simulation),
            })
    return result


def _inputs(session, profile, request, simulation, active):
    now = local_day()
    week = week_date(request.week, now)
    if week < monday(now) or week > monday(now) + timedelta(days=7):
        raise ProfileConflict("Préparez la semaine en cours ou la suivante.")
    goal = goals.read(session, profile)
    if goal is None:
        raise ProfileConflict("Définissez d’abord votre objectif dans Aujourd’hui.")
    current = get_profile(session, profile)
    limits = workout_proposals.request_limits(session, profile)
    if limits["restrictions_to_confirm"]:
        raise ProfileConflict("Confirmez la restriction déclarée dans Coach › Mémoire avant de préparer la semaine.")
    limits["max_duration_sec"] = request.availability.minutes * 60
    row = _row(session, profile, week)
    previous = _row(session, profile, week - timedelta(days=7))
    current_entries = _sessions(session, profile, row, now, simulation, active)
    previous_entries = _sessions(session, profile, previous, now, simulation, active)
    locked = [entry for entry in current_entries if entry["status"] != "planned"]
    locked_days = {entry["day"] for entry in locked}
    allowed = []
    for offset in request.availability.weekdays:
        day = week + timedelta(days=offset)
        if day >= now and day.isoformat() not in locked_days and (goal.target_date is None or day.isoformat() <= goal.target_date):
            allowed.append(day.isoformat())
    if not allowed:
        raise ProfileConflict("Aucun créneau disponible dans cette semaine. Modifiez les jours choisis ou vérifiez l’échéance.")
    report = service.owned(session, profile, request.report_id) if request.report_id else None
    mode = "simulation" if simulation else "reel"
    if report and (report.mode != mode or not report.closed_at):
        raise ProfileConflict("Ce bilan ne peut pas servir à adapter ce planning.")
    recent = insights.listing(session, profile, mode=mode, limit=5)["items"]
    source = {**service.brief(report), "source": insights.link(report)} if report else None
    fingerprint = hashlib.sha256(json.dumps({
        "date": now.isoformat(), "goal": goal.model_dump(mode="json"), "weight": current.weight_kg,
        "limits": limits, "current": current_entries, "previous": previous_entries,
        "version": row.revision if row else 0, "recent": recent, "report": source,
    }, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return Preparation(row, goal, current.weight_kg, current.weekly_goal, limits, locked, allowed, source,
                       previous_entries, current_entries, fingerprint)


def build_context(session, profile, request, simulation=False, active=None):
    prepared = _inputs(session, profile, request, simulation, active)
    activity = insights.context(session, profile, simulation)
    relevant = [fact for fact in memory.context(session, profile)["facts"]
                if fact["status"] == "active" and not fact["expired"]]
    recent_details = [{
        "name": item["name"], "date": item["started_at"], "mode": item["mode"], "phase": item["phase"],
        "feeling": item["feeling"], "active_s": item["metrics"]["active_s"], "speed_avg": item["metrics"]["speed_avg"],
        "distance_m": item["metrics"]["distance_m"], "distance_quality": item["metrics"]["distance_quality"],
    } for item in activity["recent"]]
    return prepared.fingerprint, {
        "objectif": prepared.goal.model_dump(exclude={"revision"}), "rythme_reglages": prepared.rhythm,
        "semaine": request.week, "dates_autorisees": prepared.allowed, "limites": prepared.limits,
        "disponibilites": request.availability.model_dump(),
        "minutes_programme_tapis_max": (request.availability.minutes * 60 - COOLDOWN_SECONDS) // 60,
        "message_de_la_semaine": request.note,
        "bilans_recents": recent_details, "bilan_choisi": prepared.source, "mode": "simulation" if simulation else "reel",
        "semaine_precedente": prepared.previous, "semaine_a_adapter": prepared.entries,
        "observations_verifiees": activity["observations"], "faits_declares": relevant,
    }


def _validate(proposal, request, goal, allowed, limits, weight):
    days = [item.day for item in proposal.sessions]
    if len(set(days)) != len(days) or any(day not in allowed for day in days):
        raise InvalidProposal("Chaque séance doit occuper un jour disponible, une seule fois.")
    dates = [phase.until for phase in proposal.phases]
    if dates != sorted(set(dates)) or any(day < local_day().isoformat() or not goal.target_date or day > goal.target_date for day in dates):
        raise InvalidProposal("Les étapes doivent avancer dans l’ordre jusqu’à l’échéance de l’objectif.")
    if goal.target_date and (not dates or dates[-1] != goal.target_date):
        raise InvalidProposal("La dernière étape doit se terminer à la date de l’objectif.")
    compiled = []
    for item in proposal.sessions:
        if item.minutes > request.availability.minutes:
            raise InvalidProposal("Une séance dépasse le temps disponible.")
        if request.availability.venue != "both" and item.venue != request.availability.venue:
            raise InvalidProposal("Une séance utilise un lieu différent de celui choisi.")
        if item.venue == "outdoor":
            if item.blocks:
                raise InvalidProposal("Une séance dehors se décrit sans consignes du tapis.")
            compiled.append(None)
            continue
        if item.minutes * 60 + COOLDOWN_SECONDS > request.availability.minutes * 60:
            raise InvalidProposal("Réservez la minute de retour au calme automatique dans le temps disponible sur tapis.")
        if not item.blocks:
            raise InvalidProposal("Il manque les blocs de la séance sur tapis.")
        try:
            programme = workouts.WorkoutInput(
                name=item.name, items=item.blocks, goal="endurance",
                level="easy" if item.effort <= 4 else "intermediate" if item.effort <= 6 else "hard",
            )
            checked = workout_proposals.ProposalInput(workout=programme, duration_sec=item.minutes * 60,
                                                      explanation=item.purpose)
        except ValueError as exc:
            issue = exc.errors()[0]["msg"].removeprefix("Value error, ") if hasattr(exc, "errors") else str(exc)
            raise InvalidProposal(issue) from None
        preview = workout_proposals.validated_preview(checked, weight, limits)
        if not preview["valid"]:
            raise InvalidProposal(preview["error"])
        compiled.append(programme)
    return compiled


def stage(session, profile, request, proposal, original, simulation=False, active=None):
    prepared = _inputs(session, profile, request, simulation, active)
    if original != prepared.fingerprint:
        raise ProfileConflict("Le planning ou les bilans ont changé. Demandez une nouvelle proposition.")
    _validate(proposal, request, prepared.goal, prepared.allowed, prepared.limits, prepared.weight)
    row = prepared.row
    if row is None:
        row = TrainingWeek(profile_id=profile, week=request.week, revision=0)
        session.add(row)
    row.proposal = {"id": uuid4().hex, "fingerprint": prepared.fingerprint, "request": request.model_dump(),
                    "allowed": prepared.allowed, "data": proposal.model_dump(),
                    "replaces": [item for item in prepared.entries if item["status"] == "planned"]}
    return row.proposal


def accept(session, profile, week, payload, simulation=False, active=None):
    row = _row(session, profile, week_date(week, local_day()))
    if row and row.plan and row.plan.get("receipt") == payload.id:
        return view(session, profile, week, simulation, active)
    if row is None or row.proposal is None or row.proposal["id"] != payload.id:
        raise ProfileConflict("Cette proposition a expiré. Rechargez la semaine.")
    draft = row.proposal
    request = Request.model_validate(draft["request"])
    prepared = _inputs(session, profile, request, simulation, active)
    if prepared.fingerprint != draft["fingerprint"]:
        raise ProfileConflict("Le planning ou les bilans ont changé. Demandez une nouvelle proposition.")
    proposal = Proposal.model_validate(draft["data"])
    slots = [placement.slot for placement in payload.placements]
    if len(set(slots)) != len(slots) or any(slot >= len(proposal.sessions) for slot in slots):
        raise ProfileConflict("La sélection ne correspond plus à la proposition.")
    chosen = [proposal.sessions[p.slot].model_copy(update={"day": p.day}) for p in payload.placements]
    proposal = proposal.model_copy(update={"sessions": chosen})
    programmes = _validate(proposal, request, prepared.goal, prepared.allowed, prepared.limits, prepared.weight)
    entries = [{k: value for k, value in item.items() if k not in {"status", "report"}} for item in prepared.locked]
    for item, programme in zip(chosen, programmes):
        identifier = uuid4().hex
        workout_id = None
        if programme:
            workout_id = workouts.create_workout(session, profile, programme, author="chatgpt",
                                                 origin={"kind": "schedule", "entry_id": identifier})["id"]
        entries.append({**item.model_dump(exclude={"blocks"}), "id": identifier, "workout_id": workout_id})
    row.revision += 1
    row.plan = {"receipt": payload.id, "goal_revision": prepared.goal.revision, "availability": request.availability.model_dump(),
                **proposal.model_dump(exclude={"sessions"}), "sessions": sorted(entries, key=lambda item: item["day"])}
    row.proposal = None
    session.flush()
    return view(session, profile, week, simulation, active)


def outdoor(session, profile, week, identifier, payload, simulation=False, active=None):
    today = local_day()
    goals.read(session, profile)
    row = _row(session, profile, week_date(week, today))
    if row is None or row.plan is None:
        raise ProfileConflict("Cette séance a quitté le planning.")
    item = next((item for item in row.plan["sessions"] if item["id"] == identifier), None)
    if not item or item["venue"] != "outdoor" or item["day"] > today.isoformat():
        raise ProfileConflict("Cette séance dehors ne peut pas recevoir de bilan pour le moment.")
    values = payload.model_dump(exclude={"revision"})
    if item.get("manual") != values:
        if row.revision != payload.revision:
            raise ProfileConflict("La semaine a changé. Rechargez-la avant de modifier ce bilan.")
        row.plan = {**row.plan, "sessions": [{**entry, "manual": values} if entry["id"] == identifier else entry
                                            for entry in row.plan["sessions"]]}
        row.revision += 1
    return view(session, profile, week, simulation, active)
