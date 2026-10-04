import argparse
import logging
import sys
import threading
import time
import webbrowser

import uvicorn

from .app import create_app
from .config import StartupError
from .launcher_control import LauncherControl

PORT = 4330


def open_when_ready(server: uvicorn.Server, url: str) -> None:
    """Le navigateur n'est ouvert qu'après l'écoute effective du serveur."""
    for _ in range(200):
        if server.should_exit:
            return
        if server.started:
            try:
                if webbrowser.open(url):
                    return
            except OSError as exc:
                logging.warning("Ouverture du navigateur impossible : %s", exc)
            break
        time.sleep(0.05)
    logging.warning("Ouvrir l'application dans le navigateur : %s", url)


def main():
    parser = argparse.ArgumentParser(description="Fitness : application locale")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--simulation", action="store_true", help="Données séparées des vraies séances")
    parser.add_argument("--open-browser", action="store_true", help="Ouvrir l'application sur le PC")
    parser.add_argument("--managed", action="store_true", help="Arrêt piloté par le lanceur sur son entrée standard")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("Le port doit être compris entre 1 et 65535.")
    network = args.host not in ("127.0.0.1", "localhost", "::1")
    try:
        app = create_app(simulation=args.simulation, network_enabled=network)
    except StartupError as exc:
        print(f"\nFitness : démarrage impossible.\n{exc}\n", file=sys.stderr, flush=True)
        sys.exit(1)

    print(f"\nFitness · {'SIMULATION' if args.simulation else 'données réelles'}")
    print(f"Données : {app.state.data_dir}")
    print(f"Base : {app.state.database.path.name}, schéma {app.state.database.schema}")
    print(f"PC : http://127.0.0.1:{args.port}")
    if network:
        for address in app.state.phone_addresses:
            print(f"Téléphone sur le même Wi-Fi : http://{address}:{args.port}")
        if not app.state.phone_addresses:
            print("Adresse Wi-Fi du PC non déterminée : vérifier l'adresse IPv4 dans Windows.")
    print("Arrêt : bouton du lanceur." if args.managed else "Arrêt : Ctrl+C ou bouton du lanceur.", flush=True)
    # Un seul processus : il possédera le Bluetooth du tapis (brique 7).
    server = uvicorn.Server(uvicorn.Config(app, host=args.host, port=args.port, workers=1, log_level="warning"))
    app.state.launcher_control = LauncherControl(server, args.port, app.state.instance_id)
    if args.managed:
        threading.Thread(target=stop_when_requested, args=(server,), daemon=True).start()
    if args.open_browser:
        threading.Thread(target=open_when_ready, args=(server, f"http://127.0.0.1:{args.port}"), daemon=True).start()
    server.run()


def stop_when_requested(server: uvicorn.Server) -> None:
    """Canal privé hérité du parent, également fermé si le lanceur disparaît."""
    try:
        for line in sys.stdin:
            if line.strip() == "stop":
                break
            logging.warning("Commande du lanceur non reconnue.")
    except (OSError, UnicodeError) as exc:
        logging.error("Canal du lanceur perdu : %s", exc)
    # EOF signifie aussi que le lanceur a disparu : pas de serveur orphelin.
    server.should_exit = True


if __name__ == "__main__":
    main()
