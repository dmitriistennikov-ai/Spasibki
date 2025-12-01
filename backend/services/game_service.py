from datetime import datetime, timedelta

from sqlalchemy import and_
from sqlalchemy.orm import Session

from backend.models import Game, LikeTransaction, LimitParameter


def get_active_game(db: Session):

    now = datetime.utcnow()
    active_game = db.query(Game).filter(
        and_(
            Game.game_is_active == True,
            Game.game_start <= now,
            Game.game_end + timedelta(days=1) > now,
        )
    ).first()

    return active_game


def get_received_likes_count(db: Session, bitrix_id: int, game_id: int) -> int:
    return db.query(LikeTransaction).filter(
        LikeTransaction.to_user_bitrix_id == bitrix_id,
        LikeTransaction.game_id == game_id
    ).count()


def get_sent_likes_count(db: Session, bitrix_id: int, game: Game) -> int:
    base_query = db.query(LikeTransaction).filter(
        LikeTransaction.from_user_bitrix_id == bitrix_id,
        LikeTransaction.game_id == game.id,
    )

    now = datetime.utcnow()
    param = game.setting_limitParameter  # Enum: LimitParameter.DAY/WEEK/MONTH/GAME

    if param == LimitParameter.DAY:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    if param == LimitParameter.WEEK:
        monday = now - timedelta(days=now.weekday())
        start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    if param == LimitParameter.MONTH:
        start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        return base_query.filter(LikeTransaction.created_at >= start).count()

    if param == LimitParameter.GAME:
        return base_query.count()

    return base_query.count()


def get_remaining_likes(db: Session, bitrix_id: int, game: Game) -> int:
    if not game:
        return 0

    sent_count = get_sent_likes_count(db, bitrix_id, game)
    return max(0, game.setting_limitValue - sent_count)