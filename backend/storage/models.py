"""Modèles SQLAlchemy. Toute évolution passe par une migration dans versions/."""

from sqlalchemy import CheckConstraint, ForeignKey, ForeignKeyConstraint, Index, JSON, MetaData, String, UniqueConstraint, text
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


class WorkoutSelection(Base):
    """Au plus une prochaine séance par profil, nécessairement dans sa bibliothèque."""
    __tablename__ = "workout_selections"
    __table_args__ = (ForeignKeyConstraint(
        ["profile_id", "workout_id"], ["workouts.profile_id", "workouts.id"], ondelete="CASCADE"),)

    profile_id: Mapped[str] = mapped_column(ForeignKey("profiles.id", ondelete="CASCADE"), primary_key=True)
    workout_id: Mapped[str] = mapped_column(String(32))
