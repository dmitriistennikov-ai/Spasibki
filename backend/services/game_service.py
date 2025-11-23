from sqlalchemy.orm import Session
from sqlalchemy import func, extract, and_
from datetime import datetime, timedelta
from backend.models import Game, LikeTransaction, LimitParameter
from backend.scripts.database import SessionLocal
from fastapi import APIRouter, Depends, HTTPException

def get_active_game(db: Session):
    """
    Получить активную игру (которая сейчас идёт)
    """
    now = datetime.utcnow()
    active_game = db.query(Game).filter(
        and_(
            Game.game_is_active == True,
            Game.game_start <= now,
            Game.game_end >= now,
        )
    ).first()

    return active_game


def get_received_likes_count(db: Session, bitrix_id: int, game_id: int) -> int:
    """
    Получить количество лайков, полученных сотрудником в конкретной игре
    """
    return db.query(LikeTransaction).filter(
        LikeTransaction.to_user_bitrix_id == bitrix_id,
        LikeTransaction.game_id == game_id
    ).count()


def get_sent_likes_count(db: Session, bitrix_id: int, game: Game) -> int:
    """
    Сколько лайков этот пользователь уже отправил в ЭТОЙ игре
    с учётом лимита периода (день/неделя/месяц/вся игра).
    """
    base_query = db.query(LikeTransaction).filter(
        LikeTransaction.from_user_bitrix_id == bitrix_id,
        LikeTransaction.game_id == game.id,
    )

    now = datetime.utcnow()
    param = game.setting_limitParameter  # Enum: LimitParameter.DAY/WEEK/MONTH/GAME

    # День: с начала сегодняшнего дня (UTC)
    if param == LimitParameter.DAY:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    # Неделя: с понедельника текущей недели
    if param == LimitParameter.WEEK:
        monday = now - timedelta(days=now.weekday())
        start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    # Месяц: с первого числа текущего месяца
    if param == LimitParameter.MONTH:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    # Вся игра: считаем все лайки в этой игре, независимо от даты
    if param == LimitParameter.GAME:
        return base_query.count()

    # Фоллбек на всякий случай — считаем всё
    return base_query.count()


def get_remaining_likes(db: Session, bitrix_id: int, game: Game) -> int:
    """
    Получить остаток лайков для отправки в рамках игры
    """
    if not game:
        return 0

    sent_count = get_sent_likes_count(db, bitrix_id, game)
    return max(0, game.setting_limitValue - sent_count)