from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models import Sticker, StickerResponse
from backend.scripts.database import get_db

router = APIRouter(tags=["stickers"])


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
