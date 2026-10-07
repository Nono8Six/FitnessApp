"""Calcul v1, sans interpolation. Intervalles gauches pondérés en temps actif.

Les deux extrémités doivent être valides et séparées de 2 s au maximum.
La distance suit exclusivement le compteur, effort et décélération compris.
"""
from ..training.energy import estimate

VERSION = "recording-v1-acsm-v1"
MOVING = {"running", "transitioning", "adjusting", "pausing", "stopping"}


def calculate(samples, checkpoint, weight, blocks):
    active = checkpoint.get("active_s", 0)
    covered = {"speed": 0.0, "incline": 0.0, "energy": 0.0}
    sums = {"speed": 0.0, "incline": 0.0}
    energy_blocks = []
    distance = 0.0
    distance_valid = 0.0
    distance_expected = 0.0
    partial = False
    per_block = [{"active_s": 0.0, "speed_sum": 0.0, "incline_sum": 0.0,
                  "speed_valid_s": 0.0, "incline_valid_s": 0.0} for _ in blocks]
    for a, b in zip(samples, samples[1:]):
        dt = b["t"] - a["t"]
        if dt <= 0:
            continue
        da = max(0, b["active_s"] - a["active_s"])
        contiguous = 0 < dt <= 2 and a.get("phase") not in {"unknown", "paused"}
        block = per_block[a.get("block_index", 0)]
        block["active_s"] += da
        for field in ("speed", "incline"):
            if contiguous and a.get(field) is not None and b.get(field) is not None:
                covered[field] += da
                sums[field] += a[field] * da
                block[f"{field}_valid_s"] += da
                block[f"{field}_sum"] += a[field] * da
        if contiguous and da > 0 and all(p.get(k) is not None for p in (a, b) for k in ("speed", "incline")):
            covered["energy"] += da
            # Une vitesse nulle ne crée pas de calories actives de locomotion.
            energy_blocks.append({"speed": a["speed"], "incline": a["incline"], "sec": da})
        if b.get("phase") in MOVING or a.get("phase") in MOVING:
            distance_expected += max(0, dt)
            ca, cb = a.get("counter_m"), b.get("counter_m")
            if dt <= 2 and a.get("phase") != "unknown" and ca is not None and cb is not None and cb >= ca:
                distance += cb - ca
                distance_valid += dt
            else:
                partial = True
    energy = estimate(energy_blocks, weight)["energy"] if covered["energy"] > 0 else {
        "active_kcal": None, "total_kcal": None, "weight_kg": weight, "outside_range": False}
    for block in per_block:
        for field in ("speed", "incline"):
            valid = block.pop(f"{field}_valid_s")
            block[f"{field}_coverage"] = round(min(1, valid / block["active_s"]), 4) if block["active_s"] else None
            block[f"{field}_avg"] = round(block.pop(f"{field}_sum") / valid, 2) if valid else None
        block["active_s"] = round(block["active_s"], 2)
    return {"version": VERSION, "active_s": active, "pause_s": checkpoint.get("pause_s", 0),
            "wall_s": checkpoint.get("wall_s", 0),
            "distance_m": round(distance, 1) if distance_valid else None,
            "distance_quality": "absent" if not distance_valid else "partial" if partial else "complete",
            "distance_coverage": round(distance_valid / distance_expected, 4) if distance_expected else None,
            "speed_avg": round(sums["speed"] / covered["speed"], 2) if covered["speed"] else None,
            "incline_avg": round(sums["incline"] / covered["incline"], 2) if covered["incline"] else None,
            "coverage": {k: round(min(1, v / active), 4) if active else None for k, v in covered.items()},
            "valid_s": {k: round(v, 2) for k, v in covered.items()}, "energy": energy, "blocks": per_block}


def calculate_version(version, samples, checkpoint, weight, blocks):
    if version != VERSION:
        raise ValueError("Cette version de calcul nécessite une mise à jour de FitnessApp.")
    return calculate(samples, checkpoint, weight, blocks)
