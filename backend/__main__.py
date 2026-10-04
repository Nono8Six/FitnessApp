import argparse

import uvicorn

from .app import create_app

PORT = 4330


def main():
    parser = argparse.ArgumentParser(description="Fitness : application locale")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=PORT)
    parser.add_argument("--simulation", action="store_true", help="Données séparées des vraies séances")
    args = parser.parse_args()
    network = args.host not in ("127.0.0.1", "localhost", "::1")
    app = create_app(simulation=args.simulation, network_enabled=network)

    print(f"\nFitness · {'SIMULATION' if args.simulation else 'données réelles'}")
    print(f"Données : {app.state.data_dir}")
    print(f"PC : http://127.0.0.1:{args.port}")
    if network:
        for address in app.state.phone_addresses:
            print(f"Téléphone sur le même Wi-Fi : http://{address}:{args.port}")
        if not app.state.phone_addresses:
            print("Adresse Wi-Fi du PC non déterminée : vérifier l'adresse IPv4 dans Windows.")
    print("Arrêt : Ctrl+C.\n", flush=True)
    # Un seul processus : il possédera le Bluetooth du tapis (brique 7).
    uvicorn.run(app, host=args.host, port=args.port, workers=1, log_level="warning")


if __name__ == "__main__":
    main()
