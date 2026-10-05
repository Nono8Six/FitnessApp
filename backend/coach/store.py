"""Persistance locale du coach. Chaque lecture impose le profil choisi par l'utilisateur."""
from uuid import uuid4

from pydantic import Field, field_validator
from sqlalchemy import func, or_, select, update
from sqlalchemy.orm import object_session

from ..storage.models import CoachMemory, CoachTurn, Conversation
from ..training.profiles import get_profile, utc_now
from ..training.workouts import Input, Target


class CoachNotFound(Exception):
    pass


class CoachConflict(Exception):
    pass


class Send(Input):
    request_id: str = Field(pattern=r"^[a-f0-9-]{32,36}$")
    text: str = Field(min_length=1, max_length=4000)
    workout_target: Target | None = None

    @field_validator("text")
    @classmethod
    def clean(cls, value):
        if not value.strip() or any(ord(c) < 32 and c not in "\n\r\t" for c in value):
            raise ValueError("Écrivez un message sans caractère de contrôle")
        return value.strip()


class ArchiveInput(Input):
    archived: bool


class MemoryInput(Input):
    content: str = Field(min_length=1, max_length=500)
    source_turn_id: str | None = Field(default=None, pattern=r"^[a-f0-9]{32}$")
    proposal_index: int | None = Field(default=None, ge=0, le=9)

    @field_validator("content")
    @classmethod
    def clean(cls, value):
        return Send.clean(value)


def out(row):
    result = {column.name: getattr(row, column.name) for column in row.__table__.columns if column.name != "profile_id"}
    if isinstance(row, CoachTurn):
        from .workout_proposals import for_turn
        result['workout_proposals'] = for_turn(object_session(row), row.profile_id, row.id)
    return result


def owned(session, cls, profile, identifier):
    row = session.get(cls, identifier)
    if row is None or row.profile_id != profile:
        raise CoachNotFound()
    return row


def page(session, query, offset=0, limit=20):
    total = session.scalar(select(func.count()).select_from(query.order_by(None).subquery()))
    items = [out(row) for row in session.scalars(query.offset(offset).limit(limit))]
    next_offset = offset + len(items) if offset + len(items) < total else None
    return {"items": items, "total": total, "next_offset": next_offset, "partial": next_offset is not None}


def conversations(session, profile, query="", offset=0, limit=20, archived=None):
    """archived : None pour toutes (outils du coach), sinon actives ou archivées seulement."""
    get_profile(session, profile)
    statement = select(Conversation).where(Conversation.profile_id == profile)
    if archived is not None:
        statement = statement.where(Conversation.archived_at.is_not(None) if archived else Conversation.archived_at.is_(None))
    if query:
        matches = select(CoachTurn.conversation_id).where(CoachTurn.profile_id == profile,
            or_(CoachTurn.user_text.contains(query, autoescape=True), CoachTurn.answer.contains(query, autoescape=True)))
        statement = statement.where(or_(Conversation.title.contains(query, autoescape=True), Conversation.id.in_(matches)))
    return page(session, statement.order_by(Conversation.updated_at.desc(), Conversation.id), offset, limit)


def create_conversation(session, profile):
    get_profile(session, profile)
    now = utc_now()
    row = Conversation(id=uuid4().hex, profile_id=profile, title="Nouvelle conversation", created_at=now, updated_at=now)
    session.add(row)
    session.flush()
    return out(row)


def archive_conversation(session, profile, conversation, archived):
    row = owned(session, Conversation, profile, conversation)
    if archived and session.scalar(select(CoachTurn.id).where(CoachTurn.profile_id == profile,
            CoachTurn.conversation_id == conversation, CoachTurn.status == "running")):
        raise CoachConflict("Une réponse est en cours dans cette conversation. Interrompez-la avant d’archiver.")
    if archived != (row.archived_at is not None):
        row.archived_at = utc_now() if archived else None
    session.flush()
    return out(row)


def turns(session, profile, conversation, offset=0, limit=20):
    owned(session, Conversation, profile, conversation)
    result = page(session, select(CoachTurn).where(CoachTurn.profile_id == profile,
        CoachTurn.conversation_id == conversation).order_by(CoachTurn.created_at.desc(), CoachTurn.id.desc()), offset, limit)
    result["items"].reverse()
    return result


def reserve(session, profile, conversation, payload):
    row = owned(session, Conversation, profile, conversation)
    previous = session.scalar(select(CoachTurn).where(CoachTurn.profile_id == profile, CoachTurn.request_id == payload.request_id))
    if previous:
        context = previous.workout_context
        target = payload.workout_target
        matches = (context is None and target is None) or (context is not None and target is not None
            and context['id'] == target.workout_id and context['version'] == target.version)
        if previous.conversation_id != conversation or previous.user_text != payload.text or not matches:
            raise CoachConflict("Cet envoi existe déjà avec un autre contenu.")
        return out(previous), False
    if session.scalar(select(CoachTurn.id).where(CoachTurn.profile_id == profile, CoachTurn.status == "running")):
        raise CoachConflict("Une réponse est déjà en cours pour ce profil. Interrompez-la avant d’envoyer.")
    now = utc_now()
    from .workout_proposals import snapshot
    context = snapshot(session, profile, payload.workout_target) if payload.workout_target else None
    turn = CoachTurn(id=uuid4().hex, profile_id=profile, conversation_id=conversation, request_id=payload.request_id,
        user_text=payload.text, answer="", status="running", error=None, model=None, sources=[], proposals=[], questions=[], usage={"requests": 0, "reports": []},
        created_at=now, updated_at=now, workout_context=context)
    if not session.scalar(select(CoachTurn.id).where(CoachTurn.conversation_id == conversation).limit(1)):
        row.title = " ".join(payload.text.split())[:100]
    # Écrire dans une conversation archivée la remet dans la liste.
    row.updated_at, row.archived_at = now, None
    session.add(turn)
    session.flush()
    return out(turn), True


def save_turn(session, profile, identifier, **values):
    row = owned(session, CoachTurn, profile, identifier)
    for key, value in values.items():
        setattr(row, key, value)
    row.updated_at = utc_now()
    owned(session, Conversation, profile, row.conversation_id).updated_at = row.updated_at
    session.flush()
    return out(row)


def recover(session):
    session.execute(update(CoachTurn).where(CoachTurn.status == "running").values(
        status="interrupted", error="restart", updated_at=utc_now()))


def memories(session, profile, query="", offset=0, limit=20):
    get_profile(session, profile)
    statement = select(CoachMemory).where(CoachMemory.profile_id == profile)
    if query:
        statement = statement.where(CoachMemory.content.contains(query, autoescape=True))
    return page(session, statement.order_by(CoachMemory.updated_at.desc(), CoachMemory.id), offset, limit)


def save_memory(session, profile, payload, identifier=None):
    get_profile(session, profile)
    if identifier:
        row = owned(session, CoachMemory, profile, identifier)
        row.content, row.updated_at = payload.content, utc_now()
    else:
        if payload.source_turn_id:
            turn = owned(session, CoachTurn, profile, payload.source_turn_id)
            index = payload.proposal_index
            if index is None or index >= len(turn.proposals):
                raise CoachConflict("Cette proposition de mémoire n’existe plus.")
            previous = session.scalar(select(CoachMemory).where(CoachMemory.profile_id == profile,
                CoachMemory.source_turn_id == turn.id, CoachMemory.proposal_index == index))
            if previous:
                return out(previous)
        elif payload.proposal_index is not None:
            raise CoachConflict("La conversation source est requise.")
        now = utc_now()
        row = CoachMemory(id=uuid4().hex, profile_id=profile, content=payload.content,
            source_turn_id=payload.source_turn_id, proposal_index=payload.proposal_index, created_at=now, updated_at=now)
        session.add(row)
    session.flush()
    return out(row)
