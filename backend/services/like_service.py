import logging
from datetime import datetime, UTC

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import LikeTransaction, Employee, LikeRequest
from .db_search_active_game import search_active_game

logger = logging.getLogger(__name__)


def process_like_transaction(db: Session, payload: LikeRequest) -> tuple[int, int]:
    active_game = search_active_game(db)

    if not active_game:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Нельзя отправить Спасибку: сейчас нет активной игры")

    if datetime.now(UTC).date() > active_game.game_end.date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя отправить Спасибку: дата завершения игры {active_game.game_end.date()} прошла"
        )

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
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Вы превысили лимит на Спасибки для одного сотрудника")

    sent_in_period = (
        db.query(LikeTransaction)
        .filter(
            LikeTransaction.game_id == active_game.id,
            LikeTransaction.from_user_bitrix_id == payload.from_id,
        )
        .count()
    )

    if sent_in_period >= active_game.setting_limitValue:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Вы израсходовали лимит Спасибок",
        )

    if payload.from_id == payload.to_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Нельзя отправить Спасибку самому себе")

    like_from = db.query(Employee).filter_by(bitrix_id=payload.from_id).first()
    like_for = db.query(Employee).filter_by(bitrix_id=payload.to_id).first()

    if not like_from:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Отправитель не найден")
    if not like_for:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Получатель не найден")

    try:
        like_for.likes += 1
        like_for.coins += 100

        new_like_transaction = LikeTransaction(
            from_user_bitrix_id=payload.from_id,
            to_user_bitrix_id=payload.to_id,
            message=payload.message,
            created_at=datetime.utcnow(),
            game_id=active_game.id,
            sticker_id=payload.sticker_id,
        )
        db.add(new_like_transaction)

        db.commit()

        return payload.from_id, payload.to_id

    except Exception:
        logger.exception(f"Транзакция лайка не удалась. Откат изменений. From: {payload.from_id}")
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при сохранении Спасибки в БД."
        )
