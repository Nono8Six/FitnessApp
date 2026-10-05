"""Bounded implementation of Bluetooth SIG FTMS; all units are explicit."""

import math
import struct


def uuid(value: int) -> str:
    return f"0000{value:04x}-0000-1000-8000-00805f9b34fb"


SERVICE = uuid(0x1826)
FEATURE = uuid(0x2ACC)
TREADMILL = uuid(0x2ACD)
SPEED_RANGE = uuid(0x2AD4)
INCLINE_RANGE = uuid(0x2AD5)
CONTROL = uuid(0x2AD9)
STATUS = uuid(0x2ADA)
DOMYOS_SERVICE = "49535343-fe7d-4ae5-8fa9-9fafd205e455"
RESULTS = {
    1: "Commande acceptée par le tapis",
    2: "Commande non prise en charge",
    3: "Paramètre refusé par le tapis",
    4: "Échec d'exécution côté tapis",
    5: "Contrôle refusé ou perdu",
}
OPCODES = {"request_control": 0, "speed": 2, "incline": 3, "start": 7, "stop": 8, "pause": 8}


def parse_features(data: bytes) -> dict:
    if len(data) != 8:
        raise ValueError(f"Fitness Machine Feature : 8 octets attendus, {len(data)} reçus")
    machine, target = struct.unpack("<II", data)
    return {
        "machine_bits": f"0x{machine:08x}",
        "target_bits": f"0x{target:08x}",
        "speed_target": bool(target & 1),
        "incline_target": bool(target & 2),
        "incline_data": bool(machine & (1 << 3)),
        "distance_data": bool(machine & (1 << 2)),
        "heart_rate_data": bool(machine & (1 << 10)),
    }


def parse_range(data: bytes, *, incline: bool = False) -> dict:
    if len(data) != 6:
        raise ValueError("Plage FTMS : 6 octets attendus")
    minimum, maximum, step = struct.unpack("<hhH" if incline else "<HHH", data)
    if minimum > maximum or step == 0:
        raise ValueError("Plage FTMS incohérente")
    scale = 10 if incline else 100
    return {"min": minimum / scale, "max": maximum / scale, "step": step / scale}


def parse_treadmill(data: bytes) -> dict:
    """Return only fields present in this notification, including split records."""
    offset = 0

    def read(size: int, *, signed: bool = False) -> int:
        nonlocal offset
        if offset + size > len(data):
            raise ValueError(f"Télémétrie FTMS tronquée à l'octet {offset}")
        result = int.from_bytes(data[offset:offset + size], "little", signed=signed)
        offset += size
        return result

    flags = read(2)
    values = {"flags": f"0x{flags:04x}"}
    if flags & 0xE000:
        raise ValueError("Flags FTMS réservés : format non pris en charge")
    if not flags & 1:
        values["speed_kmh"] = read(2) / 100
    if flags & (1 << 1):
        values["average_speed_kmh"] = read(2) / 100
    if flags & (1 << 2):
        values["distance_m"] = read(3)
    if flags & (1 << 3):
        values["incline_pct"] = read(2, signed=True) / 10
        values["ramp_angle_deg"] = read(2, signed=True) / 10
    if flags & (1 << 4):
        values["positive_elevation_m"] = read(2) / 10
        values["negative_elevation_m"] = read(2) / 10
    if flags & (1 << 5):
        values["pace_min_km"] = read(1) / 10
    if flags & (1 << 6):
        values["average_pace_min_km"] = read(1) / 10
    if flags & (1 << 7):
        energy, per_hour, per_minute = read(2), read(2), read(1)
        values["energy_kcal"] = None if energy == 0xFFFF else energy
        values["energy_per_hour_kcal"] = None if per_hour == 0xFFFF else per_hour
        values["energy_per_minute_kcal"] = None if per_minute == 0xFF else per_minute
    if flags & (1 << 8):
        heart_rate = read(1)
        values["heart_rate_bpm"] = heart_rate if 1 <= heart_rate <= 254 else None
    if flags & (1 << 9):
        values["metabolic_equivalent"] = read(1) / 10
    if flags & (1 << 10):
        values["elapsed_s"] = read(2)
    if flags & (1 << 11):
        values["remaining_s"] = read(2)
    if flags & (1 << 12):
        values["force_n"] = read(2, signed=True)
        values["power_w"] = read(2, signed=True)
    if offset != len(data):
        raise ValueError(f"Télémétrie FTMS : {len(data) - offset} octet(s) inattendu(s)")
    return values


def validate_target(value: float, limits: dict | None, ceiling: float, *, scale: int) -> int:
    if not math.isfinite(value):
        raise ValueError("Valeur numérique invalide")
    if limits is None:
        raise ValueError("Plage de réglage inconnue : commande bloquée")
    if not max(0, limits["min"]) <= value <= min(ceiling, limits["max"]):
        raise ValueError(f"Valeur hors plage POC : {max(0, limits['min'])} à {min(ceiling, limits['max'])}")
    ticks = (value - limits["min"]) / limits["step"]
    if abs(ticks - round(ticks)) > 1e-6:
        raise ValueError(f"Respecter le pas de réglage de {limits['step']}")
    return round(value * scale)


def encode_command(action: str, value: float | None = None) -> bytes:
    if action not in OPCODES:
        raise ValueError("Commande inconnue")
    if action in ("speed", "incline"):
        if value is None or not math.isfinite(value):
            raise ValueError("Valeur requise")
        scale = 100 if action == "speed" else 10
        return bytes([OPCODES[action]]) + struct.pack("<H" if action == "speed" else "<h", round(value * scale))
    if action in ("stop", "pause"):
        return bytes([8, 1 if action == "stop" else 2])
    return bytes([OPCODES[action]])


def parse_response(data: bytes) -> tuple[int, int]:
    if len(data) != 3 or data[0] != 0x80 or data[2] not in RESULTS:
        raise ValueError("Réponse Control Point FTMS invalide")
    return data[1], data[2]
