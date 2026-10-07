"""Modèles SQLAlchemy. Toute évolution passe par une migration dans versions/."""

from sqlalchemy import CheckConstraint, Float, ForeignKey, ForeignKeyConstraint, Index, JSON, MetaData, String, Text, UniqueConstraint, text
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Noms de contraintes stables : les migrations SQLite par recopie de table (batch) en dépendent.
NAMING = {
    "ix": "ix_%(column_0_label)s",
    "uq": "uq_%(table_name)s_%(column_0_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING)


class Profile(Base):
    """Toute donnée propre à un profil y fait référence par une clé étrangère
    `profile_id → profiles.id` avec ON DELETE CASCADE : supprimer le profil supprime ses données."""

    __tablename__ = "profiles"
    __table_args__ = (
        CheckConstraint("weekly_goal BETWEEN 1 AND 14", name="weekly_goal"),
        CheckConstraint("speed_unit IN ('kmh', 'pace')", name="speed_unit"),
        Index("uq_profiles_name", text("name COLLATE NOCASE"), unique=True),
    )

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    name: Mapped[str] = mapped_column(String(64))
    weekly_goal: Mapped[int]
    speed_unit: Mapped[str] = mapped_column(String(8))
    weight_kg: Mapped[float | None] = mapped_column(Float, CheckConstraint(
        "weight_kg BETWEEN 20 AND 300", name="weight_kg"))
    # Horodatages UTC ISO 8601, au même format partout : ils se trient comme du texte.
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class Workout(Base):
    __tablename__ = "workouts"
    __table_args__ = (UniqueConstraint("profile_id", "id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[str] = mapped_column(String(40))


class WorkoutVersion(Base):
    """Snapshots immuables ; seule la suppression de la séance/profil les retire."""
    __tablename__ = "workout_versions"
    __table_args__ = (
        CheckConstraint("version >= 1", name="version"),
        CheckConstraint("author IN ('human', 'chatgpt')", name="author"),
    )

    workout_id: Mapped[str] = mapped_column(ForeignKey("workouts.id", ondelete="CASCADE"), primary_key=True)
    version: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    author: Mapped[str] = mapped_column(String(16))
    author_name: Mapped[str] = mapped_column(String(64))
    items: Mapped[list] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))
    goal: Mapped[str | None] = mapped_column(String(16))
    level: Mapped[str | None] = mapped_column(String(16))
    origin: Mapped[dict | None] = mapped_column(JSON)


class WorkoutSelection(Base):
    """Au plus une prochaine séance par profil, nécessairement dans sa bibliothèque."""
    __tablename__ = "workout_selections"
    __table_args__ = (ForeignKeyConstraint(
        ["profile_id", "workout_id"], ["workouts.profile_id", "workouts.id"], ondelete="CASCADE"),)

    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    workout_id: Mapped[str] = mapped_column(String(32))


class Conversation(Base):
    __tablename__ = "coach_conversations"
    __table_args__ = (UniqueConstraint("profile_id", "id"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    title: Mapped[str] = mapped_column(String(100))
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))
    # Archivée : retirée de la liste, échanges conservés et toujours consultables par le coach.
    archived_at: Mapped[str | None] = mapped_column(String(40))


class CoachTurn(Base):
    """Une demande idempotente et sa réponse, même partielle, conservées ensemble."""
    __tablename__ = "coach_turns"
    __table_args__ = (
        ForeignKeyConstraint(["profile_id", "conversation_id"],
                             ["coach_conversations.profile_id", "coach_conversations.id"], ondelete="CASCADE"),
        UniqueConstraint("profile_id", "request_id"),
        CheckConstraint("status IN ('running', 'completed', 'interrupted', 'failed')", name="status"),
        Index("uq_coach_running_profile", "profile_id", unique=True, sqlite_where=text("status = 'running'")),
        Index("ix_coach_turns_conversation", "conversation_id", "created_at", "id"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(String(32))
    conversation_id: Mapped[str] = mapped_column(String(32))
    request_id: Mapped[str] = mapped_column(String(36))
    user_text: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16))
    error: Mapped[str | None] = mapped_column(String(64))
    model: Mapped[str | None] = mapped_column(String(200))
    sources: Mapped[list] = mapped_column(JSON)
    proposals: Mapped[list] = mapped_column(JSON)
    # Questions à choix affichées en cases ; la réponse arrive dans le message suivant.
    questions: Mapped[list] = mapped_column(JSON, server_default=text("'[]'"))
    usage: Mapped[dict] = mapped_column(JSON)
    workout_context: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class CoachMemory(Base):
    __tablename__ = "coach_memories"
    __table_args__ = (UniqueConstraint("profile_id", "source_turn_id", "proposal_index"),)
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(String(500))
    source_turn_id: Mapped[str | None] = mapped_column(ForeignKey("coach_turns.id", ondelete="SET NULL"))
    proposal_index: Mapped[int | None]
    created_at: Mapped[str] = mapped_column(String(40))
    updated_at: Mapped[str] = mapped_column(String(40))


class WorkoutProposal(Base):
    """Proposition validée, indépendante du texte du coach ; acceptation atomique."""
    __tablename__ = 'workout_proposals'
    __table_args__ = (UniqueConstraint('turn_id', 'call_id'),
                      CheckConstraint("status IN ('pending', 'accepted', 'ignored')", name='status'))
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey('profiles.id', ondelete='CASCADE'), index=True)
    turn_id: Mapped[str] = mapped_column(ForeignKey('coach_turns.id', ondelete='CASCADE'), index=True)
    call_id: Mapped[str] = mapped_column(String(200))
    workout: Mapped[dict] = mapped_column(JSON)
    explanation: Mapped[str] = mapped_column(String(600))
    base: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16))
    accepted_id: Mapped[str | None] = mapped_column(String(32))
    accepted_version: Mapped[int | None]
    created_at: Mapped[str] = mapped_column(String(40))


class RecordedSession(Base):
    """Réalisation indépendante du programme éditable, détenue par son profil."""
    __tablename__ = "recorded_sessions"
    __table_args__ = (
        CheckConstraint("feeling BETWEEN 1 AND 10", name="feeling"),
        CheckConstraint("mode IN ('reel', 'simulation')", name="mode"),
        Index("ix_recorded_sessions_profile_date", "profile_id", "started_at", "id"),
    )
    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"))
    mode: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[str] = mapped_column(String(40))
    closed_at: Mapped[str | None] = mapped_column(String(40))
    profile_snapshot: Mapped[dict] = mapped_column(JSON)
    workout_snapshot: Mapped[dict] = mapped_column(JSON)
    calculation_version: Mapped[str] = mapped_column(String(40))
    checkpoint: Mapped[dict] = mapped_column(JSON)
    persisted_at: Mapped[str] = mapped_column(String(40))
    persisted_seq: Mapped[int]
    lost_entries: Mapped[int]
    feeling: Mapped[int | None]
    feeling_updated_at: Mapped[str | None] = mapped_column(String(40))


class RecordedEntry(Base):
    __tablename__ = "recorded_entries"
    session_id: Mapped[str] = mapped_column(ForeignKey("recorded_sessions.id", ondelete="CASCADE"), primary_key=True)
    seq: Mapped[int] = mapped_column(primary_key=True)
    at: Mapped[str] = mapped_column(String(40))
    t: Mapped[float] = mapped_column(Float)
    kind: Mapped[str] = mapped_column(String(24))
    source: Mapped[str] = mapped_column(String(24))
    data: Mapped[dict] = mapped_column(JSON)
