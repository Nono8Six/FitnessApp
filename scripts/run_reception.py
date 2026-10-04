"""Supervised, bounded live tests through the same API used by the console."""

import argparse
import json
import threading
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from pathlib import Path

BASE = "http://127.0.0.1:4317/api/"
OWNER = "reception-" + uuid.uuid4().hex
OBSERVER = "reception-observation-independante"
RESULT = {"mode": "ble", "actions": [], "checks": [], "physical_confirmation": "pending"}
BLOCKS = [{"duration_s": 10, "speed_kmh": 2, "incline_pct": 0},
          {"duration_s": 10, "speed_kmh": 2.5, "incline_pct": 1},
          {"duration_s": 10, "speed_kmh": 2, "incline_pct": 0}]


def request(path, body=None, *, client=OWNER, expected=200):
    headers = {"X-Poc-Client": client}
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, allow_nan=False).encode()
    began = time.monotonic()
    try:
        with urllib.request.urlopen(urllib.request.Request(BASE + path, data, headers), timeout=12) as response:
            status, payload = response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        status, payload = exc.code, json.load(exc)
    if body is not None:
        RESULT["actions"].append({"utc": datetime.now(timezone.utc).isoformat(), "path": path,
                                  "body": body, "status": status, "response": payload,
                                  "http_ms": round((time.monotonic() - began) * 1000, 1)})
    if status != expected:
        raise RuntimeError(f"{path}: HTTP {status}, attendu {expected}: {payload}")
    return payload


def state():
    return request("state", client=OBSERVER)


def compact(value):
    return {key: value[key] for key in ("phase", "telemetry", "ages", "armed", "desynchronized", "workout", "restart_ready", "restart_delay_s")}


class Heartbeat:
    def __init__(self):
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self.run, daemon=True)
        self.last_success = None
        self.error = None

    def run(self):
        while not self.stop_event.is_set():
            try:
                request("state")
                self.last_success = time.monotonic()
            except Exception as exc:
                self.error = str(exc)
                return
            self.stop_event.wait(.5)

    def stop(self):
        self.stop_event.set()
        self.thread.join(timeout=13)
        if self.thread.is_alive():
            raise RuntimeError("Lecture de présence encore en cours : ne pas conclure le test de perte d'écran")


def wait_for(label, predicate, *, timeout=20, hold=1):
    began, matching_since = time.monotonic(), None
    samples = []
    while time.monotonic() - began < timeout:
        value = state()
        samples.append({"elapsed_s": round(time.monotonic() - began, 2), **compact(value)})
        if value["mode"] != "ble" or value["phase"] != "connected":
            raise RuntimeError("Connexion réelle perdue pendant l'essai")
        if value["desynchronized"] or value["audit_error"]:
            raise RuntimeError(value["audit_error"] or "Résultat Bluetooth incertain : STOP physique nécessaire")
        if value["telemetry"].get("speed_kmh", 999) > 2.5 or value["telemetry"].get("incline_pct", 999) > 1:
            raise RuntimeError("Mesure supérieure aux limites de cet essai")
        fresh = all(value["ages"].get(field, 999) <= 1.5 for field in ("speed_kmh", "incline_pct"))
        if fresh and predicate(value):
            matching_since = matching_since or time.monotonic()
            if time.monotonic() - matching_since >= hold:
                RESULT["checks"].append({"name": label, "success": True,
                                          "elapsed_s": round(time.monotonic() - began, 2), "samples": samples})
                print(label + " : OK", flush=True)
                return value
        else:
            matching_since = None
        if value["workout"]["phase"] == "failed":
            raise RuntimeError("Programme en échec : " + value["workout"].get("reason", "inconnu"))
        time.sleep(.25)
    RESULT["checks"].append({"name": label, "success": False, "samples": samples})
    raise RuntimeError(label + " : cible/état non confirmé avant expiration")


def target(speed, incline=0):
    return lambda value: abs(value["telemetry"].get("speed_kmh", 999) - speed) <= .05 and abs(value["telemetry"].get("incline_pct", 999) - incline) <= .1


def command(action, value=None, **kwargs):
    body = {"action": action}
    if value is not None:
        body["value"] = value
    return request("command", body, **kwargs)


def arm():
    wait_for("Arrêt stabilisé avant activation", lambda value: value["restart_ready"] and target(0)(value), hold=.5)
    request("arm", {"present_at_machine": True})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm-presence", action="store_true", required=True,
                        help="Présence humaine confirmée, bande libre, STOP accessible")
    parser.parse_args()
    heartbeat = Heartbeat()
    initial = state()
    if (initial["mode"] != "ble" or initial["phase"] != "connected" or initial["armed"] or
            initial["command_pending"] or initial["workout"]["phase"] == "running" or
            initial["telemetry"].get("speed_kmh") != 0 or initial["telemetry"].get("incline_pct") != 0):
        raise RuntimeError("Essai non démarré : tapis réel connecté, arrêté, à plat et contrôle libre requis")
    RESULT["initial"] = initial
    try:
        heartbeat.thread.start()
        arm()
        command("start")
        wait_for("Démarrage après reconnexion", target(1))
        command("speed", 2)
        wait_for("Préparation des blocs à 2 km/h", target(2))
        request("workout", {"blocks": BLOCKS})
        wait_for("Trois blocs et arrêt final", lambda value: value["workout"]["phase"] == "completed" and not value["armed"] and target(0)(value), timeout=50, hold=2)
        report = request("report", client=OBSERVER)
        before_early_arm = sum(json.loads(line)["level"] == "command" for line in report["audit"].splitlines() if line)
        request("arm", {"present_at_machine": True}, expected=409)
        report = request("report", client=OBSERVER)
        after_early_arm = sum(json.loads(line)["level"] == "command" for line in report["audit"].splitlines() if line)
        if before_early_arm != after_early_arm:
            raise RuntimeError("Réactivation prématurée : une écriture FTMS a été envoyée")
        RESULT["checks"].append({"name": "Réactivation prématurée bloquée", "success": True, "new_ble_commands": 0})
        print("Réactivation prématurée : bloquée sans écriture FTMS", flush=True)

        arm()
        command("start")
        wait_for("Nouveau démarrage au minimum", target(1))
        command("speed", 2)
        wait_for("Préparation du test STOP", target(2))
        request("workout", {"blocks": BLOCKS})
        deadline = time.monotonic() + 2
        pending = state()
        while not pending["command_pending"] and time.monotonic() < deadline:
            time.sleep(.02)
            pending = state()
        RESULT["stop_during_command"] = pending["command_pending"]
        command("stop", client="reception-autre-ecran-prioritaire")
        wait_for("STOP prioritaire pendant programme", lambda value: value["workout"]["phase"] == "interrupted" and not value["armed"] and target(0)(value), hold=4)

        arm()
        report = request("report", client=OBSERVER)
        before = sum(json.loads(line)["level"] == "command" for line in report["audit"].splitlines() if line)
        for action, value in (("speed", .5), ("speed", 16.1), ("speed", 2.05), ("incline", -1), ("incline", 3.5)):
            command(action, value, expected=409)
        command("speed", True, expected=422)
        request("workout", {"blocks": [{"duration_s":5,"speed_kmh":2,"incline_pct":0},
                                        {"duration_s":5,"speed_kmh":3,"incline_pct":0}]}, expected=409)
        request("arm", {"present_at_machine": True}, client="reception-autre-ecran", expected=409)
        command("speed", 2, client="reception-autre-ecran", expected=409)
        report = request("report", client=OBSERVER)
        after = sum(json.loads(line)["level"] == "command" for line in report["audit"].splitlines() if line)
        if after != before:
            raise RuntimeError("Une requête refusée a tout de même produit une commande FTMS")
        RESULT["checks"].append({"name": "Refus avant toute écriture FTMS", "success": True, "cases": 9, "new_ble_commands": 0})
        print("Requêtes invalides et autre écran : refusées sans écriture FTMS", flush=True)

        command("start")
        wait_for("Préparation du test perte d'écran", target(1))
        if heartbeat.error:
            raise RuntimeError("Présence déjà perdue : " + heartbeat.error)
        heartbeat.stop()
        last_heartbeat = heartbeat.last_success
        wait_for("Arrêt après perte d'écran", lambda value: not value["armed"] and target(0)(value), timeout=20, hold=2)
        RESULT["screen_loss_stop_elapsed_s"] = round(time.monotonic() - last_heartbeat, 2)
        command("start", expected=409)
        RESULT["final"] = state()
        RESULT["success"] = True
        print("RÉCEPTION API TERMINÉE — tapis arrêté et à plat", flush=True)
    except Exception as exc:
        RESULT["success"] = False
        RESULT["error"] = str(exc)
        print("ESSAI INTERROMPU : " + str(exc), flush=True)
        try:
            command("stop")
        except Exception as stop_error:
            RESULT["stop_error"] = str(stop_error)
            print("ARRÊT NON CONFIRMÉ : utiliser le STOP physique", flush=True)
        raise
    finally:
        if heartbeat.thread.ident:
            heartbeat.stop()
        try:
            report = request("report", client=OBSERVER)
            Path("docs/preuves/reception-diagnostic-final.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        except Exception as exc:
            RESULT["export_error"] = str(exc)
        Path("docs/preuves/reception-automatique.json").write_text(json.dumps(RESULT, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
