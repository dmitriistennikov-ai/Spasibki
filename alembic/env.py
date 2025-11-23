from logging.config import fileConfig
from alembic import context
from sqlalchemy import pool
from pathlib import Path
import sys

# === Добавляем путь к backend ===
BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "backend"))

# === Импортируем базу и модели ===
from backend.scripts.database import Base, engine
from backend.models import *

# --- Конфиг Alembic ---
config = context.config

# --- Настройка логов ---
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# --- Указываем метаданные моделей ---
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Миграции без подключения к БД"""
    url = str(engine.url)
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Миграции с подключением к БД"""
    connectable = engine

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

