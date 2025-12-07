import os
import logging
from pathlib import Path
from dotenv import load_dotenv
from sqlalchemy.engine import URL

BASE_DIR = Path(__file__).resolve().parent.parent

env_path = BASE_DIR / ".env"
load_dotenv(env_path)

local_env_path = BASE_DIR / ".env.local"
if local_env_path.exists():
    load_dotenv(local_env_path, override=True)

STATIC_DIR = BASE_DIR / "static"
STICKERS_UPLOAD_DIR_DEFAULT = STATIC_DIR / "stickers"
STICKERS_UPLOAD_DIR_DEFAULT.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Settings:
    APP_NAME = os.getenv("APP_NAME", "Bitrix24 Likes App")
    APP_ENV = os.getenv("APP_ENV", "development")

    BITRIX_APP_URL = os.getenv("BITRIX_APP_URL", "")
    BITRIX_CLIENT_ID = os.getenv("BITRIX_CLIENT_ID", "")
    BITRIX_CLIENT_SECRET = os.getenv("BITRIX_CLIENT_SECRET", "")

    DB_USER = os.getenv("DB_USER", "spasibki_user")
    DB_PASSWORD = os.getenv("DB_PASSWORD", "Spasibki123987")
    DB_HOST = os.getenv("DB_HOST", "localhost")
    DB_PORT = int(os.getenv("DB_PORT", "5432"))
    DB_NAME = os.getenv("DB_NAME", "spasibki_db")

    @property
    def STICKERS_UPLOAD_DIR(self):
        return STICKERS_UPLOAD_DIR_DEFAULT

    @property
    def DATABASE_URL(self):
        return URL.create(
            drivername="postgresql+psycopg2",
            username=self.DB_USER,
            password=self.DB_PASSWORD,
            host=self.DB_HOST,
            port=self.DB_PORT,
            database=self.DB_NAME,
        )


settings = Settings()

