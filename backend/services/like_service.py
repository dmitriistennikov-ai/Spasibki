import logging
from datetime import datetime, UTC

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from backend.models import LikeTransaction, Employee, LikeRequest, GameParticipant, Game
from backend.services.game_service import get_sent_likes_count

logger = logging.getLogger(__name__)


def process_like_transaction(db: Session, payload: LikeRequest) -> tuple[int, int]:
    game = db.query(Game).filter(Game.id == payload.game_id).first()

    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Игра не найдена",
        )

    if not game.game_is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Нельзя отправить Спасибку: выбранная игра не активна")

    today = datetime.now(UTC).date()

    if game.game_start and today < game.game_start.date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя отправить Спасибку: игра начнётся {game.game_start.date()}",
        )

    if game.game_end and today > game.game_end.date():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Нельзя отправить Спасибку: дата завершения игры {game.game_end.date()} прошла"
        )

    participant_ids = {
        row.employee_bitrix_id
        for row in (
            db.query(GameParticipant.employee_bitrix_id)
            .filter(GameParticipant.game_id == game.id)
            .all()
        )
    }

    if payload.from_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя отправить Спасибку: отправитель не участвует в выбранной игре",
        )

    if payload.to_id not in participant_ids:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя отправить Спасибку: получатель не участвует в выбранной игре",
        )

    count_in_this_game = (
        db.query(LikeTransaction)
        .filter(
            LikeTransaction.game_id == game.id,
            LikeTransaction.from_user_bitrix_id == payload.from_id,
            LikeTransaction.to_user_bitrix_id == payload.to_id,
        )
        .count()
    )

    if count_in_this_game >= game.setting_limitToOneUser:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Вы превысили лимит на Спасибки для одного сотрудника")

    sent_in_period = get_sent_likes_count(db, payload.from_id, game)

    if sent_in_period >= game.setting_limitValue:
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
            game_id=game.id,
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
