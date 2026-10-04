"""Environnement Alembic. La connexion est toujours fournie par backend.storage.database.migrate."""

from alembic import context

from backend.storage.models import Base

connection = context.config.attributes.get("connection")
if connection is None:
    raise RuntimeError("Migrations exécutées par l'application uniquement (backend.storage.database.migrate).")

context.configure(connection=connection, target_metadata=Base.metadata, render_as_batch=True)
with context.begin_transaction():
    context.run_migrations()
