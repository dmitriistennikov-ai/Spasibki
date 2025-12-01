from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.scripts.database import get_db
from backend.services.game_service import get_active_game, get_received_likes_count, get_remaining_likes

router = APIRouter()


class LikesInfoResponse(BaseModel):
    received_likes: int
    remaining_likes: int
    game_name: str
    game_id: int | None
    has_active_game: bool


@router.get("/api/likes-info/{bitrix_id}", response_model=LikesInfoResponse)
async def get_likes_info(
        bitrix_id: int,
        db: Session = Depends(get_db)
):
    active_game = get_active_game(db)

    if not active_game:
        return LikesInfoResponse(
            received_likes=0,
            remaining_likes=0,
            game_name="Нет активной игры",
            game_id=None,
            has_active_game=False
        )

    received_likes = get_received_likes_count(db, bitrix_id, active_game.id)
    remaining_likes = get_remaining_likes(db, bitrix_id, active_game)

    return LikesInfoResponse(
        received_likes=received_likes,
        remaining_likes=remaining_likes,
        game_name=active_game.name,
        game_id=active_game.id,
        has_active_game=True
    )