"""Connexion passive uniquement : aucune route de commande FTMS."""

import asyncio
from urllib.parse import urlparse

import anyio
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, ConfigDict, Field

from ..device.controller import ControllerError

router = APIRouter(prefix="/api/device")


class EmptyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ConnectRequest(EmptyRequest):
    address: str = Field(strict=True, min_length=1, max_length=80)


async def operate(request: Request, operation: str, address: str | None = None):
    try:
        return await request.app.state.device.perform(operation, address)
    except ControllerError as exc:
        raise HTTPException(409, str(exc)[:200]) from exc


@router.get("/state")
async def state(request: Request):
    return request.app.state.device.event("snapshot")


@router.post("/scan")
async def scan(body: EmptyRequest, request: Request):
    return await operate(request, "scan")


@router.post("/connect")
async def connect(body: ConnectRequest, request: Request):
    return await operate(request, "connect", body.address)


@router.post("/disconnect")
async def disconnect(body: EmptyRequest, request: Request):
    return await operate(request, "disconnect")


@router.websocket("/events")
async def events(socket: WebSocket):
    # Le middleware HTTP ne protège pas les WebSockets.
    origin = socket.headers.get("origin")
    if not origin or urlparse(origin).netloc != socket.headers.get("host") or urlparse(origin).scheme not in ("http", "https"):
        await socket.close(code=1008)
        return
    runtime = socket.app.state.device
    await socket.accept()
    queue = runtime.subscribe()

    async def send():
        while True:
            await socket.send_json(await queue.get())

    async def receive():
        while True:
            # Canal d'observation, aucun message de commande accepté.
            message = await socket.receive()
            if message["type"] == "websocket.disconnect":
                return
            await socket.close(code=1008, reason="Canal de lecture seule")
            return

    tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            try:
                task.result()
            except WebSocketDisconnect:
                pass
    except asyncio.CancelledError:
        # Fermeture de l'écran ou arrêt ASGI : aucun effet sur la connexion tapis.
        pass
    finally:
        runtime.subscribers.discard(queue)
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)
