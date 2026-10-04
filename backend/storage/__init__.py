"""Stockage SQLite : une base par mode (réel, simulation), schéma géré par Alembic.

Toute évolution du schéma est une nouvelle révision dans versions/ (identifiant suivant,
down_revision sur la précédente), appliquée au démarrage. Jamais de create_all.
"""

from .database import DATABASE_FILE, Database, StorageError, open_database

__all__ = ["DATABASE_FILE", "Database", "StorageError", "open_database"]
