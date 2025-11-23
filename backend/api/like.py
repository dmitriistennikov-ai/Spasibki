from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from backend.scripts.database import get_db
from backend.models import Employee, LikeTransaction
from backend.services.bitrix_notify import send_bitrix_notification
from backend.services.db_search_active_game import search_active_game
from backend.services.game_service import get_sent_likes_count
from datetime import datetime
from pydantic import BaseModel, Field, constr
from typing import Optional

class LikeRequest(BaseModel):
    from_id: int = Field(ge=1)
    to_id: int   = Field(ge=1)
    message: Optional[str] = Field(default=None, max_length=280)


router = APIRouter()

@router.post("/api/like", status_code=status.HTTP_201_CREATED)
async def send_like(payload: LikeRequest, db: Session = Depends(get_db)):

    active_game = search_active_game(db)
    if not active_game:
        raise HTTPException(status_code=400, detail="Нельзя отправить Спасибку: сейчас нет активной игры")

    count_in_this_game = (
        db.query(LikeTransaction)
        .filter(
            LikeTransaction.game_id == active_game.id,
            LikeTransaction.from_user_bitrix_id == payload.from_id,
            LikeTransaction.to_user_bitrix_id == payload.to_id,
        )
        .count()
    )

    if count_in_this_game >= active_game.setting_limitToOneUser:
        raise HTTPException(status_code=400, detail="Вы превысили лимит на Спасибки для одного сотрудника")

    sent_in_period = get_sent_likes_count(db, payload.from_id, active_game)
    if sent_in_period >= active_game.setting_limitValue:
        raise HTTPException(
            status_code=400,
            detail="Вы израсходовали лимит Спасибок",
        )

    if payload.from_id == payload.to_id:
        raise HTTPException(status_code=400, detail="Нельзя отправить Спасибку самому себе")

    like_from = db.query(Employee).filter_by(bitrix_id=payload.from_id).first()
    if not like_from:
        raise HTTPException(status_code=404, detail="Отправитель не найден")

    like_for = db.query(Employee).filter_by(bitrix_id=payload.to_id).first()
    if not like_for:
        raise HTTPException(status_code=404, detail="Получатель не найден")

    like_for.likes += 1
    like_for.coins += 1

    new_like_transaction = LikeTransaction(
        from_user_bitrix_id=payload.from_id,
        to_user_bitrix_id=payload.to_id,
        message=payload.message,
        created_at=datetime.utcnow(),
        game_id=active_game.id,
    )
    db.add(new_like_transaction)
    db.commit()

    await send_bitrix_notification(from_user_id=payload.from_id, to_user_id=payload.to_id, db=db)

    return {"message": "Спасибка отправлена!"}
