"""Le profil de la route utilisateur est figé pour le flux et tous ses outils."""
import logging
import asyncio
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select

from ..coach import store
from ..coach.inference import ERRORS
from ..storage.models import CoachMemory, CoachTurn
from ..training.profiles import ProfileNotFound

router = APIRouter(prefix="/api/profiles/{profile_id}/coach")
logger = logging.getLogger(__name__)


@contextmanager
def transaction(request, write=False):
    try:
        database = request.app.state.database
        with (database.write() if write else database.transaction()) as session:
            yield session
    except (ProfileNotFound, store.CoachNotFound):
        raise HTTPException(404, "Donnée introuvable dans ce profil") from None
    except store.CoachConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        logger.error("Coach : accès à la base impossible (%s)", request.method)
        raise HTTPException(503, "Base locale indisponible. Réessayez dans quelques instants.") from None


@router.get("/conversations")
def conversations(profile_id: str, request: Request, query: str = Query("", max_length=100), offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=50)):
    with transaction(request) as session:
        return store.conversations(session, profile_id, query, offset, limit)


@router.post("/conversations", status_code=201)
def create(profile_id: str, request: Request):
    with transaction(request, True) as session:
        return store.create_conversation(session, profile_id)


@router.get("/conversations/{conversation_id}")
def read(profile_id: str, conversation_id: str, request: Request, offset: int = Query(0, ge=0), limit: int = Query(20, ge=1, le=50)):
    with transaction(request) as session:
        data = store.turns(session, profile_id, conversation_id, offset, limit)
        accepted = {(m.source_turn_id, m.proposal_index): m.id for m in session.scalars(select(CoachMemory).where(
            CoachMemory.profile_id == profile_id, CoachMemory.source_turn_id.in_([t["id"] for t in data["items"]])))}
        for turn in data["items"]:
            turn["error_message"] = ERRORS.get(turn["error"])
            turn["proposals"] = [{**proposal, "saved_memory_id": accepted.get((turn["id"], index))}
                                 for index, proposal in enumerate(turn["proposals"])]
        return data


@router.post("/conversations/{conversation_id}/messages")
async def send(profile_id: str, conversation_id: str, payload: store.Send, request: Request):
    runtime = request.app.state.coach
    try:
        turn, fresh = await runtime.start(profile_id, conversation_id, payload)
    except (ProfileNotFound, store.CoachNotFound):
        raise HTTPException(404, "Conversation introuvable dans ce profil") from None
    except store.CoachConflict as exc:
        raise HTTPException(409, str(exc)) from None
    except SQLAlchemyError:
        logger.error("Coach : enregistrement du message impossible")
        raise HTTPException(503, "Enregistrement impossible. Votre saisie est conservée.") from None
    return StreamingResponse(runtime.stream(profile_id, turn, fresh), media_type="text/event-stream",
                             headers={"X-Accel-Buffering": "no", "Cache-Control": "no-store"})


@router.post("/messages/{turn_id}/stop")
async def stop(profile_id: str, turn_id: str, request: Request):
    def verify():
        with transaction(request) as session:
            return store.out(store.owned(session, CoachTurn, profile_id, turn_id))
    turn = await asyncio.to_thread(verify)
    runtime = request.app.state.coach
    await runtime.stop(turn_id)
    if turn["status"] == "running" and turn_id not in runtime.tasks:
        # Une panne de stockage a pu empêcher l'état final ; une interruption explicite peut le réparer.
        def finish():
            with transaction(request, True) as session:
                row = store.owned(session, CoachTurn, profile_id, turn_id)
                if row.status == "running":
                    store.save_turn(session, profile_id, turn_id, status="interrupted", error="interrupted")
        await asyncio.to_thread(finish)
    return {"stopped": True}


@router.get("/memories")
def memories(profile_id: str, request: Request, offset: int = Query(0, ge=0)):
    with transaction(request) as session:
        return store.memories(session, profile_id, offset=offset)


@router.post("/memories", status_code=201)
def remember(profile_id: str, payload: store.MemoryInput, request: Request):
    with transaction(request, True) as session:
        return store.save_memory(session, profile_id, payload)


@router.patch("/memories/{memory_id}")
def edit_memory(profile_id: str, memory_id: str, payload: store.MemoryInput, request: Request):
    with transaction(request, True) as session:
        return store.save_memory(session, profile_id, payload, memory_id)


@router.delete("/memories/{memory_id}")
def forget(profile_id: str, memory_id: str, request: Request):
    with transaction(request, True) as session:
        session.delete(store.owned(session, CoachMemory, profile_id, memory_id))
    return {"deleted": True}
