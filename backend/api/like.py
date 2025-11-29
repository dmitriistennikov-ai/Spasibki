import asyncio
import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.models import LikeRequest
from backend.scripts.database import get_db
from backend.services.bitrix_notify import send_bitrix_notification
from backend.services.like_service import process_like_transaction

router = APIRouter()

logger = logging.getLogger(__name__)

@router.post("/api/like", status_code=status.HTTP_201_CREATED)
async def send_like(payload: LikeRequest, db: Session = Depends(get_db)):
    try:
        from_user_id, to_user_id = await asyncio.to_thread(
            process_like_transaction,
            db,
            payload
        )

    except HTTPException:
        raise

    await send_bitrix_notification(from_user_id=from_user_id, to_user_id=to_user_id, db=db)

    return {"message": "Спасибка отправлена!"}
