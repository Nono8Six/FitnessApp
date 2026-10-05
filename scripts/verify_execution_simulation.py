"""Observer un vrai essai de 30 minutes, sans accélération ni commande moteur.

Lancer avant Commencer dans Chrome, sur le serveur de vérification en simulation.
Les deux pauses/reprises sont effectuées dans l'interface. Le rapport est fourni
sur stdout, pas dans l'historique de l'application.
"""

import argparse
import asyncio
import json
import time
from urllib.request import urlopen
from urllib.parse import urlparse
from uuid import uuid4

from websockets.asyncio.client import connect


async def observe(url):
    with urlopen(url + "/api/health", timeout=5) as response:
        health = json.load(response)
    if health["mode"] != "simulation":
        raise RuntimeError("Ce contrôle est réservé au simulateur, jamais au RUN500 réel.")
    address = "ws" + url[4:] + "/api/execution/events?client_id=" + uuid4().hex
    began = None
    session_id = None
    paused_at = None
    pause_checks = 0
    last_report = 0
    frames = samples = 0
    async with connect(address, origin=url, max_size=8_000_000) as socket:
        print("Observation prête. Démarrer une nouvelle séance de 30 minutes dans Chrome.", flush=True)
        async with asyncio.timeout(4500):
            async for message in socket:
                event = json.loads(message)
                s = event["session"]
                if began is None:
                    if s["phase"] not in ("countdown", "starting"):
                        continue
                    if s["workout"]["summary"]["sec"] != 1800:
                        raise RuntimeError("Le programme doit durer exactement 30 minutes.")
                    began = time.monotonic()
                    session_id = s["id"]
                if s["id"] != session_id:
                    raise RuntimeError("L'essai a été remplacé par une autre séance.")
                if s["owned_by_me"]:
                    raise RuntimeError("L'observateur ne doit jamais être propriétaire.")
                frames += 1
                samples += len(event["samples"])
                if s["phase"] == "paused":
                    if paused_at is None:
                        paused_at = s["active_s"]
                        pause_checks += 1
                    elif s["active_s"] != paused_at:
                        raise RuntimeError("La durée active a avancé pendant la pause.")
                else:
                    paused_at = None
                if time.monotonic() - last_report >= 60:
                    print(json.dumps({"phase": s["phase"], "active_s": s["active_s"], "pause_s": s["pause_s"],
                                      "block": s["block_index"] + 1, "frames": frames}, ensure_ascii=False), flush=True)
                    last_report = time.monotonic()
                if s["phase"] in ("unknown", "cancelled", "stopped"):
                    raise RuntimeError(f"Essai non terminé : {s['phase']}, {s['reason']}, {s['error']}")
                if s["phase"] == "completed":
                    elapsed = time.monotonic() - began
                    if elapsed < 1800 or s["active_s"] != 1800 or pause_checks != 2 or not s["stop_confirmed"]:
                        raise RuntimeError(f"Critère incomplet : {elapsed=}, {pause_checks=}, {s=}")
                    report = {"result": "PASS", "session_id": session_id, "active_s": s["active_s"], "pause_s": s["pause_s"],
                              "wall_observed_s": round(elapsed, 2), "pause_checks": pause_checks,
                              "frames": frames, "samples_received": samples, "stop_confirmed": s["stop_confirmed"],
                              "server_instance": health["instance_id"], "data_dir": health["data_dir"], "hardware_tested": False}
                    print(json.dumps(report, ensure_ascii=False), flush=True)
                    return
        raise RuntimeError("Observation interrompue avant la fin confirmée de l’essai.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:4331")
    args = parser.parse_args()
    parsed = urlparse(args.url)
    if parsed.scheme != "http" or parsed.hostname not in ("127.0.0.1", "localhost") or parsed.path not in ("", "/"):
        parser.error("Utiliser le serveur local de vérification.")
    asyncio.run(observe(args.url.rstrip("/")))
