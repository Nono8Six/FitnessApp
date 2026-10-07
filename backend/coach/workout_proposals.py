"""Propositions persistées et acceptées par une action humaine, sous verrou SQLite."""
from uuid import uuid4

from pydantic import Field, model_validator
from sqlalchemy import select

from . import store
from ..storage.models import WorkoutProposal, WorkoutVersion
from ..training import workouts
from ..training.profiles import get_profile, utc_now


Target = workouts.Target


class ProposalInput(workouts.Input):
    workout: workouts.WorkoutInput
    duration_sec: int = Field(ge=30, le=workouts.MAX_DURATION_SECONDS, description='Durée totale demandée ou choisie, en secondes, échauffement et retour au calme compris. Doit correspondre exactement aux blocs.')
    explanation: str = Field(min_length=1, max_length=600)
    target: Target | None = None
    min_active_kcal: float | None = Field(default=None, gt=0, le=5000, allow_inf_nan=False,
        description='Minimum de kcal actives estimées demandé par la personne, même si l’objectif principal est endurance. Ne pas confondre avec les calories totales. Null si aucun minimum demandé.')

    @model_validator(mode='after')
    def complete_programme(self):
        calculated = workouts.preview(self.workout)
        blocks = calculated['blocks']
        if calculated['summary']['sec'] != self.duration_sec:
            raise ValueError(f"Durée totale incohérente : {calculated['summary']['sec']} s dans les blocs, {self.duration_sec} s annoncées. Corriger les blocs pour respecter la durée demandée, échauffement et retour au calme compris.")
        if blocks[0]['kind'] != 'warmup' or blocks[-1]['kind'] != 'cooldown':
            raise ValueError('Prévoir un échauffement au début et un retour au calme à la fin.')
        warmup = next((i for i, block in enumerate(blocks) if block['kind'] != 'warmup'), len(blocks))
        cooldown = next((i for i, block in enumerate(reversed(blocks)) if block['kind'] != 'cooldown'), len(blocks))
        if sum(b['sec'] for b in blocks[:warmup]) < 300 or sum(b['sec'] for b in blocks[-cooldown:]) < 300:
            raise ValueError('Prévoir au moins 5 min d’échauffement au début et 5 min de retour au calme à la fin, dans la durée totale.')
        if self.workout.goal is None or self.workout.level is None:
            raise ValueError('Objectif (calories, incline, endurance) et niveau (easy, intermediate, hard) requis.')
        if not self.explanation.strip():
            raise ValueError('Une explication utile est requise.')
        return self


def validated_preview(payload, weight):
    """Vérifier aussi la cible énergétique avec le calcul et le poids du serveur."""
    result = workouts.preview(payload.workout, weight)
    if payload.min_active_kcal is not None:
        estimated = result['summary']['energy']['active_kcal']
        if estimated is None:
            return {'error': 'Minimum calorique invérifiable : renseignez le poids du profil dans Réglages.',
                    'valid': False, 'weight_required': True, 'preview': result}
        if estimated < payload.min_active_kcal:
            return {'error': 'La séance n’atteint pas le minimum de kcal actives estimées demandé. Adapter le programme sans dépasser le temps disponible ni les capacités déclarées ; sinon expliquer le compromis.',
                    'valid': False, 'min_active_kcal': payload.min_active_kcal,
                    'estimated_active_kcal': estimated, 'shortfall_active_kcal': round(payload.min_active_kcal - estimated, 1),
                    'preview': result}
    return {'valid': True, **result}


class Acceptance(workouts.Input):
    # Une retouche manuelle conserve la provenance, avec un auteur humain.
    edited_workout: workouts.WorkoutInput | None = None


def snapshot(session, profile, target):
    workouts._workout(session, profile, target.workout_id)
    row = session.get(WorkoutVersion, (target.workout_id, target.version))
    if row is None:
        raise workouts.WorkoutNotFound()
    return {k: v for k, v in workouts._out(row, get_profile(session, profile).weight_kg).items()
            if k not in {'blocks', 'summary'}}


def render(session, row):
    turn = store.owned(session, store.CoachTurn, row.profile_id, row.turn_id)
    weight = get_profile(session, row.profile_id).weight_kg
    base = row.base
    return {'id': row.id, 'turn_id': row.turn_id, 'conversation_id': turn.conversation_id,
            'explanation': row.explanation, 'status': row.status,
            'accepted_id': row.accepted_id, 'accepted_version': row.accepted_version,
            'workout': {**row.workout, **workouts.preview(workouts.WorkoutInput.model_validate(row.workout), weight)},
            'base': {**base, **workouts.preview(workouts.WorkoutInput.model_validate(
                {k: base[k] for k in ('name', 'items', 'goal', 'level')}), weight)} if base else None}


STATUS = {'pending': 'en attente de la décision de l’utilisateur', 'accepted': 'enregistrée par l’utilisateur',
          'ignored': 'ignorée par l’utilisateur'}


def brief(proposal):
    """Rappel compact et stable d'une carte déjà affichée, pour les échanges suivants."""
    workout, summary = proposal['workout'], proposal['workout'].get('summary') or {}
    result = {'proposal_id': proposal['id'], 'status': STATUS.get(proposal['status'], proposal['status']),
              'name': workout['name'], 'goal': workout.get('goal'), 'level': workout.get('level'),
              'duration_sec': summary.get('sec'), 'items': workout['items'], 'explanation': proposal['explanation']}
    if proposal.get('base'):
        result['adjusts'] = {'workout_id': proposal['base']['id'], 'version': proposal['base']['version']}
    if proposal['status'] == 'accepted':
        result['saved_as'] = f"#/seances/{proposal['accepted_id']}?version={proposal['accepted_version']}"
    return result


def for_turn(session, profile, turn):
    return [render(session, row) for row in session.scalars(select(WorkoutProposal).where(
        WorkoutProposal.profile_id == profile, WorkoutProposal.turn_id == turn).order_by(WorkoutProposal.created_at, WorkoutProposal.id))]


def propose(session, profile, turn_id, call_id, payload):
    turn = store.owned(session, store.CoachTurn, profile, turn_id)
    if turn.status != 'running':
        raise store.CoachConflict('La réponse du coach n’est plus en cours.')
    old = session.scalar(select(WorkoutProposal).where(WorkoutProposal.turn_id == turn_id, WorkoutProposal.call_id == call_id))
    if old:
        return render(session, old)
    checked = validated_preview(payload, get_profile(session, profile).weight_kg)
    if not checked['valid']:
        return checked
    if len(for_turn(session, profile, turn_id)) >= 6:
        raise store.CoachConflict('Six propositions maximum par message.')
    base = turn.workout_context
    if payload.target:
        if base and (payload.target.workout_id != base['id'] or payload.target.version != base['version']):
            raise store.CoachConflict('La proposition doit ajuster exactement la version transmise par l’utilisateur.')
        base = base or snapshot(session, profile, payload.target)
    row = WorkoutProposal(id=uuid4().hex, profile_id=profile, turn_id=turn_id, call_id=call_id,
        workout=payload.workout.model_dump(), explanation=payload.explanation, base=base,
        status='pending', accepted_id=None, accepted_version=None, created_at=utc_now())
    session.add(row)
    session.flush()
    return render(session, row)


def accept(session, profile, identifier, payload):
    row = store.owned(session, WorkoutProposal, profile, identifier)
    if row.status == 'ignored':
        raise store.CoachConflict('Cette proposition a été ignorée.')
    if row.status == 'accepted':
        workouts._workout(session, profile, row.accepted_id)
        version = session.get(WorkoutVersion, (row.accepted_id, row.accepted_version))
        return workouts._out(version, get_profile(session, profile).weight_kg)
    turn = store.owned(session, store.CoachTurn, profile, row.turn_id)
    data = payload.edited_workout or workouts.WorkoutInput.model_validate(row.workout)
    author = 'human' if payload.edited_workout and payload.edited_workout.model_dump() != row.workout else 'chatgpt'
    origin = {'kind': 'chatgpt', 'conversation_id': turn.conversation_id, 'turn_id': turn.id, 'proposal_id': row.id}
    if row.base:
        result = workouts.update_workout(session, profile, row.base['id'],
            workouts.WorkoutUpdate(**data.model_dump(), base_version=row.base['version']), author=author, origin=origin)
    else:
        result = workouts.create_workout(session, profile, data, author=author, origin=origin)
    row.status, row.accepted_id, row.accepted_version = 'accepted', result['id'], result['version']
    session.flush()
    return result


def ignore(session, profile, identifier):
    row = store.owned(session, WorkoutProposal, profile, identifier)
    if row.status == 'accepted':
        raise store.CoachConflict('Cette proposition a déjà été enregistrée.')
    row.status = 'ignored'
    session.flush()
    return render(session, row)
