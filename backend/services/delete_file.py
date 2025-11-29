import logging
import os
from pathlib import Path

from backend.scripts.config import settings

logger = logging.getLogger(__name__)


def delete_sticker_file_from_disk(file_url: str):
    try:
        filename = Path(file_url).name
        target_path = settings.STICKERS_UPLOAD_DIR / filename

        if target_path.exists():
            os.remove(target_path)
            logger.info(f"Файл {filename} успешно удален с диска.")
        else:
            logger.warning(f"Файл {filename} не найден на диске.")

    except (FileNotFoundError, OSError):
        logger.exception(f"Не удалось физически удалить файл {file_url} с диска.")
    except Exception:
        logger.exception(f"Ошибка при удалении файла {file_url}")
