"""Estimation ACSM avant séance, jamais une mesure de calories dépensées.

Méthode, sources et limites : docs/ESTIMATION_CALORIES.md.
Les entrées sont déjà validées par les modèles de séance et de profil.
"""
from math import hypot


def estimate_legacy(blocks: list[dict], weight_kg: float | None, *, rounded: bool = True) -> dict:
    active = total = ascent = 0.0
    outside_range = False
    for block in blocks:
        speed = block["speed"] * 1000 / 60  # m/min
        grade = block["incline"] / 100
        minutes = block["sec"] / 60
        if block["speed"] <= 6:
            oxygen = 0.1 * speed + 1.8 * speed * grade
            outside_range |= not 3 <= block["speed"] <= 6
        else:
            oxygen = 0.2 * speed + 0.9 * speed * grade
            outside_range |= block["speed"] < 8.04
        if weight_kg is not None:
            active += oxygen * weight_kg / 200 * minutes
            total += (oxygen + 3.5) * weight_kg / 200 * minutes
        # La distance du tapis suit la bande ; la pente est élévation / horizontale.
        ascent += speed * minutes * grade / hypot(1, grade)
    return {
        "ascent_m": round(ascent, 1) if rounded else ascent,
        "energy": {
            "active_kcal": (round(active, 1) if rounded else active) if weight_kg is not None else None,
            "total_kcal": (round(total, 1) if rounded else total) if weight_kg is not None else None,
            "weight_kg": weight_kg,
            "automatic_gait": True,
            "outside_range": outside_range,
        },
    }


METHOD = 'acsm-v2-movement'


def estimate(blocks: list[dict], weight_kg: float | None, *, rounded: bool = True) -> dict:
    """Pas de bascule physiologique inventée entre 6 et 8,04 km/h.

    Une intention de course explicite décrit une hypothèse du programme, pas une mesure.
    Deux hypothèses sont des scénarios, jamais un intervalle de confiance.
    """
    low = high = total_low = total_high = ascent = 0.0
    ambiguous = outside = False
    for block in blocks:
        kmh = block['speed']
        speed, grade, minutes = kmh * 1000 / 60, block['incline'] / 100, block['sec'] / 60
        movement = block.get('movement')
        if movement is None:
            movement = 'run' if block.get('kind') == 'run' else 'walk' if kmh <= 6 else 'run' if kmh >= 8.04 else None
        walk, run = .1 * speed + 1.8 * speed * grade, .2 * speed + .9 * speed * grade
        if kmh == 0:
            a = b = 0.0
        elif movement == 'walk':
            a = b = walk
            outside |= not 3 <= kmh <= 6
        elif movement == 'run':
            a = b = run
            outside |= kmh < 8.04
        else:
            a, b = min(walk, run), max(walk, run)
            ambiguous = outside = True
        if weight_kg is not None:
            factor = weight_kg / 200 * minutes
            low += a * factor
            high += b * factor
            total_low += (a + 3.5) * factor
            total_high += (b + 3.5) * factor
        ascent += speed * minutes * grade / hypot(1, grade)
    def number(value):
        return (round(value, 1) if rounded else value) if weight_kg is not None else None
    return {'ascent_m': round(ascent, 1) if rounded else ascent, 'energy': {
        'active_kcal': None if ambiguous else number(low), 'total_kcal': None if ambiguous else number(total_low),
        'active_kcal_low': number(low), 'active_kcal_high': number(high),
        'total_kcal_low': number(total_low), 'total_kcal_high': number(total_high),
        'weight_kg': weight_kg, 'automatic_gait': True, 'outside_range': outside,
        'movement_ambiguous': ambiguous, 'method': METHOD}}
