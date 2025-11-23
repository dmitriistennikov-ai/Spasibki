import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

class Settings:
    APP_NAME = os.getenv("APP_NAME", "Bitrix24 Likes App")
    APP_ENV = os.getenv("APP_ENV", "development")
    DB_PATH = os.getenv("DB_PATH", "./app.db")

    @property
    def DATABASE_URL(self):
        path = Path(self.DB_PATH).resolve()
        return f"sqlite+aiosqlite:///{path}"

settings = Settings()
