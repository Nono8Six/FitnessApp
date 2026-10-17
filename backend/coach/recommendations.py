"""Construction personnalisée transparente à partir de déclarations et de bilans reçus."""
from typing import Literal
from pydantic import Field
from ..training import workouts
from . import memory, insights, constraints

SOURCES = [
    {'title': 'ACSM · activité physique et masse grasse, consensus 2024', 'url': 'https://doi.org/10.1249/MSS.0000000000003520'},
    {'title': 'CDC · intensité relative et test de parole', 'url': 'https://www.cdc.gov/physical-activity-basics/measuring/index.html'},
    {'title': 'AHA · échauffement et retour au calme', 'url': 'https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down'},
]


class Recommendation(workouts.Input):
    goal: Literal['fat_loss', 'cardio', 'endurance', 'recovery']
    duration_sec: int = Field(default=1800, ge=900, le=7200)


def recommend(session, profile, payload, request, weight, simulation=False):
    facts = memory.rows(session, profile)
    if any(r.status == 'pending' and r.details.get('key') == 'restriction' for r in facts):
        return {'needs_clarification': True, 'reason': 'Une restriction déclarée reste à confirmer dans Mémoire avant de construire une séance.'}
    active = [r for r in facts if r.status == 'active' and not memory.expired(r)]
    limits = {**memory.limits(session, profile), **request}
    duration = min(payload.duration_sec, limits.get('max_duration_sec', payload.duration_sec))
    if duration < 900:
        return {'error': 'Ce format nécessite quinze minutes, début et fin compris. Demander une adaptation explicite.'}
    history = insights.context(session, profile, simulation)
    comfort = next((r for r in active if r.details.get('key') == 'comfortable_speed' and r.details.get('value') is not None), None)
    observed = [o for o in history['observations'] if o['mode'] == 'reel' and o['feeling'] is not None and o['feeling'] <= 6]
    # Ce repère vient d'un bloc reçu et toléré, jamais d'un niveau éditorial du catalogue.
    baseline = comfort.details['value'] if comfort else None
    source = None
    if baseline is None and observed:
        candidate = observed[0]
        steady = [b for b in candidate['blocks'] if b['active_s'] >= 30 and b.get('speed_avg') is not None]
        if steady:
            baseline = max(b['speed_avg'] for b in steady)
            source = candidate['source']
    gait = limits.get('gait') or (comfort.details.get('gait') if comfort else None)
    if baseline is None:
        baseline, gait = 3.5, 'walk'
        assumption = 'Capacité inconnue : départ prudent en marche, à ajuster avec le ressenti.'
    else:
        assumption = ('Point de départ choisi dans la plage confortable déclarée, pas une vitesse maximale.'
                      if comfort and comfort.details.get('value_range') else
                      'Allure déclarée confortable, pas une vitesse maximale.' if comfort else
                      'Allure observée dans une séance terminée, avec ressenti au plus 6/10.')
        gait = gait or ('run' if baseline >= 8.04 else 'walk' if baseline <= 6 else None)
    if gait in {None, 'either'} and 6 < baseline < 8.04:
        return {'needs_clarification': True, 'reason': 'À cette allure, préciser si la personne marche ou court pour personnaliser et estimer les calories.'}
    if gait == 'either':
        gait = 'run' if baseline >= 8.04 else 'walk'
    baseline = min(baseline, limits.get('max_speed') or 16)
    if gait == 'walk':
        baseline = min(baseline, 6)
    state = next((r for r in active if r.details.get('key') == 'daily_state'
                  and any(word in constraints.normalized(r.content) for word in ('fatigu', 'douleur', 'gene', 'mal dorm'))), None)
    if state or payload.goal == 'recovery':
        baseline = max(1, baseline - .5)
        assumption += ' Dose réduite ; vérifier le ressenti du jour.'
    central = duration - 600
    # Ne pas allonger d'un coup une durée courue dont seule une courte exposition est connue.
    run_limit = central
    if gait == 'run' and not comfort and observed:
        run_limit = min(central, max((int(b['active_s']) for b in observed[0]['blocks']
            if b.get('movement') == 'run' or b.get('kind') == 'run'), default=central)) if observed[0]['run_s'] else central
    speed = round(baseline, 1)
    easy = round(min(speed, 3.5), 1)
    def block(kind, sec, value, movement='walk'):
        return {'kind': kind, 'sec': sec, 'speed': value, 'incline': 0.0, 'movement': movement}
    items = [block('warmup', 120, max(1., easy - .5)), block('warmup', 180, easy)]
    if gait == 'run' and run_limit < central:
        # Alternance bornée : les récupérations ne sont jamais escamotées pour les calories.
        left = central
        remaining_run = int(observed[0]['run_s']) if observed else central
        while left >= 150:
            effort = min(120, run_limit, remaining_run, left - 90)
            if effort < 30:
                break
            items.extend([block('run', effort, speed, 'run'), block('recover', 90, easy)])
            left -= effort + 90
            remaining_run -= effort
        if left >= 30:
            items.append(block('steady', left, easy))
        elif left:
            items[-1]['sec'] += left
    else:
        items.append(block('run' if gait == 'run' else 'steady', central, speed, gait))
    items += [block('cooldown', 180, easy), block('cooldown', 120, max(1., easy - .5))]
    expanded = []
    for item in items:
        count = (item['sec'] + workouts.MAX_SECONDS - 1) // workouts.MAX_SECONDS
        base, extra = divmod(item['sec'], count)
        expanded.extend({**item, 'sec': base + (i < extra)} for i in range(count))
    workout = workouts.WorkoutInput(name={'fat_loss': 'Effort régulier · 30 min', 'cardio': 'Cardio personnalisé',
        'endurance': 'Endurance personnalisée', 'recovery': 'Marche de récupération'}[payload.goal].replace('30 min', f'{duration // 60} min'),
        items=expanded, goal='calories' if payload.goal == 'fat_loss' else 'endurance', level='easy')
    preview = workouts.preview(workout, weight)
    errors = constraints.check(workout, preview['blocks'], limits)
    if errors:
        return {'error': ' '.join(errors), 'valid': False}
    return {'workout': workout.model_dump(), **preview, 'duration_sec': duration,
            'basis': assumption, 'reference_session': source, 'constraints': limits, 'scientific_sources': SOURCES,
            'effort': 'Pouvoir parler en phrases ; réduire la dose si cet effort est trop difficile.',
            'note': 'Format FitnessApp fondé sur ces principes ; pas une séance optimale cliniquement validée. Pas de graisse perdue calculée.',
            'saved': False}
