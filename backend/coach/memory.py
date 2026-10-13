"""Faits datés, citations exactes, corrections et oubli par profil. Pas de fichier externe."""
from datetime import datetime, timedelta, timezone
import re
from typing import Literal
from uuid import uuid4

from pydantic import Field
from sqlalchemy import select, or_

from ..storage.models import CoachMemory, CoachTurn
from ..training.workouts import Input
from ..training.profiles import utc_now
from . import constraints


class Fact(Input):
    key: Literal['goal', 'experience', 'preferred_gait', 'comfortable_speed', 'max_speed',
                 'max_incline', 'preferred_duration', 'preference', 'restriction', 'daily_state']
    content: str = Field(min_length=1, max_length=500)
    quote: str = Field(min_length=3, max_length=500)
    source_turn_id: str | None = Field(default=None, pattern=r'^[a-f0-9]{32}$',
        description='Null pour le message actuel. Pour une archive, son turn_id exact ; jamais conversation_id.')
    value: float | None = Field(default=None, allow_inf_nan=False)
    gait: Literal['walk', 'run', 'either'] | None = None


class Capture(Input):
    facts: list[Fact] = Field(default_factory=list, max_length=12,
        description='Nouvelles déclarations utiles et corrections. Citation exacte. Ne pas répéter les faits déjà mémorisés sans changement.')
    request: constraints.RequestFacts = Field(default_factory=constraints.RequestFacts,
        description='Seulement les nouvelles contraintes explicitement citées dans le MESSAGE ACTUEL. Les limites déjà mémorisées sont imposées automatiquement : ne pas les recopier depuis un ancien message.')
    reviewed_turn_ids: list[str] = Field(default_factory=list, max_length=40)


def rows(session, profile, statuses=('active', 'pending')):
    return list(session.scalars(select(CoachMemory).where(CoachMemory.profile_id == profile,
        CoachMemory.status.in_(statuses)).order_by(CoachMemory.updated_at.desc(), CoachMemory.id)))


def expired(row):
    until = row.details.get('valid_until')
    return bool(until and until <= utc_now())


def redacted(session, profile, text, *, at=None):
    # Le texte original reste dans la conversation ; son extrait envoyé au modèle oublie la citation.
    for row in rows(session, profile, ('forgotten', 'superseded')):
        if at and at > row.updated_at:
            continue  # Une nouvelle déclaration explicite peut réintroduire un fait retiré.
        quote = row.details.get('quote')
        if quote:
            text = text.replace(quote, '[Information retirée ou remplacée dans la mémoire]')
    return text


def capture(session, profile, turn, payload):
    from . import store
    current = store.owned(session, CoachTurn, profile, turn)
    if current.status != 'running':
        raise store.CoachConflict('Cette réponse est terminée.')
    verified = payload.request.verified(current.user_text)
    # Les quantités reconnues directement côté serveur priment sur l'extraction du modèle.
    current.request_context = {**(current.request_context or {}), **verified,
                               **constraints.extract(current.user_text)}
    saved = []
    skipped = []
    for fact in payload.facts:
        source = store.owned(session, CoachTurn, profile, fact.source_turn_id or turn)
        if fact.quote not in source.user_text or fact.quote not in redacted(session, profile, source.user_text, at=source.created_at):
            raise store.CoachConflict('Le fait doit citer un message utilisateur accessible de ce profil.')
        clean = constraints.normalized(fact.quote)
        durable = bool(re.search(r'(prefere|habituel|generalement|souvent|toujours|jamais|en semaine|mon objectif)', clean))
        if fact.key == 'preferred_duration' and not durable:
            skipped.append('Une durée demandée pour cette séance reste une contrainte ponctuelle, pas une préférence.')
            continue
        if fact.key == 'preference' and re.search(r'(enregistr|propos|cree|memorise)', clean) and not durable:
            skipped.append('Une consigne de cette réponse reste ponctuelle, pas une préférence sportive.')
            continue
        if fact.source_turn_id and source.created_at > current.created_at:
            raise store.CoachConflict('Une source future ne peut pas modifier ce contexte.')
        existing = rows(session, profile, ('active', 'pending', 'forgotten', 'superseded'))
        same = next((m for m in existing if m.source_turn_id == source.id and m.details.get('key') == fact.key and
                     (m.details.get('quote') == fact.quote or
                      (fact.value is not None and m.details.get('value') == fact.value))), None)
        if same:
            if same.status in {'active', 'pending'}:
                saved.append(same.id)
            continue  # Idempotence et oubli, y compris lors d'une réindexation ancienne.
        value = fact.value
        units = {'comfortable_speed': ('speed', 1, 16), 'max_speed': ('speed', 1, 16),
                 'max_incline': ('incline', 0, 10), 'preferred_duration': ('duration', 600, 432000)}
        if fact.key in units:
            unit, low, high = units[fact.key]
            numbers = constraints.durations(fact.quote) if unit == 'duration' else constraints.quantities(fact.quote, unit)
            if value is None or not low <= value <= high or value not in numbers:
                raise store.CoachConflict('La valeur du fait doit correspondre à la quantité citée, avec son unité.')
        if fact.key == 'preferred_gait' and fact.gait is None:
            raise store.CoachConflict('Préciser marche, course ou les deux pour cette préférence.')
        now = utc_now()
        status = 'pending' if fact.key == 'restriction' else 'active'
        unique_key = fact.key not in {'preference', 'restriction'}
        active = [m for m in existing if m.status == 'active' and m.details.get('key') == fact.key]
        if unique_key:
            if any(m.details.get('observed_at', m.updated_at) > source.created_at for m in active):
                continue  # Une recherche ancienne ne remplace jamais une correction récente.
            for old in active:
                old.status = 'superseded'
                old.updated_at = now
        until = None
        if fact.key == 'daily_state':
            until = (datetime.fromisoformat(source.created_at) + timedelta(hours=24)).isoformat(timespec='milliseconds')
        elif fact.key == 'comfortable_speed':
            until = (datetime.fromisoformat(source.created_at) + timedelta(days=90)).isoformat(timespec='milliseconds')
        row = CoachMemory(id=uuid4().hex, profile_id=profile, content=fact.content,
            source_turn_id=source.id, proposal_index=None, created_at=now, updated_at=now, status=status,
            details={'key': fact.key, 'quote': fact.quote, 'value': value, 'gait': fact.gait,
                     'observed_at': source.created_at, 'valid_until': until, 'origin': 'conversation',
                     'conversation_id': source.conversation_id})
        session.add(row)
        saved.append(row.id)
    session.flush()
    for identifier in payload.reviewed_turn_ids:
        reviewed = store.owned(session, CoachTurn, profile, identifier)
        if reviewed.created_at > current.created_at:
            raise store.CoachConflict('Une déclaration future ne peut pas être indexée.')
        reviewed.memory_reviewed_at = utc_now()
    current.memory_reviewed_at = utc_now()
    return {'saved_ids': saved, 'skipped': skipped, 'request': current.request_context, 'memory': context(session, profile)}


def context(session, profile):
    items = rows(session, profile)
    priority = {'restriction', 'max_speed', 'max_incline', 'preferred_gait', 'comfortable_speed', 'goal', 'experience', 'daily_state'}
    items.sort(key=lambda r: r.details.get('key') not in priority)
    total = len(items)
    items = items[:24]
    return {'facts': [{'id': r.id, 'content': r.content, 'status': r.status, 'source_turn_id': r.source_turn_id,
                      **r.details, 'expired': expired(r)} for r in items],
            'total': total, 'partial': total > len(items),
            'note': 'Déclarations sourcées, pas mesures physiologiques. Une restriction à confirmer reste signalée.'}


def limits(session, profile):
    result = {}
    for r in reversed(rows(session, profile, ('active',))):
        if expired(r):
            continue
        if r.details.get('key') in ('max_speed', 'max_incline'):
            result[r.details['key']] = r.details.get('value')
        if r.details.get('key') == 'preferred_gait':
            result['gait'] = r.details.get('gait')
    return result


def manual_details(row, content):
    """Une correction visible doit aussi corriger les valeurs utilisées par le serveur."""
    from .store import CoachConflict
    details = dict(row.details)
    key = details.get('key')
    if key in {'comfortable_speed', 'max_speed', 'max_incline', 'preferred_duration'}:
        unit = 'incline' if key == 'max_incline' else 'duration' if key == 'preferred_duration' else 'speed'
        values = constraints.durations(content) if unit == 'duration' else constraints.quantities(content, unit)
        low, high = (0, 10) if unit == 'incline' else (30, 432000) if unit == 'duration' else (1, 16)
        if len(values) != 1 or not low <= values[0] <= high:
            raise CoachConflict('Indiquez une seule valeur avec son unité (km/h, % ou minutes) pour corriger ce souvenir.')
        details['value'] = values[0]
    if key == 'preferred_gait':
        clean = constraints.normalized(content)
        gait = constraints.extract(content).get('gait')
        walk, run = 'march' in clean, 'cour' in clean
        if gait is None:
            gait = 'either' if walk and run else 'walk' if walk else 'run' if run else None
        if gait is None:
            raise CoachConflict('Précisez marche, course ou les deux dans cette préférence.')
        details['gait'] = gait
    details.update({'origin': 'manual', 'observed_at': utc_now(), 'valid_until': None})
    if key == 'comfortable_speed':
        details['valid_until'] = (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(timespec='milliseconds')
    return details


def forget(session, profile, identifier):
    from .store import owned
    row = owned(session, CoachMemory, profile, identifier)
    row.status, row.updated_at = 'forgotten', utc_now()
    # Le minimum de provenance empêche de réintroduire le fait depuis ses anciens échanges.
    row.content = ''


def confirm(session, profile, identifier):
    from . import store
    row = store.owned(session, CoachMemory, profile, identifier)
    if row.status != 'pending':
        raise store.CoachConflict('Ce souvenir ne demande pas de confirmation.')
    row.status, row.updated_at = 'active', utc_now()
    return store.out(row)


def relevant_turns(session, profile, text, conversation, limit=5):
    """Recherche automatique dans tous les échanges, y compris les conversations archivées."""
    terms = [t for t in re.findall(r'[\w]+', text.casefold()) if len(t) >= 4]
    terms = list(dict.fromkeys(terms))[:16]
    base = select(CoachTurn).where(CoachTurn.profile_id == profile, CoachTurn.status != 'running')
    # Reprise progressive des anciennes archives, pendant les échanges demandés.
    unreviewed = list(session.scalars(base.where(CoachTurn.memory_reviewed_at.is_(None))
        .order_by(CoachTurn.created_at, CoachTurn.id).limit(4)))
    matches = []
    if terms:
        query = base.where(or_(*[CoachTurn.user_text.contains(t, autoescape=True) for t in terms]))
        matches = list(session.scalars(query.order_by(CoachTurn.created_at.desc(), CoachTurn.id).limit(limit)))
    # Compléter par les échanges des autres conversations, même sans mot identique.
    recent = list(session.scalars(base.where(CoachTurn.conversation_id != conversation)
        .order_by(CoachTurn.created_at.desc(), CoachTurn.id).limit(limit)))
    seen, result = set(), []
    for r in unreviewed[:2] + matches + unreviewed[2:] + recent:
        if r.id not in seen:
            seen.add(r.id)
            result.append({'id': r.id, 'conversation_id': r.conversation_id, 'date': r.created_at,
                           'user_text': redacted(session, profile, r.user_text, at=r.created_at),
                           'answer_excerpt': redacted(session, profile, r.answer[:900], at=r.created_at), 'status': r.status})
    return result[:limit]


def declared_quantities(session, profile, turn):
    """Les allures explicitement déclarées sont sauvegardées même si l'inférence échoue.

    Ce chemin reconnaît une affirmation chiffrée, pas un niveau sportif déduit.
    Les autres faits passent par l'extraction sourcée du modèle.
    """
    text = turn.user_text
    match = re.search(r'(?:allure confortable(?:\s+est)?(?:\s+(?:maintenant|désormais|desormais))?(?:\s+de)?\s*:?|'
                      r'(?:marche|cours)\s+confortablement\s+[àa])\s*(\d+(?:[.,]\d+)?)\s*km\s*/\s*h', text, re.IGNORECASE)
    if match and not re.search(r'\b(si|exemple|imaginons)\b', text[:match.start()], re.IGNORECASE):
        value = float(match.group(1).replace(',', '.'))
        if 1 <= value <= 16:
            capture(session, profile, turn.id, Capture(facts=[Fact(key='comfortable_speed',
                content=f'Allure confortable déclarée : {value:g} km/h.', quote=match.group(), value=value)]))
