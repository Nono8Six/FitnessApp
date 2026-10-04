from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.exc import DBAPIError
from sqlalchemy.engine import URL
from sqlalchemy.orm import Session, sessionmaker

from ..config import StartupError

DATABASE_FILE = "fitness.db"
MIGRATIONS = Path(__file__).resolve().parent


class StorageError(StartupError):
    pass


@dataclass(frozen=True)
class Database:
    path: Path
    engine: Engine
    schema: str
    _sessions: sessionmaker[Session]

    @contextmanager
    def transaction(self) -> Iterator[Session]:
        """Une transaction : validée à la sortie, annulée sur exception."""
        with self._sessions() as session, session.begin():
            yield session

    def close(self) -> None:
        self.engine.dispose()


def create_db_engine(path: Path) -> Engine:
    engine = create_engine(URL.create("sqlite", database=str(path)), connect_args={"timeout": 5})

    @event.listens_for(engine, "connect")
    def configure(dbapi_connection, _record):
        # sqlite3 ne gère plus les BEGIN : les PRAGMA s'exécutent hors transaction
        # et le DDL des migrations devient transactionnel (recette SQLAlchemy).
        dbapi_connection.isolation_level = None
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
            mode = cursor.execute("PRAGMA journal_mode = WAL").fetchone()[0]
            if str(mode).lower() != "wal":
                raise RuntimeError(f"mode WAL refusé ({mode})")
        finally:
            cursor.close()

    @event.listens_for(engine, "begin")
    def begin(connection):
        connection.exec_driver_sql("BEGIN")

    return engine


def alembic_config(migrations: Path = MIGRATIONS) -> Config:
    """Configuration sans alembic.ini : le chemin de la base vient toujours de l'application."""
    config = Config()
    config.set_main_option("script_location", str(migrations))
    return config


def migrate(engine: Engine, migrations: Path = MIGRATIONS) -> str:
    """Amène la base à la dernière révision, en une transaction, et renvoie cette révision."""
    config = alembic_config(migrations)
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        revision = MigrationContext.configure(connection).get_current_revision()
    if revision is None:
        raise RuntimeError("aucune révision enregistrée après la migration")
    return revision


def open_database(data_dir: Path, migrations: Path = MIGRATIONS) -> Database:
    """Ouvre la base du mode et applique les migrations ; un échec empêche le démarrage."""
    path = data_dir / DATABASE_FILE
    engine = create_db_engine(path)
    try:
        schema = migrate(engine, migrations)
    except Exception as exc:
        engine.dispose()
        cause = exc.orig if isinstance(exc, DBAPIError) and exc.orig is not None else exc
        raise StorageError(
            f"Base de données {path} : mise à jour du schéma impossible ({type(cause).__name__} : {cause}). "
            "Le serveur ne démarre pas ; la base n'a pas été modifiée par cette tentative."
        ) from exc
    return Database(path=path, engine=engine, schema=schema,
                    _sessions=sessionmaker(engine, expire_on_commit=False))
