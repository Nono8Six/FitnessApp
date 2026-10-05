"""Actions de séance validées ; le WebSocket d'observation n'arme jamais."""

import asyncio
import logging
from urllib.parse import urlparse

import anyio
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError

from .device import EmptyRequest
from ..device.controller import ControllerError
from ..training.profiles import ProfileNotFound
from ..training.workouts import WorkoutNotFound

router = APIRouter(prefix="/api/execution")
CLIENT_PATTERN = r"^[a-f0-9-]{32,36}$"
LOGGER = logging.getLogger(__name__)


class ClientRequest(EmptyRequest):
    client_id: str = Field(strict=True, pattern=CLIENT_PATTERN)
    session_id: str | None = Field(default=None, strict=True, pattern=r"^[a-f0-9]{32}$")


class Preparation(EmptyRequest):
    profile_id: str = Field(strict=True, min_length=1, max_length=40)
    workout_id: str = Field(strict=True, pattern=r"^[a-f0-9]{32}$")
    version: int = Field(strict=True, ge=1)


class StartRequest(Preparation):
    client_id: str = Field(strict=True, pattern=CLIENT_PATTERN)
    safety_key: bool = Field(strict=True)
    belt_clear: bool = Field(strict=True)


class ResumeRequest(ClientRequest):
    safety_key: bool = Field(strict=True)
    belt_clear: bool = Field(strict=True)


class AdjustRequest(ClientRequest):
    speed_offset: float = Field(strict=True, allow_inf_nan=False, ge=-16, le=16)
    incline_offset: float = Field(strict=True, allow_inf_nan=False, ge=-10, le=10)


def confirmed(body):
    if not body.safety_key or not body.belt_clear:
        raise ControllerError("Confirmez la clé de sécurité et la bande libre avant tout démarrage.")


def current(engine, body):
    if body.session_id != engine.id or not body.session_id:
        raise ControllerError("Cette demande concerne une ancienne séance. Retrouvez l'état actuel dans Direct.")


def event(request, viewer="", *, full=False, after=0):
    device = request.app.state.device
    engine = request.app.state.execution
    return {"type": "snapshot" if full else "state", "instance_id": device.instance_id,
            "sequence": device.sequence, "session": engine.snapshot(viewer), "device": device.snapshot(),
            "samples": [s for s in engine.samples if full or s["seq"] > after], "markers": list(engine.markers)}


def conflict(exc):
    if isinstance(exc, (WorkoutNotFound, ProfileNotFound)):
        return HTTPException(404, "Cette séance ou ce profil n'existe plus.")
    return HTTPException(409, str(exc)[:200])


@router.get("/state")
async def state(request: Request):
    return event(request, full=True)


@router.post("/prepare")
async def prepare(body: Preparation, request: Request):
    try:
        return request.app.state.execution.prepare(body.profile_id, body.workout_id, body.version)
    except (ControllerError, WorkoutNotFound, ProfileNotFound) as exc:
        raise conflict(exc) from exc
    except SQLAlchemyError:
        LOGGER.exception("Préparation de séance : base indisponible")
        raise HTTPException(503, "Base de données indisponible. Réessayez dans quelques instants.") from None


@router.post("/start")
async def start(body: StartRequest, request: Request):
    try:
        confirmed(body)
        engine = request.app.state.execution
        await engine.start(body.client_id, body.profile_id, body.workout_id, body.version)
        request.app.state.device.publish()
        return event(request, body.client_id)
    except (ControllerError, WorkoutNotFound, ProfileNotFound) as exc:
        raise conflict(exc) from exc
    except SQLAlchemyError:
        LOGGER.exception("Démarrage de séance : base indisponible")
        raise HTTPException(503, "Base de données indisponible. Réessayez dans quelques instants.") from None


@router.post("/resume")
async def resume(body: ResumeRequest, request: Request):
    try:
        confirmed(body)
        engine = request.app.state.execution
        current(engine, body)
        await engine.resume(body.client_id)
        request.app.state.device.publish()
        return event(request, body.client_id)
    except ControllerError as exc:
        raise conflict(exc) from exc


@router.post("/adjust")
async def adjust(body: AdjustRequest, request: Request):
    try:
        engine = request.app.state.execution
        current(engine, body)
        engine.adjust(body.client_id, body.speed_offset, body.incline_offset)
        request.app.state.device.publish()
        return event(request, body.client_id)
    except ControllerError as exc:
        raise conflict(exc) from exc


async def act(body, request, action):
    engine = request.app.state.execution
    try:
        current(engine, body)
        if action == "release" and body.client_id != engine.owner:
            raise ControllerError("Cet écran observe la séance ; il ne possède pas son démarrage.")
        if action == "recover":
            await engine.recover()
        else:
            engine.request_halt("Écran propriétaire fermé · arrêt demandé" if action == "release" else
                                "Pause demandée" if action == "pause" else "Arrêt demandé", pause=action == "pause")
        request.app.state.device.publish()
        return event(request, body.client_id)
    except ControllerError as exc:
        raise conflict(exc) from exc


@router.post("/pause")
async def pause(body: ClientRequest, request: Request):
    return await act(body, request, "pause")


@router.post("/stop")
async def stop(body: ClientRequest, request: Request):
    return await act(body, request, "stop")


@router.post("/release")
async def release(body: ClientRequest, request: Request):
    return await act(body, request, "release")


@router.post("/recover")
async def recover(body: ClientRequest, request: Request):
    return await act(body, request, "recover")


@router.websocket("/events")
async def events(socket: WebSocket):
    import re
    origin = socket.headers.get("origin")
    viewer = socket.query_params.get("client_id", "")
    if not origin or urlparse(origin).netloc != socket.headers.get("host") or urlparse(origin).scheme not in ("http", "https") or not re.fullmatch(CLIENT_PATTERN, viewer):
        await socket.close(code=1008)
        return
    runtime = socket.app.state.device
    engine = socket.app.state.execution
    await socket.accept()
    queue = runtime.subscribe()

    async def send():
        first = True
        after = 0
        session_id = None
        while True:
            await queue.get()
            payload = event(socket, viewer, full=first or session_id != engine.id, after=after)
            await socket.send_json(payload)
            after = engine.sample_seq
            session_id = engine.id
            first = False

    async def receive():
        while True:
            try:
                message = await socket.receive_json()
            except (ValueError, TypeError):
                await socket.close(code=1008)
                return
            if message != {"type": "heartbeat"}:
                await socket.close(code=1008)
                return
            engine.heartbeat(viewer)

    tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
    try:
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            try:
                task.result()
            except WebSocketDisconnect:
                pass
    except asyncio.CancelledError:
        pass
    finally:
        runtime.subscribers.discard(queue)
        for task in tasks:
            task.cancel()
        with anyio.CancelScope(shield=True):
            await asyncio.gather(*tasks, return_exceptions=True)
