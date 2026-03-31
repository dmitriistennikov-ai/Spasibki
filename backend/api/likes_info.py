from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models import Game, GameParticipant
from backend.scripts.database import get_db
from backend.services.game_service import (
    get_active_game,
    get_received_likes_count,
    get_remaining_likes,
    get_sent_likes_count,
)

router = APIRouter()


class LikesInfoResponse(BaseModel):
    received_likes: int
    remaining_likes: int
    sent_likes: int
    game_name: str
    game_id: int | None
    has_active_game: bool


@router.get("/api/likes-info/{bitrix_id}", response_model=LikesInfoResponse)
async def get_likes_info(
        bitrix_id: int,
        game_id: int | None = Query(default=None, ge=1),
        db: Session = Depends(get_db)
):
    active_game = None

    if game_id is not None:
        selected_game = db.query(Game).filter(Game.id == game_id).first()
        if not selected_game:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Игра не найдена",
            )
        if not selected_game.game_is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Игра не активна",
            )
        is_participant = (
            db.query(GameParticipant.id)
            .filter(
                GameParticipant.game_id == selected_game.id,
                GameParticipant.employee_bitrix_id == bitrix_id,
            )
            .first()
            is not None
        )
        if not is_participant:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Сотрудник не участвует в выбранной игре",
            )
        active_game = selected_game
    else:
        active_game = get_active_game(db)

    if not active_game:
        return LikesInfoResponse(
            received_likes=0,
            remaining_likes=0,
            sent_likes=0,
            game_name="Нет активной игры",
            game_id=None,
            has_active_game=False
        )

    received_likes = get_received_likes_count(db, bitrix_id, active_game.id)
    remaining_likes = get_remaining_likes(db, bitrix_id, active_game)
    sent_likes = get_sent_likes_count(db, bitrix_id, active_game)

    return LikesInfoResponse(
        received_likes=received_likes,
        remaining_likes=remaining_likes,
        sent_likes=sent_likes,
        game_name=active_game.name,
        game_id=active_game.id,
        has_active_game=True
    )
