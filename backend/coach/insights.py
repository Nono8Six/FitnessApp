"""Lectures sportives du Coach : mêmes métriques et sources que les bilans."""
from datetime import datetime, timedelta, timezone
import json
from sqlalchemy import select, func

from ..storage.models import RecordedSession, RecordedEntry
from ..recording import service
from ..training.profiles import get_profile


def link(row):
    return {'id': row.id, 'version': 1, 'name': row.workout_snapshot['name'], 'href': f'#/bilans/{row.id}'}


def detail(session, profile, identifier):
    data = service.read(session, profile, identifier)
    row = service.owned(session, profile, identifier)
    return {k: v for k, v in data.items() if k not in {'samples', 'events'}} | {
        'source': link(row), 'events': data['events'][-20:], 'events_partial': len(data['events']) > 20,
        'note': 'Calories estimées sur mesures disponibles ; le ressenti reste une déclaration.'}


def listing(session, profile, query='', offset=0, limit=10, since=None, mode='reel'):
    get_profile(session, profile)
    statement = select(RecordedSession).where(RecordedSession.profile_id == profile, RecordedSession.mode == mode)
    if since:
        statement = statement.where(RecordedSession.started_at >= since)
    if query:
        statement = statement.where(RecordedSession.workout_snapshot['name'].as_string().contains(query, autoescape=True))
    total = session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = session.scalars(statement.order_by(RecordedSession.started_at.desc(), RecordedSession.id.desc()).offset(offset).limit(limit))
    items = [service.brief(r) | {'source': link(r), 'lost_entries': r.lost_entries} for r in rows]
    return {'items': items, 'total': total, 'next_offset': offset + len(items) if offset + len(items) < total else None,
            'partial': offset + len(items) < total, 'mode': mode}


def samples(session, profile, session_id, offset=0, limit=200):
    row = service.owned(session, profile, session_id)
    statement = select(RecordedEntry).where(RecordedEntry.session_id == session_id, RecordedEntry.kind == 'sample')
    total = session.scalar(select(func.count()).select_from(statement.subquery()))
    data = [r.data for r in session.scalars(statement.order_by(RecordedEntry.seq).offset(offset).limit(limit))]
    while len(data) > 1 and len(json.dumps(data)) > 18000:
        data.pop()
    return {'items': data, 'total': total, 'partial': offset + len(data) < total,
            'next_offset': offset + len(data) if offset + len(data) < total else None, 'source': link(row)}


def progress(session, profile, days=28, mode='reel'):
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat(timespec='milliseconds')
    page = listing(session, profile, since=since, mode=mode, limit=20)
    results = [detail(session, profile, item['id']) for item in page['items'] if item['closed']]
    return {'period_days': days, 'since': since, 'total_sessions': page['total'],
            'sessions': [{k: r[k] for k in ('id', 'name', 'started_at', 'mode', 'phase', 'feeling', 'lost_entries', 'source')} |
                         {'metrics': {k: v for k, v in r['metrics'].items() if k != 'blocks'}} for r in results],
            'partial': page['partial'], 'note': 'Comparer effort et qualité à programme comparable. Pas de score de condition physique ni de fatigue déduit automatiquement.'}


def context(session, profile, simulation=False):
    mode = 'simulation' if simulation else 'reel'
    page = listing(session, profile, mode=mode, limit=5)
    recent = [detail(session, profile, r['id']) for r in page['items'] if r['closed']]
    observations = []
    fresh_since = (datetime.now(timezone.utc) - timedelta(days=28)).isoformat(timespec='milliseconds')
    for r in recent:
        m = r['metrics']
        if r['phase'] == 'completed' and r['started_at'] >= fresh_since and not r['lost_entries'] and (m['coverage']['speed'] or 0) >= .9:
            received = [{**b, 'kind': planned.get('kind'), 'movement': planned.get('movement')}
                        for b, planned in zip(m['blocks'], r['workout']['blocks'])
                        if (b.get('speed_coverage') or 0) >= .9]
            effort = [b for b in received if b['kind'] in {'run', 'steady'}]
            observations.append({'session_id': r['id'], 'date': r['started_at'], 'active_s': m['active_s'],
                'speed_avg': m['speed_avg'], 'incline_avg': m['incline_avg'], 'feeling': r['feeling'],
                'mode': r['mode'], 'source': r['source'],
                'run_s': sum(b['active_s'] for b in received if b['kind'] == 'run' or b['movement'] == 'run'),
                'blocks': sorted(effort or received, key=lambda b: b.get('speed_avg') or 0, reverse=True)[:8]})
    # Le contexte reçoit le résumé ; les blocs complets restent lisibles via get_session.
    recent = [{k: r[k] for k in ('id', 'name', 'started_at', 'mode', 'phase', 'feeling', 'closed', 'source', 'profile', 'lost_entries')} |
        {'metrics': {k: v for k, v in r['metrics'].items() if k != 'blocks'},
         'workout': {k: r['workout'].get(k) for k in ('id', 'name', 'version', 'goal', 'level', 'summary')},
         'detail_available': True} for r in recent]
    since = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat(timespec='milliseconds')
    weekly = session.execute(select(func.count(), func.sum(RecordedSession.checkpoint['active_s'].as_float())).where(
        RecordedSession.profile_id == profile, RecordedSession.mode == mode, RecordedSession.started_at >= since,
        RecordedSession.closed_at.is_not(None))).one()
    return {'available': True, 'mode': mode, 'total': page['total'], 'recent': recent,
            'recent_partial': page['partial'], 'observations': observations,
            'last_7_days': {'sessions': weekly[0], 'active_s': weekly[1] if weekly[0] else 0},
            'note': 'Toutes les séances sont recherchables via list_sessions. Simulation ne prouve aucune capacité réelle.'}
