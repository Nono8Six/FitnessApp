"""L'interface ne reçoit ni jeton, ni URL d'autorisation, ni code OAuth."""
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..coach.protocol import ConnectionIssue

router = APIRouter(prefix="/api/chatgpt")


def is_local(request: Request):
    return bool(request.client and request.client.host in {"127.0.0.1", "::1"}
                and request.url.hostname in {"127.0.0.1", "localhost", "::1"})


def state(request):
    return request.app.state.chatgpt.snapshot(local=is_local(request))


def perform(request, operation, *, local=False):
    if local and not is_local(request):
        raise HTTPException(403, "Effectuez cette action depuis le PC, à l’adresse locale de FitnessApp.")
    try:
        operation()
    except ConnectionIssue as exc:
        raise HTTPException(409 if exc.code == "busy" else 400, str(exc)) from None
    return state(request)


class Login(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    account_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    consent: bool = False


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: str = Field(min_length=1, max_length=200)


@router.get("")
def status(request: Request):
    return state(request)


@router.post("/connect")
def connect(payload: Login, request: Request):
    return perform(request, lambda: request.app.state.chatgpt.begin(payload.account_id, consent=payload.consent), local=True)


@router.post("/cancel")
def cancel(request: Request):
    return perform(request, request.app.state.chatgpt.cancel, local=True)


@router.post("/disconnect")
def disconnect(request: Request):
    return perform(request, request.app.state.chatgpt.disconnect, local=True)


@router.post("/refresh")
def refresh(request: Request):
    return perform(request, lambda: request.app.state.chatgpt.maintain(force=True))


@router.post("/account")
def account(payload: Selection, request: Request):
    return perform(request, lambda: request.app.state.chatgpt.select_account(payload.id), local=True)


@router.post("/model")
def model(payload: Selection, request: Request):
    return perform(request, lambda: request.app.state.chatgpt.select_model(payload.id))


@router.post("/welcome")
def welcome(request: Request):
    return perform(request, request.app.state.chatgpt.acknowledge)
