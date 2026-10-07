"""Estimation ACSM avant séance, jamais une mesure de calories dépensées.

Méthode, sources et limites : docs/ESTIMATION_CALORIES.md.
Les entrées sont déjà validées par les modèles de séance et de profil.
"""
from math import hypot


def estimate(blocks: list[dict], weight_kg: float | None, *, rounded: bool = True) -> dict:
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
