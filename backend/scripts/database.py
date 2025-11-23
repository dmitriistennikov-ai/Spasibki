from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Файл базы данных SQLite (создастся автоматически)
DATABASE_URL = "sqlite:///./database.db"

# Создаём движок подключения
engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False}
)

# Создаём класс для описания таблиц
Base = declarative_base()

# Создаём фабрику для подключения к БД (сессии)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()