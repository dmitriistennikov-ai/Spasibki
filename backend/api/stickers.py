import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session

from backend.models import Sticker, StickerResponse, StickerCreate
from backend.scripts.database import get_db

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
STICKERS_UPLOAD_DIR = STATIC_DIR / "stickers"
STICKERS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/api/stickers", response_model=List[StickerResponse])
def get_stickers_catalog(db: Session = Depends(get_db)):
    try:
        stickers = db.query(Sticker).all()

        return stickers

    except Exception as e:
        print(f"Ошибка при получении каталога стикеров: {e}")
        return []


@router.get("/api/sticker/{sticker_id}", response_model=StickerResponse)
async def get_sticker_url(sticker_id: int, db: Session = Depends(get_db)):
    sticker = db.query(Sticker).filter(Sticker.id == sticker_id).first()
    if not sticker:
        raise HTTPException(status_code=404, detail="Стикер не найден")

    return StickerResponse(id=sticker.id, url=sticker.url, name=sticker.name)


@router.post("/api/stickers/upload-image")
async def upload_sticker_image(file: UploadFile = File(...)):
    allowed_content_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/gif",
    }

    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Допустимы только изображения (jpeg, png, webp, gif)",
        )

    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = STICKERS_UPLOAD_DIR / filename

    contents = await file.read()
    try:
        with open(target_path, "wb") as f:
            f.write(contents)
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить файл",
        )

    public_url = f"/static/stickers/{filename}"

    return {"url": public_url}


@router.delete("/api/stickers/{sticker_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sticker(sticker_id: int, db: Session = Depends(get_db)):
    sticker_to_delete = db.query(Sticker).filter(Sticker.id == sticker_id).first()

    if not sticker_to_delete:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Стикер с ID {sticker_id} не найден",
        )

    try:
        db.delete(sticker_to_delete)
        db.commit()

        return {"detail": "Стикер успешно удален"}

    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Ошибка при удалении стикера: {str(e)}",
        )


@router.post("/api/stickers", response_model=StickerResponse, status_code=status.HTTP_201_CREATED)
def create_sticker_data(sticker: StickerCreate, db: Session = Depends(get_db)):
    try:
        new_sticker = Sticker(**sticker.model_dump())
        db.add(new_sticker)
        db.commit()
        db.refresh(new_sticker)
        return new_sticker

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при создании записи стикера в БД: {str(e)}")
