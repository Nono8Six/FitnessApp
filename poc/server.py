import argparse
import ipaddress
import json
import logging
import socket
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from urllib.parse import urlparse

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field
from starlette.middleware.trustedhost import TrustedHostMiddleware

from .controller import Controller, ControllerError

ROOT = Path(__file__).resolve().parent.parent


def local_addresses():
    return sorted({row[4][0] for row in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET)
                   if not ipaddress.ip_address(row[4][0]).is_loopback})


def phone_addresses():
    """Display physical LAN interfaces, excluding Hyper-V/WSL/VPN adapters."""
    if sys.platform != "win32":
        return local_addresses(), None
    command = (
        "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new(); "
        "@(Get-NetIPConfiguration -ErrorAction Stop | Where-Object { "
        "$_.NetAdapter.HardwareInterface -and $_.IPv4DefaultGateway -and "
        "$_.NetAdapter.Status -eq 'Up' } | ForEach-Object { "
        "$_.IPv4Address.IPAddress }) | ConvertTo-Json -Compress"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", command],
            capture_output=True, text=True, encoding="utf-8", timeout=10, check=True,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
        addresses = json.loads(result.stdout.strip() or "[]")
        if isinstance(addresses, str):
            addresses = [addresses]
        addresses = sorted({str(ipaddress.IPv4Address(address)) for address in addresses})
        return addresses, None if addresses else "Aucune interface physique avec passerelle détectée. Vérifier le Wi-Fi du PC."
    except (OSError, subprocess.SubprocessError, ValueError, TypeError) as exc:
        logging.getLogger(__name__).warning("Lecture des interfaces réseau impossible : %s", exc)
        return [], "Adresse réseau non déterminée. Vérifier l'adresse IPv4 de la connexion Wi-Fi dans Windows."


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class ConnectRequest(StrictModel):
    address: str = Field(min_length=1, max_length=80)


class ArmRequest(StrictModel):
    present_at_machine: bool = Field(strict=True)


class CommandRequest(StrictModel):
    action: str = Field(pattern="^(speed|incline|start|pause|stop)$")
    value: float | None = Field(default=None, strict=True)


class Block(StrictModel):
    duration_s: int = Field(strict=True, ge=5, le=60)
    speed_kmh: float = Field(strict=True, ge=0.5, le=4)
    incline_pct: float = Field(strict=True, ge=0, le=3)


class WorkoutRequest(StrictModel):
    blocks: list[Block] = Field(min_length=1, max_length=3)


def create_app(*, simulation=False, data_dir=None, network_enabled=False):
    controller = Controller(data_dir or ROOT / "data", simulation=simulation)
    addresses, network_note = phone_addresses() if network_enabled else ([], "Accès téléphone désactivé. Relancer avec .\\start-poc.ps1 -Reseau.")

    @asynccontextmanager
    async def lifespan(_app):
        await controller.start()
        yield
        await controller.close()

    app = FastAPI(title="RUN500 · Console de connexion", lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)
    app.state.controller = controller
    app.state.phone_addresses = addresses
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=["localhost", "127.0.0.1", "[::1]", *local_addresses()])

    @app.middleware("http")
    async def protect(request: Request, call_next):
        if request.url.path.startswith("/api/"):
            origin = request.headers.get("origin")
            if origin and urlparse(origin).netloc != request.headers.get("host"):
                return JSONResponse({"detail": "Origine non autorisée"}, status_code=403)
            if request.method == "POST":
                try:
                    size = int(request.headers.get("content-length", "0"))
                except ValueError:
                    size = 20000
                if size > 16000 or request.headers.get("transfer-encoding"):
                    return JSONResponse({"detail": "Requête trop volumineuse"}, status_code=413)
                if not request.headers.get("content-type", "").startswith("application/json"):
                    return JSONResponse({"detail": "JSON requis"}, status_code=415)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Content-Security-Policy"] = "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        return response

    @app.exception_handler(ControllerError)
    async def controller_error(_request, exc):
        return JSONResponse({"detail": str(exc)}, status_code=409)

    def viewer(request: Request):
        value = request.headers.get("x-poc-client", "")
        if not 16 <= len(value) <= 80 or not all(character.isalnum() or character in "-_" for character in value):
            raise HTTPException(400, "Identifiant d'écran invalide")
        return value

    @app.get("/")
    async def index():
        return FileResponse(ROOT / "poc" / "static" / "index.html")

    @app.get("/api/bootstrap")
    async def bootstrap():
        return {"addresses": addresses, "network_note": network_note,
                "network_enabled": network_enabled, "mode": "simulation" if simulation else "ble"}

    @app.get("/api/state")
    async def state(request: Request):
        return controller.snapshot(viewer(request))

    @app.post("/api/scan")
    async def scan():
        return {"devices": await controller.scan()}

    @app.post("/api/connect")
    async def connect(body: ConnectRequest):
        await controller.connect(body.address)
        return {"ok": True}

    @app.post("/api/disconnect")
    async def disconnect():
        await controller.disconnect()
        return {"ok": True}

    @app.post("/api/arm")
    async def arm(body: ArmRequest, request: Request):
        if not body.present_at_machine:
            raise HTTPException(400, "Confirmer la présence auprès du tapis")
        await controller.arm(viewer(request))
        return {"ok": True}

    @app.post("/api/command")
    async def command(body: CommandRequest, request: Request):
        await controller.command(viewer(request), body.action, body.value)
        return {"ok": True, "message": "Traitement terminé : consulter le journal et la télémétrie"}

    @app.post("/api/workout")
    async def workout(body: WorkoutRequest, request: Request):
        await controller.run_workout(viewer(request), [block.model_dump() for block in body.blocks])
        return {"ok": True}

    @app.get("/api/report")
    async def report():
        try:
            audit = controller.audit_path.read_text(encoding="utf-8")
        except OSError as exc:
            controller.log("error", "Lecture du journal impossible", detail=str(exc))
            raise ControllerError("Le journal ne peut pas être lu. Vérifier l'accès au dossier data.") from exc
        return {"hardware_verified": False, "note": "Un rapport logiciel ne remplace pas la réception physique du RUN500.",
                "state": controller.snapshot(), "audit": audit}

    app.mount("/static", StaticFiles(directory=ROOT / "poc" / "static"), name="static")
    return app


def main():
    parser = argparse.ArgumentParser(description="RUN500 : POC Bluetooth local")
    parser.add_argument("--simulate", action="store_true", help="Aucun accès au matériel Bluetooth")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4317)
    args = parser.parse_args()
    application = create_app(simulation=args.simulate, network_enabled=args.host not in ("127.0.0.1", "localhost", "::1"))
    print(f"\nRUN500 — {'SIMULATION, aucun matériel testé' if args.simulate else 'Bluetooth réel, connexion en lecture seule'}")
    print(f"PC : http://127.0.0.1:{args.port}")
    if args.host == "0.0.0.0":
        for address in application.state.phone_addresses:
            print(f"Téléphone sur le même réseau : http://{address}:{args.port}")
    print("Accès direct à la console sur le réseau local, sans clé.")
    print("Un seul processus ; ne pas utiliser --reload ou plusieurs workers.\n", flush=True)
    uvicorn.run(application, host=args.host, port=args.port, workers=1)


if __name__ == "__main__":
    main()
