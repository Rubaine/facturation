from alembic import context

from app.db import Base, get_engine
from app import models  # noqa: F401 - enregistre les tables

target_metadata = Base.metadata


def run_migrations() -> None:
    connectable = context.config.attributes.get("connection")
    if connectable is None:
        with get_engine().connect() as connection:
            _run(connection)
    else:
        _run(connectable)


def _run(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata, render_as_batch=True)
    with context.begin_transaction():
        context.run_migrations()


run_migrations()
