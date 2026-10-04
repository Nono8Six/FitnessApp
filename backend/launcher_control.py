"""Arrêt local authentifié, y compris pour un serveur lancé en console."""
import hmac
import json
import logging
import os
import secrets

from fastapi import Request
from fastapi.responses import JSONResponse
from uvicorn import Server

from .config import REPOSITORY, StartupError, data_root


class LauncherControl:
    def __init__(self, server: Server, port: int, instance_id: str):
        self.server = server
        self.instance_id = instance_id
        self.token = secrets.token_hex(32)
        self.path = data_root() / "launcher" / "servers" / f"{os.getpid()}.json"
        self.payload = {
            "pid": os.getpid(), "port": port, "instance_id": instance_id,
            "project_root": str(REPOSITORY), "token": self.token,
        }

    def publish(self) -> None:
        # Le secret reste dans les données du compte Windows, jamais dans l'API de santé.
        temporary = self.path.with_suffix(f".{secrets.token_hex(8)}.tmp")
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with temporary.open("x", encoding="utf-8") as stream:
                os.chmod(temporary, 0o600)
                json.dump(self.payload, stream)
            temporary.replace(self.path)
        except OSError as exc:
            temporary.unlink(missing_ok=True)
            raise StartupError(f"Publication du canal d'arrêt local impossible : {exc}") from exc

    def close(self) -> None:
        try:
            self.path.unlink(missing_ok=True)
        except OSError as exc:
            logging.error("Nettoyage du canal d'arrêt local impossible : %s", exc)

    async def stop(self, request: Request) -> JSONResponse:
        authorization = request.headers.get("authorization", "").encode("utf-8")
        expected = f"Bearer {self.token}".encode("ascii")
        if (not request.client or request.client.host not in {"127.0.0.1", "::1"}
                or request.headers.get("origin")
                or not hmac.compare_digest(authorization, expected)):
            return JSONResponse({"detail": "Arrêt local non autorisé"}, status_code=403)
        try:
            payload = await request.json()
        except ValueError:
            return JSONResponse({"detail": "Commande d'arrêt invalide"}, status_code=400)
        if not isinstance(payload, dict) or payload.get("instance_id") != self.instance_id:
            return JSONResponse({"detail": "Le serveur a changé ; actualiser son état"}, status_code=409)
        self.server.should_exit = True
        return JSONResponse({"instance_id": self.instance_id}, status_code=202)
