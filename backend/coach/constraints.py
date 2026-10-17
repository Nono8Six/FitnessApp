"""Contraintes de la demande conservées indépendamment des blocs générés."""
import re
import unicodedata
from typing import Literal

from pydantic import Field
from ..training.workouts import Input


def normalized(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.casefold()) if not unicodedata.combining(c))


NUMBER = r'(\d+(?:[.,]\d+)?)'


class RequestConstraintError(ValueError):
    """Erreur de citation sûre à renvoyer au modèle, sans contenu personnel."""


def quantities(text, unit):
    text = normalized(text)
    patterns = {'seconds': rf'{NUMBER}\s*(secondes?|secs?|s)\b',
                'minutes': rf'{NUMBER}\s*(minutes?|mins?|mn)\b',
                'hours': rf'{NUMBER}\s*(heures?|hours?|h)\b',
                'speed': rf'{NUMBER}\s*km\s*/?\s*h\b',
                'incline': rf'{NUMBER}\s*%', 'calories': rf'{NUMBER}\s*(kcal|calories)\b'}
    return [float(m.group(1).replace(',', '.')) for m in re.finditer(patterns[unit], text)]


def speed_ranges(text):
    """Plages explicites avec unité ; un effort « 6–7/10 » n'est pas une vitesse."""
    pattern = rf'{NUMBER}\s*(?:[-–—]|a|et)\s*{NUMBER}\s*km\s*/?\s*h\b'
    return [(float(m.group(1).replace(',', '.')), float(m.group(2).replace(',', '.')))
            for m in re.finditer(pattern, normalized(text))
            if float(m.group(1).replace(',', '.')) <= float(m.group(2).replace(',', '.'))]


def durations(text):
    clean = normalized(text)
    values = []
    for phrase, value in ((r'(?:une?\s+)?demi[e-]?\s*heure', 1800), (r'(?:un\s+)?quart\s+d.heure', 900)):
        if re.search(phrase, clean):
            values.append(value)
            clean = re.sub(phrase, ' ', clean)
    def combined(match):
        values.append(int(match.group(1)) * 3600 + int(match.group(2)) * 60)
        return ' '
    clean = re.sub(r'\b(\d+)\s*h\s*(\d{1,2})(?:\s*min(?:utes?)?)?\b', combined, clean)
    for word, number in {'quinze': 15, 'vingt': 20, 'trente': 30, 'quarante': 40,
                         'cinquante': 50, 'soixante': 60}.items():
        clean = re.sub(rf'\b{word}\s+(?=minutes?\b)', f'{number} ', clean)
    return values + quantities(clean, 'seconds') + [x * 60 for x in quantities(clean, 'minutes')] + [x * 3600 for x in quantities(clean, 'hours')]


class RequestFacts(Input):
    goal: Literal['fat_loss', 'cardio', 'endurance', 'recovery'] | None = None
    max_duration_sec: int | None = Field(default=None, ge=30, le=432000,
        description='Durée totale EN SECONDES : 30 minutes = 1800. Null si déjà présente dans request_constraints.')
    duration_quote: str | None = Field(default=None, max_length=500,
        description='Copier un extrait EXACT du message actuel contenant le nombre et son unité, par exemple « 30 minutes ». Ne pas reformuler.')
    max_speed: float | None = Field(default=None, ge=1, le=16)
    speed_quote: str | None = Field(default=None, max_length=500)
    max_incline: float | None = Field(default=None, ge=0, le=10)
    incline_quote: str | None = Field(default=None, max_length=500)
    gait: Literal['walk', 'run', 'either'] | None = None
    gait_quote: str | None = Field(default=None, max_length=500,
        description='Extrait EXACT du message actuel, par exemple « séance de marche ». Ne pas remplacer marche par marcher.')
    min_active_kcal: float | None = Field(default=None, gt=0, le=5000)
    calories_quote: str | None = Field(default=None, max_length=500)

    def verified(self, text):
        result = {'goal': self.goal} if self.goal else {}
        for key, quote_key, parser in (
            ('max_duration_sec', 'duration_quote', durations),
            ('max_speed', 'speed_quote', lambda q: quantities(q, 'speed')),
            ('max_incline', 'incline_quote', lambda q: quantities(q, 'incline')),
            ('min_active_kcal', 'calories_quote', lambda q: quantities(q, 'calories'))):
            value, quote = getattr(self, key), getattr(self, quote_key)
            if value is not None:
                if not quote or quote not in text or value not in parser(quote):
                    raise RequestConstraintError(f'{key} doit correspondre à une quantité citée exactement dans le message actuel. Laisser null si la limite vient de la mémoire.')
                if key in {'max_speed', 'max_incline'} and not re.search(r'(max|limite|pas plus|au plus|ne.{0,12}depass)', normalized(quote)):
                    raise RequestConstraintError(f'{key} doit citer une limite explicite, pas une simple allure confortable.')
                result[key] = value
        if self.gait:
            if not self.gait_quote or self.gait_quote not in text:
                raise RequestConstraintError('Le déplacement doit citer exactement le message actuel. Laisser null pour une préférence déjà mémorisée.')
            result['gait'] = self.gait
        return result


def extract(text, previous=None):
    """Reconnaître les contraintes explicites usuelles ; compléter par citations via l'outil.

    Aucune vitesse simplement mentionnée n'est transformée en plafond personnel.
    """
    clean = normalized(text)
    new_request = bool(re.search(r'(seance|entrainement|programme).{0,35}(pour|de |pendant)|(?:cree|prepare|propose).{0,25}(seance|entrainement)', clean))
    result = {} if new_request else dict(previous or {})
    values = durations(clean)
    if values and (re.search(r'(max|pas plus|au plus|seance|entrainement|pendant|disponible|prepare|propose|cardio|endurance)', clean)
                   or re.fullmatch(r'\s*\d+\s*(min(?:utes?)?|mn|h(?:eures?)?)\s*[.!]?\s*', clean)):
        # Plusieurs durées peuvent décrire des blocs : ne pas inventer le budget global.
        if len(values) == 1:
            result['max_duration_sec'] = int(values[0])
    for key, unit, suffix in (('max_speed', 'speed', r'km\s*/\s*h'), ('max_incline', 'incline', '%')):
        match = re.search(rf'(?:max(?:imum|imale?)?|pas plus de|au plus|limite a)\s*(?:de\s*)?{NUMBER}\s*{suffix}', clean)
        if match:
            result[key] = float(match.group(1).replace(',', '.'))
    if re.search(r'(sans course|ne (?:veux|peux).{0,12}(courir|course)|uniquement.{0,10}marche|marche uniquement)', clean):
        result['gait'] = 'walk'
    for goal, pattern in (('fat_loss', r'(graisse|maigrir|perdre.{0,12}poids)'), ('cardio', r'cardio'),
                          ('endurance', r'endurance'), ('recovery',
                           r'(?:seance|entrainement|programme|objectif).{0,25}(?:recuperation|recuperer)|'
                           r'(?:pour|veux|souhaite).{0,15}recuperer|^\s*recuperation[.!]?\s*$')):
        if re.search(pattern, clean):
            result['goal'] = goal
            break
    calories = re.search(rf'(?:au moins|min(?:imum)?|>=)\s*(?:de\s*)?{NUMBER}\s*(?:kcal|calories)\b', clean)
    if calories:
        result['min_active_kcal'] = float(calories.group(1).replace(',', '.'))
    return result


def check(workout, blocks, request):
    errors = []
    if request.get('max_duration_sec') is not None and sum(b['sec'] for b in blocks) > request['max_duration_sec']:
        errors.append(f"La demande limite la durée totale à {request['max_duration_sec']} s, début et fin compris.")
    for key, field, label in (('max_speed', 'speed', 'vitesse'), ('max_incline', 'incline', 'pente')):
        if request.get(key) is not None and any(b[field] > request[key] for b in blocks):
            errors.append(f"La {label} dépasse la limite personnelle de {request[key]}.")
    if request.get('gait') == 'walk' and any(b.get('movement') == 'run' or b['kind'] == 'run' or b['speed'] >= 8.04 for b in blocks):
        errors.append('La personne demande de la marche : aucun bloc de course.')
    return errors
