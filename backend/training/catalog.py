"""Catalogue déterministe : objectif, dose de travail, récupération et volume borné.

Les niveaux décrivent les programmes, pas les aptitudes personnelles. Les règles
exactes sont des choix FitnessApp documentés dans CONSTRUCTION_PROGRAMMES.md.
"""
from dataclasses import dataclass, asdict
from math import ceil
from typing import Literal

from pydantic import Field, model_validator

from .workouts import MAX_SECONDS, MAX_SEGMENTS, Input, WorkoutInput, WorkoutNotFound, create_workout, preview
from .profiles import get_profile

GOALS = {'calories': 'Dépense calorique', 'incline': 'Jambes et fessiers — marche inclinée', 'endurance': 'Endurance'}
LEVELS = {'easy': 'Facile', 'intermediate': 'Intermédiaire', 'hard': 'Soutenu'}
CATALOG_REVISION = '2026-10-07-calories-4'
SOURCES = {
    'aha': {'title': 'AHA · Échauffement et retour au calme',
            'url': 'https://www.heart.org/en/healthy-living/exercise-and-physical-activity/fitness-basics/warm-up-cool-down'},
    'cdc': {'title': 'CDC · Intensité et test de conversation',
            'url': 'https://www.cdc.gov/physical-activity-basics/measuring/index.html'},
    'nhs': {'title': 'NHS · Alternance course et marche',
            'url': 'https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/'},
    'incline': {'title': 'Silder et al. · Coût de la marche inclinée',
                'url': 'https://pmc.ncbi.nlm.nih.gov/articles/PMC4504736/'},
}
METHODS = {
    'brisk-walk': ('Accumuler du temps de cardio régulier pour viser une dépense énergétique.',
                   'Marche active aux niveaux Facile et Intermédiaire, course continue au niveau Soutenu.'),
    'walk-intervals': ('Répéter des passages actifs en conservant une récupération entre eux.',
                        'Marche active et marche lente aux premiers niveaux ; course et footing de récupération au niveau Soutenu.'),
    'hill-plateau': ('Maintenir une marche en montée pour solliciter les jambes.',
                      'Pente de préparation, plateau de travail, pente réduite, puis marche facile à plat.'),
    'hill-waves': ('Répéter un travail en côte avec une récupération entre les montées.',
                    'Montées à vitesse stable et récupérations plus lentes à plat ; le volume de côte est plafonné.'),
    'steady-endurance': ('Accumuler du temps régulier pour travailler l’endurance aérobie.',
                          'Marche au niveau facile, course aux niveaux suivants ; aucune accélération pour finir.'),
    'run-walk': ('Accumuler de la course par passages maîtrisés, entrecoupés de marche.',
                  'Course et marche alternées ; au niveau Soutenu, les cycles couvrent tout le temps central demandé.'),
}


@dataclass(frozen=True)
class Recipe:
    identifier: str
    name: str
    goal: str
    level: str
    description: str
    style: str
    speed: float
    incline: float
    default_sec: int
    # Durée d'un passage, récupération entre passages et nombre maximal de cycles.
    effort_sec: int = 0
    recovery_sec: int = 0
    max_cycles: int = 0
    # Temps central maximal pour le continu/la pyramide ; 0 = toute la durée centrale.
    work_limit_sec: int = 0
    # Allure de récupération spécifique ; sinon marche facile selon le niveau.
    recovery_speed: float | None = None


@dataclass(frozen=True)
class Dose:
    work_sec: int
    recovery_sec: int
    easy_sec: int
    cycles: int
    work_limit_sec: int


@dataclass(frozen=True)
class Programme:
    workout: WorkoutInput
    dose: Dose


def recipes():
    result = []
    for i, level in enumerate(LEVELS):
        # La difficulté change la structure et la dose, jamais un multiplicateur global.
        result.extend([
            Recipe('brisk-walk', 'Cardio continu', 'calories', level,
                   ['Marche active régulière, avec une pente légère.',
                    'Marche active plus soutenue, avec une pente légère.',
                    'Course continue à 9 km/h pendant tout le travail central.'][i], 'continuous',
                   [4.5, 5., 9.][i], [1., 2., 0.][i], [1200, 1800, 2400][i]),
            Recipe('walk-intervals', 'Cardio en alternance', 'calories', level,
                   ['Marche active et récupération plus lente à plat.',
                    'Passages de marche active plus longs, avec récupération à plat.',
                    'Course à 10 km/h, récupération en footing à 8,1 km/h.'][i], 'intervals',
                   [4.8, 5.3, 10.][i], [1., 2., 0.][i], [1800, 2100, 2400][i],
                   [120, 180, 180][i], [120, 120, 90][i], [6, 8, 12][i],
                   recovery_speed=8.1 if level == 'hard' else None),
            Recipe('hill-plateau', 'Marche en côte', 'incline', level,
                   'Une montée préparée, un plateau, puis une réduction de la pente.', 'pyramid',
                   [4., 4.3, 4.6][i], [3., 5., 7.][i], [1500, 2100, 2700][i],
                   work_limit_sec=[900, 1500, 2100][i]),
            Recipe('hill-waves', 'Vagues de pente', 'incline', level,
                   'Des côtes séparées par une vraie marche de récupération.', 'intervals',
                   [4., 4.3, 4.6][i], [3., 5., 7.][i], [1800, 2100, 2700][i],
                   [120, 180, 240][i], [120, 120, 120][i], [4, 6, 6][i]),
            Recipe('steady-endurance', 'Allure régulière', 'endurance', level,
                   ['Endurance continue en marche.', 'Course régulière avec un volume progressif.',
                    'Course continue à 10 km/h pendant tout le travail central.'][i], 'continuous',
                   [4.8, 8.5, 10.][i], [0., 0., 0.][i], [1500, 2100, 2700][i],
                   work_limit_sec=[0, 1800, 0][i]),
            Recipe('run-walk', 'Course et marche', 'endurance', level,
                   ['Course par passages courts, volume limité et récupération en marche.',
                    'Passages de course plus longs, avec récupération en marche.',
                    'Alternance course et marche sur toute la durée centrale choisie.'][i], 'intervals',
                   [7.5, 8.5, 10.][i], 0., [1800, 2100, 2700][i],
                   [60, 180, 240][i], [90, 120, 90][i], [8, 6, 10][i]),
        ])
    return result


def step(kind, minutes, speed, incline=0):
    return {'kind': kind, 'sec': round(minutes * 60), 'speed': float(speed), 'incline': float(incline)}


def spread(seconds, count):
    """Répartir un total entier entre passages égaux, à une seconde près."""
    base, remainder = divmod(seconds, count)
    return [base + (i < remainder) for i in range(count)]


def max_duration(recipe: Recipe) -> int:
    """Durée constructible avec 120 segments de 60 min, sans plafond d'une heure."""
    if recipe.style == 'intervals':
        cycle_sec = recipe.effort_sec + recipe.recovery_sec
        if recipe.level == 'hard' and recipe.goal != 'incline':
            return 600 + (MAX_SEGMENTS - 4) // 2 * cycle_sec
        return 600 + recipe.max_cycles * cycle_sec + (MAX_SEGMENTS - 4 - 2 * recipe.max_cycles) * MAX_SECONDS
    if recipe.style == 'pyramid' or recipe.work_limit_sec:
        work_items = 3 if recipe.style == 'pyramid' else 1
        return 600 + recipe.work_limit_sec + (MAX_SEGMENTS - 4 - work_items) * MAX_SECONDS
    return 600 + (MAX_SEGMENTS - 4) * MAX_SECONDS


def resize(recipe: Recipe, seconds: int) -> Programme:
    """Construire une dose exacte, sans étirer les efforts au-delà de leurs plafonds.

    Le rapport global effort/récupération est réparti entre cycles. Au plafond,
    chaque seconde supplémentaire devient de la marche facile. Cela conserve
    une dépense croissante, nécessaire à la recherche d'une cible calorique.
    """
    if not 900 <= seconds <= max_duration(recipe):
        raise CatalogTargetError('Choisissez une durée compatible avec ce format, d’au moins 15 min.')
    i = list(LEVELS).index(recipe.level)
    easy_speed = [3.8, 4., 4.2][i]
    kind = 'run' if recipe.speed > 6 else 'steady'
    items = [step('warmup', 2, 3.), step('warmup', 3, easy_speed)]
    core = seconds - 600
    cycles = recovery = 0
    if recipe.style == 'intervals':
        cycle_sec = recipe.effort_sec + recipe.recovery_sec
        full_core = recipe.level == 'hard' and recipe.goal != 'incline'
        window = core if full_core else min(core, recipe.max_cycles * cycle_sec)
        cycles = ceil(window / cycle_sec)
        work = window * recipe.effort_sec // cycle_sec
        recovery = window - work
        recovery_speed = recipe.recovery_speed or easy_speed
        for active_sec, rest_sec in zip(spread(work, cycles), spread(recovery, cycles)):
            items.extend([step(kind, active_sec / 60, recipe.speed, recipe.incline),
                          step('recover', rest_sec / 60, recovery_speed)])
        extra = core - window
        if 0 < extra < 30:
            # Pas de segment illégal de 1–29 s : compléter la récupération finale.
            items[-1]['sec'] += extra
        elif extra:
            items.append(step('recover', extra / 60, easy_speed))
        limit = work if full_core else recipe.effort_sec * recipe.max_cycles
    else:
        # La pyramide finit par une transition à plat. En continu, le retour au
        # calme suffit : aucune minute de marche ajoutée au temps de course.
        transition = 60 if recipe.style == 'pyramid' or recipe.work_limit_sec else 0
        work = min(core - transition, recipe.work_limit_sec or (core - transition))
        extra = core - work
        if recipe.style == 'pyramid':
            shoulder = work // 5
            items.extend([
                step('steady', shoulder / 60, recipe.speed, [1., 2., 3.][i]),
                step('steady', (work - 2 * shoulder) / 60, recipe.speed, recipe.incline),
                step('steady', shoulder / 60, recipe.speed, [1., 2., 2.][i]),
            ])
        else:
            items.append(step(kind, work / 60, recipe.speed, recipe.incline))
        if extra:
            items.append(step('recover', extra / 60, easy_speed))
        limit = recipe.work_limit_sec or (core - transition)
    items.extend([step('cooldown', 2, easy_speed), step('cooldown', 3, 3.)])
    # Une séance longue conserve les mêmes consignes ; seul un bloc de plus
    # d'une heure est réparti en blocs consécutifs, sans fragment de moins de 30 s.
    expanded = []
    for item in items:
        for duration in spread(item['sec'], ceil(item['sec'] / MAX_SECONDS)):
            expanded.append({**item, 'sec': duration})
    data = WorkoutInput(name=recipe.name, goal=recipe.goal, level=recipe.level, items=expanded)
    return Programme(data, Dose(work, recovery, extra, cycles, limit))


def variants():
    return [(r.identifier, r.description, resize(r, r.default_sec).workout) for r in recipes()]


class CatalogTarget(Input):
    duration_sec: int | None = Field(default=None, ge=900, le=3600)
    active_kcal: float | None = Field(default=None, gt=0, le=5000)

    @model_validator(mode='after')
    def exclusive(self):
        if self.duration_sec is not None and self.active_kcal is not None:
            raise ValueError('Choisissez une durée ou des calories, pas les deux')
        return self


class CatalogCopy(Input):
    template_id: str
    level: Literal['easy', 'intermediate', 'hard']
    target: CatalogTarget = Field(default_factory=CatalogTarget)


class CatalogTargetError(Exception):
    pass


def adapt(recipe, target, weight):
    if target.active_kcal is None:
        return resize(recipe, target.duration_sec or recipe.default_sec)
    if weight is None:
        raise CatalogTargetError('Renseignez votre poids dans Réglages pour choisir un objectif de calories.')
    low = 900
    high = 3600

    def kcal(seconds):
        return preview(resize(recipe, seconds).workout, weight)['summary']['energy']['active_kcal']

    lower = kcal(low)
    if target.active_kcal < lower:
        lower_text = f'{lower:g}'.replace('.', ',')
        raise CatalogTargetError(f'Ce format commence à environ {lower_text} kcal actives pour 15 min. Choisissez une cible plus élevée ou un autre niveau.')
    maximum = max_duration(recipe)
    while kcal(high) < target.active_kcal:
        if high == maximum:
            raise CatalogTargetError('Cette cible demande une séance trop longue pour ce format. Choisissez une cible plus basse ou un autre niveau.')
        low, high = high, min(high * 2, maximum)
    while high - low > 1:
        mid = (low + high) // 2
        if kcal(mid) < target.active_kcal:
            low = mid
        else:
            high = mid
    # Première seconde qui atteint la cible estimée : pas de programme en dessous
    # du minimum demandé à cause d'un arrondi au plus proche.
    return resize(recipe, high if kcal(low) < target.active_kcal else low)


def methodology(recipe, programme):
    purpose, structure = METHODS[recipe.identifier]
    sources = ['aha', 'cdc']
    if recipe.goal == 'incline':
        sources.append('incline')
    if recipe.identifier == 'run-walk':
        sources.append('nhs')
    adaptation = ('La durée ajuste les cycles et leur répartition effort/récupération, sans dépasser '
                  'le plafond par passage ni le volume ciblé.' if recipe.style == 'intervals' else
                  'La durée ajuste le travail central, sans augmenter l’allure ou la pente.')
    if programme and programme.dose.easy_sec:
        adaptation += ' Le temps restant est complété par de la marche facile à plat.'
    return {'purpose': purpose, 'structure': structure, 'adaptation': adaptation,
            'effort': 'L’effort doit rester maîtrisé : une conversation possible est le repère pour l’endurance. '
                      'La récupération doit vous permettre de reprendre le passage suivant ; réduisez les consignes sinon.',
            'limits': 'Séance générale : les vitesses et plafonds FitnessApp ne mesurent pas votre capacité personnelle. '
                      'Le niveau Soutenu ne constitue pas une prescription pour athlète de haut niveau.' +
                      (' La pente ne garantit ni gain musculaire ni perte de graisse localisée.' if recipe.goal == 'incline' else ''),
            'sources': [SOURCES[k] for k in sources],
            'dose': asdict(programme.dose) if programme else None}


def preview_catalog(session, profile, target):
    weight = get_profile(session, profile).weight_kg
    result = []
    for recipe in recipes():
        entry = {'template_id': recipe.identifier, 'name': recipe.name, 'description': recipe.description,
                 'goal': recipe.goal, 'level': recipe.level, 'weight_kg': weight, 'workout': None, 'message': None}
        programme = None
        try:
            programme = adapt(recipe, target, weight)
            entry['workout'] = {'template_id': recipe.identifier, 'description': recipe.description,
                               **programme.workout.model_dump(), **preview(programme.workout, weight)}
        except CatalogTargetError as exc:
            entry['message'] = str(exc)
        entry['method'] = methodology(recipe, programme)
        result.append(entry)
    return result


def list_catalog(session, profile):
    weight = get_profile(session, profile).weight_kg
    return [{'template_id': identifier, 'description': description, **data.model_dump(), **preview(data, weight)}
            for identifier, description, data in variants()]


def add_catalog(session, profile, payload):
    weight = get_profile(session, profile).weight_kg
    for recipe in recipes():
        if recipe.identifier == payload.template_id and recipe.level == payload.level:
            programme = adapt(recipe, payload.target, weight)
            return create_workout(session, profile, programme.workout,
                origin={'kind': 'catalog', 'template_id': recipe.identifier, 'level': recipe.level,
                        'catalog_revision': CATALOG_REVISION,
                        'target': payload.target.model_dump(exclude_none=True)})
    raise WorkoutNotFound()
