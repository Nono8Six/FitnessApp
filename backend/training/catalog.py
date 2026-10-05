"""Six formats éditoriaux, trois variantes explicites ; aucune génération IA.

Les niveaux décrivent les consignes, pas l'aptitude d'une personne. Toutes les
variantes utilisent la validation et l'estimation des séances personnelles.
"""
from typing import Literal
from math import ceil, floor

from pydantic import Field, model_validator

from .workouts import Input, Repeat, WorkoutInput, WorkoutNotFound, create_workout, preview
from .profiles import get_profile

GOALS = {'calories': 'Dépense calorique', 'incline': 'Jambes et fessiers — marche inclinée', 'endurance': 'Endurance'}
LEVELS = {'easy': 'Facile', 'intermediate': 'Intermédiaire', 'hard': 'Soutenu'}
CATALOG_REVISION = '2026-10-05-method-1'
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
    'brisk-walk': ('Accumuler un effort de marche régulier pour viser une dépense énergétique.',
                   'Une allure constante et une pente légère : la durée apporte le volume de travail.'),
    'walk-intervals': ('Répartir la marche active en passages séparés par de vraies récupérations.',
                        'Alterner marche active et marche plus lente à plat ; récupérer avant le passage suivant.'),
    'hill-plateau': ('Travailler la marche en montée et la sollicitation des jambes.',
                      'Pente de mise en route, plateau plus incliné, puis pente réduite avant le retour au calme.'),
    'hill-waves': ('Répéter des montées en marche avec des récupérations à plat.',
                    'La pente apporte la difficulté ; les passages à plat permettent de récupérer entre les côtes.'),
    'steady-endurance': ('Accumuler du temps à une allure régulière pour travailler l’endurance aérobie.',
                          'Un effort continu en marche ou en course, sans accélérations ni sprint.'),
    'run-walk': ('Travailler l’endurance avec des passages de course interrompus par de la marche.',
                  'Alterner course et marche ; au niveau facile, le repère est 1 min de course pour 1 min 30 de marche.'),
}


def methodology(identifier, data):
    purpose, structure = METHODS[identifier]
    intervals = any(isinstance(i, Repeat) for i in data.items)
    sources = ['aha', 'cdc']
    if data.goal == 'incline':
        sources.append('incline')
    if identifier == 'run-walk':
        sources.append('nhs')
    return {'purpose': purpose, 'structure': structure,
            'adaptation': ('Une séance plus longue ajoute des cycles. Les passages ne dépassent pas les durées du modèle ; '
                           'le rapport effort/récupération est conservé à l’arrondi près.' if intervals else
                           'La durée du travail central change ; l’allure et les phases de pente sont conservées.'),
            'effort': 'Cherchez une allure maîtrisée, avec une conversation possible. Si ce repère ne tient pas, réduisez les consignes dans votre copie.',
            'limits': 'Principes sourcés, paramètres FitnessApp : ces vitesses ne mesurent pas votre niveau personnel. '
                      'Ce programme n’est pas une prescription individualisée.' +
                      (' La marche inclinée ne garantit ni gain musculaire ni perte de graisse localisée.' if data.goal == 'incline' else ''),
            'sources': [SOURCES[k] for k in sources]}


def step(kind, minutes, speed, incline=0):
    return {'kind': kind, 'sec': int(minutes * 60), 'speed': float(speed), 'incline': float(incline)}


def programme(name, goal, level, middle):
    # Cinq minutes de marche de chaque côté, sans multiplier les consignes.
    # Principe général de mise en route/retour au calme : NHS Couch to 5K.
    # https://www.nhs.uk/better-health/get-active/get-running-with-couch-to-5k/couch-to-5k-running-plan/
    # Les variantes sont des choix éditoriaux FitnessApp, pas un programme médical NHS.
    return WorkoutInput(name=name, goal=goal, level=level,
        items=[step('warmup', 5, 3.5), *middle, step('cooldown', 5, 3.)])


def variants():
    result = []
    for index, level in enumerate(LEVELS):
        specs = [
            ('brisk-walk', 'Marche active', 'calories', 'Une marche régulière avec une inclinaison légère.',
             [step('steady', [10, 18, 25][index], [4.5, 5.2, 5.8][index], [1, 2, 3][index])]),
            ('walk-intervals', 'Marche en alternance', 'calories', 'Des passages actifs séparés par une marche de récupération.',
             [{'repeat': [4, 5, 6][index], 'steps': [step('steady', [2, 3, 3][index], [4.8, 5.3, 5.8][index], [1, 3, 4][index]),
                 step('recover', [2, 2, 1.5][index], [3.8, 4, 4.2][index])]}]),
            ('hill-plateau', 'Marche en côte', 'incline', 'Une montée régulière, puis une descente progressive de la pente.',
             [step('steady', [4, 6, 8][index], [4, 4.3, 4.5][index], [2, 3, 4][index]),
              step('steady', [6, 10, 14][index], [4, 4.5, 4.8][index], [3, 5, 7][index]),
              step('steady', [3, 4, 5][index], [3.8, 4, 4.2][index], [1, 2, 3][index])]),
            ('hill-waves', 'Vagues de pente', 'incline', 'Des côtes en marche, avec des passages à plat entre les montées.',
             [{'repeat': [3, 4, 5][index], 'steps': [step('steady', [2, 3, 4][index], [4, 4.4, 4.8][index], [3, 5, 8][index]),
                 step('recover', 2, [3.5, 3.8, 4][index])]}]),
            ('steady-endurance', 'Allure régulière', 'endurance', 'Un effort continu : marche au niveau facile, course aux niveaux suivants.',
             [step(['steady', 'run', 'run'][index], [15, 22, 30][index], [5, 8.5, 10][index], [0, 0.5, 1][index])]),
            ('run-walk', 'Course et marche', 'endurance', 'Des passages de course courts et bornés, avec récupération en marche.',
             [{'repeat': [4, 5, 6][index], 'steps': [step('run', [1, 3, 4][index], [8.1, 9, 10.5][index], [0, 0.5, 1][index]),
                 step('recover', [1.5, 2, 1.5][index], [3.8, 4.2, 4.5][index])]}]),
        ]
        for identifier, name, goal, description, middle in specs:
            result.append((identifier, description, programme(name, goal, level, middle)))
    return result


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


def resize(data: WorkoutInput, seconds: int) -> WorkoutInput:
    """Répartir des secondes entières, avec 30 s minimum par segment.

    Conserver les vitesses, pentes et rapport effort/récupération. Pour les
    alternances, augmenter le nombre de cycles plutôt que dépasser leurs durées.
    Échauffement et retour au calme restent à 5 min.
    """
    blocks = preview(data)['blocks']
    middle = blocks[1:-1]
    remaining = seconds - 600
    if len(data.items) == 3 and isinstance(data.items[1], Repeat):
        pattern = data.items[1].steps
        cycles = ceil(remaining / sum(s.sec for s in pattern))
        middle = [s.model_dump() for _ in range(cycles) for s in pattern]
    if remaining < 30 * len(middle):
        raise CatalogTargetError(f'Ce format nécessite au moins {(600 + 30 * len(middle)) / 60:g} min.')
    pending = list(range(len(middle)))
    durations = [30] * len(middle)
    while pending:
        weight = sum(middle[i]['sec'] for i in pending)
        minimum = [i for i in pending if remaining * middle[i]['sec'] / weight < 30]
        if not minimum:
            exact = {i: remaining * middle[i]['sec'] / weight for i in pending}
            for i in pending:
                durations[i] = floor(exact[i])
            missing = remaining - sum(durations[i] for i in pending)
            for i in sorted(pending, key=lambda i: exact[i] - durations[i], reverse=True)[:missing]:
                durations[i] += 1
            break
        for i in minimum:
            pending.remove(i)
            remaining -= 30
    items = [data.items[0].model_dump(), *[
        {k: b[k] for k in ('kind', 'speed', 'incline')} | {'sec': durations[i]}
        for i, b in enumerate(middle)], data.items[-1].model_dump()]
    return WorkoutInput(**(data.model_dump() | {'items': items}))


def adapt(data, target, weight):
    if target.duration_sec is not None:
        return resize(data, target.duration_sec)
    if target.active_kcal is None:
        return data
    if weight is None:
        raise CatalogTargetError('Renseignez votre poids dans Réglages pour choisir un objectif de calories.')
    low = 900
    high = 3600

    def kcal(seconds):
        return preview(resize(data, seconds), weight)['summary']['energy']['active_kcal']

    lower, upper = kcal(low), kcal(high)
    if not lower <= target.active_kcal <= upper:
        lower_text, upper_text = (f'{v:g}'.replace('.', ',') for v in (lower, upper))
        raise CatalogTargetError(f'À ce niveau, choisissez entre {lower_text} et {upper_text} kcal actives estimées ({low / 60:g} à 60 min).')
    # Chercher la durée puis choisir la seconde voisine la plus proche. Le calcul
    # partagé reste l'autorité ; aucune hausse de vitesse/pente pour forcer le but.
    while high - low > 1:
        mid = (low + high) // 2
        if kcal(mid) < target.active_kcal:
            low = mid
        else:
            high = mid
    seconds = min((low, high), key=lambda s: abs(kcal(s) - target.active_kcal))
    return resize(data, seconds)


def preview_catalog(session, profile, target):
    weight = get_profile(session, profile).weight_kg
    result = []
    for identifier, description, data in variants():
        entry = {'template_id': identifier, 'name': data.name, 'description': description,
                 'goal': data.goal, 'level': data.level, 'weight_kg': weight,
                 'method': methodology(identifier, data), 'workout': None, 'message': None}
        try:
            adjusted = adapt(data, target, weight)
            entry['workout'] = {'template_id': identifier, 'description': description,
                               **adjusted.model_dump(), **preview(adjusted, weight)}
        except CatalogTargetError as exc:
            entry['message'] = str(exc)
        result.append(entry)
    return result


def list_catalog(session, profile):
    weight = get_profile(session, profile).weight_kg
    return [{'template_id': identifier, 'description': description, **data.model_dump(), **preview(data, weight)}
            for identifier, description, data in variants()]


def add_catalog(session, profile, payload):
    weight = get_profile(session, profile).weight_kg
    for identifier, _, data in variants():
        if identifier == payload.template_id and data.level == payload.level:
            data = adapt(data, payload.target, weight)
            return create_workout(session, profile, data,
                origin={'kind': 'catalog', 'template_id': identifier, 'level': data.level,
                        'catalog_revision': CATALOG_REVISION,
                        'target': payload.target.model_dump(exclude_none=True)})
    raise WorkoutNotFound()
