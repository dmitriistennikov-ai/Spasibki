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

    try:
        notify_result = await send_bitrix_notification(from_user_id=from_user_id, to_user_id=to_user_id, db=db)
        if isinstance(notify_result, dict) and notify_result.get("status", 200) >= 400:
            logger.warning(
                "Like sent, but Bitrix notification failed (from_user_id=%s, to_user_id=%s): %s",
                from_user_id,
                to_user_id,
                notify_result,
            )
    except Exception:
        logger.exception(
            "Like sent, but unexpected error while sending Bitrix notification (from_user_id=%s, to_user_id=%s)",
            from_user_id,
            to_user_id,
        )

    return {"message": "Спасибка отправлена!"}
