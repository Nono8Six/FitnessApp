"""Six formats éditoriaux, trois variantes explicites ; aucune génération IA.

Les niveaux décrivent les consignes, pas l'aptitude d'une personne. Toutes les
variantes utilisent la validation et l'estimation des séances personnelles.
"""
from typing import Literal

from .workouts import Input, WorkoutInput, WorkoutNotFound, create_workout, preview
from .profiles import get_profile

GOALS = {'calories': 'Dépense calorique', 'incline': 'Jambes et fessiers — marche inclinée', 'endurance': 'Endurance'}
LEVELS = {'easy': 'Facile', 'intermediate': 'Intermédiaire', 'hard': 'Soutenu'}


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
            ('run-walk', 'Course et marche', 'endurance', 'Des séquences de course entrecoupées de marche.',
             [{'repeat': [4, 5, 6][index], 'steps': [step('run', [1, 3, 4][index], [8.1, 9, 10.5][index], [0, 0.5, 1][index]),
                 step('recover', [2, 2, 1.5][index], [3.8, 4.2, 4.5][index])]}]),
        ]
        for identifier, name, goal, description, middle in specs:
            result.append((identifier, description, programme(name, goal, level, middle)))
    return result


class CatalogCopy(Input):
    template_id: str
    level: Literal['easy', 'intermediate', 'hard']


def list_catalog(session, profile):
    weight = get_profile(session, profile).weight_kg
    return [{'template_id': identifier, 'description': description, **data.model_dump(), **preview(data, weight)}
            for identifier, description, data in variants()]


def add_catalog(session, profile, payload):
    for identifier, _, data in variants():
        if identifier == payload.template_id and data.level == payload.level:
            return create_workout(session, profile, data,
                origin={'kind': 'catalog', 'template_id': identifier, 'level': data.level})
    raise WorkoutNotFound()
