"""Calcul v1, sans interpolation. Intervalles gauches pondérés en temps actif.

Les deux extrémités doivent être valides et séparées de 2 s au maximum.
La distance suit exclusivement le compteur, effort et décélération compris.
"""
from ..training.energy import estimate, estimate_legacy, METHOD

LEGACY_VERSION = "recording-v1-acsm-v1"
VERSION = "recording-v1-acsm-v2"
MOVING = {"running", "transitioning", "adjusting", "pausing", "stopping"}


class Distance:
    """Deltas du compteur partagés par le Direct et le bilan, sans combler les trous."""
    def __init__(self):
        self.meters = self.valid_s = self.expected_s = 0.0
        self.partial = False

    def add(self, a, b):
        dt = b["t"] - a["t"]
        if dt <= 0 or not (a.get("phase") in MOVING or b.get("phase") in MOVING):
            return
        self.expected_s += dt
        ca, cb = a.get("counter_m"), b.get("counter_m")
        if dt <= 2 and a.get("phase") != "unknown" and ca is not None and cb is not None and cb >= ca:
            self.meters += cb - ca
            self.valid_s += dt
        else:
            self.partial = True

    def result(self):
        return {"distance_m": round(self.meters, 1) if self.valid_s else None,
                "distance_quality": "absent" if not self.valid_s else "partial" if self.partial else "complete",
                "distance_coverage": round(self.valid_s / self.expected_s, 4) if self.expected_s else None}


class Totals:
    """Même réduction pour le bilan et le Direct, sans stocker tous les points."""
    def __init__(self, weight, *, legacy=False):
        self.weight = weight
        self.legacy = legacy
        self.ambiguous = False
        self.low = self.high = self.total_low = self.total_high = 0.0
        self.covered = {"speed": 0.0, "incline": 0.0, "energy": 0.0}
        self.sums = {"speed": 0.0, "incline": 0.0}
        self.active_kcal = self.total_kcal = 0.0
        self.outside_range = False

    def add(self, a, b):
        dt = b["t"] - a["t"]
        da = max(0, b["active_s"] - a["active_s"])
        valid = {k: 0.0 for k in self.covered}
        if not (0 < dt <= 2 and da > 0 and a.get("phase") not in {"unknown", "paused"}):
            return valid
        for field in self.sums:
            if a.get(field) is not None and b.get(field) is not None:
                valid[field] = da
                self.covered[field] += da
                self.sums[field] += a[field] * da
        if valid["speed"] and valid["incline"]:
            valid["energy"] = da
            self.covered["energy"] += da
            energy = (estimate_legacy if self.legacy else estimate)([{"speed": a["speed"], "incline": a["incline"],
                "sec": da, 'movement': a.get('movement')}], self.weight, rounded=False)["energy"]
            self.active_kcal += energy["active_kcal"] or 0
            self.total_kcal += energy["total_kcal"] or 0
            self.ambiguous |= energy.get('movement_ambiguous', False)
            self.low += energy.get('active_kcal_low', energy['active_kcal']) or 0
            self.high += energy.get('active_kcal_high', energy['active_kcal']) or 0
            self.total_low += energy.get('total_kcal_low', energy['total_kcal']) or 0
            self.total_high += energy.get('total_kcal_high', energy['total_kcal']) or 0
            self.outside_range |= energy["outside_range"]
        return valid

    def result(self, active):
        available = bool(self.covered['energy'] and self.weight is not None)
        energy = {'active_kcal': round(self.active_kcal, 1) if available and not self.ambiguous else None,
                  'total_kcal': round(self.total_kcal, 1) if available and not self.ambiguous else None,
                  'weight_kg': self.weight, 'automatic_gait': True, 'outside_range': self.outside_range}
        if not self.legacy:
            energy.update({'method': METHOD, 'movement_ambiguous': self.ambiguous,
                **{k: round(v, 1) if available else None for k, v in (
                    ('active_kcal_low', self.low), ('active_kcal_high', self.high),
                    ('total_kcal_low', self.total_low), ('total_kcal_high', self.total_high))}})
        return {**{f"{k}_avg": round(self.sums[k] / self.covered[k], 2) if self.covered[k] else None for k in self.sums},
                "coverage": {k: round(min(1, v / active), 4) if active else None for k, v in self.covered.items()},
                "valid_s": {k: round(v, 2) for k, v in self.covered.items()},
                "energy": energy}


def calculate(samples, checkpoint, weight, blocks, *, legacy=False):
    active = checkpoint.get("active_s", 0)
    totals = Totals(weight, legacy=legacy)
    distance = Distance()
    per_block = [{"active_s": 0.0, "speed_sum": 0.0, "incline_sum": 0.0,
                  "speed_valid_s": 0.0, "incline_valid_s": 0.0} for _ in blocks]
    for a, b in zip(samples, samples[1:]):
        dt = b["t"] - a["t"]
        if dt <= 0:
            continue
        da = max(0, b["active_s"] - a["active_s"])
        valid = totals.add(a, b)
        block = per_block[a.get("block_index", 0)]
        block["active_s"] += da
        for field in ("speed", "incline"):
            if valid[field]:
                block[f"{field}_valid_s"] += da
                block[f"{field}_sum"] += a[field] * da
        distance.add(a, b)
    for block in per_block:
        for field in ("speed", "incline"):
            valid = block.pop(f"{field}_valid_s")
            block[f"{field}_coverage"] = round(min(1, valid / block["active_s"]), 4) if block["active_s"] else None
            block[f"{field}_avg"] = round(block.pop(f"{field}_sum") / valid, 2) if valid else None
        block["active_s"] = round(block["active_s"], 2)
    return {"version": LEGACY_VERSION if legacy else VERSION, "active_s": active, "pause_s": checkpoint.get("pause_s", 0),
            "wall_s": checkpoint.get("wall_s", 0),
            **distance.result(),
            **totals.result(active), "blocks": per_block}


def calculate_version(version, samples, checkpoint, weight, blocks):
    if version not in {VERSION, LEGACY_VERSION}:
        raise ValueError("Cette version de calcul nécessite une mise à jour de FitnessApp.")
    return calculate(samples, checkpoint, weight, blocks, legacy=version == LEGACY_VERSION)
