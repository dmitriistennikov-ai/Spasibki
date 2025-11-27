from typing import List, Optional, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, or_, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import Game, Employee, LikeTransaction, GameResponse, GameUpdate, GameCreate
from backend.scripts.database import get_db

router = APIRouter()


class GameRatingRow(BaseModel):
    bitrix_id: int
    photo_url: Optional[str]
    fio: str
    received: int
    sent: int

    class Config:
        from_attributes = True


# ---------- Вспомогательная функция рейтинга ----------
def calc_game_rating(game_id: int, db: Session) -> List[GameRatingRow]:
    received_sub = (
        db.query(
            LikeTransaction.to_user_bitrix_id.label("bitrix_id"),
            func.count(LikeTransaction.id).label("received"),
        )
        .filter(LikeTransaction.game_id == game_id)
        .group_by(LikeTransaction.to_user_bitrix_id)
        .subquery()
    )

    sent_sub = (
        db.query(
            LikeTransaction.from_user_bitrix_id.label("bitrix_id"),
            func.count(LikeTransaction.id).label("sent"),
        )
        .filter(LikeTransaction.game_id == game_id)
        .group_by(LikeTransaction.from_user_bitrix_id)
        .subquery()
    )

    rows = (
        db.query(
            Employee.bitrix_id,
            Employee.name,
            Employee.lastname,
            Employee.photo_url,
            func.coalesce(received_sub.c.received, 0).label("received"),
            func.coalesce(sent_sub.c.sent, 0).label("sent"),
        )
        .outerjoin(received_sub, received_sub.c.bitrix_id == Employee.bitrix_id)
        .outerjoin(sent_sub, sent_sub.c.bitrix_id == Employee.bitrix_id)
        .filter(
            or_(
                received_sub.c.received.isnot(None),
                sent_sub.c.sent.isnot(None),
            )
        )
        .order_by(
            desc(func.coalesce(received_sub.c.received, 0)),
            desc(func.coalesce(sent_sub.c.sent, 0)),
        )
        .all()
    )

    return [
        GameRatingRow(
            bitrix_id=r.bitrix_id,
            photo_url=r.photo_url,
            fio=f"{(r.lastname or '').strip()} {(r.name or '').strip()}".strip()
                or "Без имени",
            received=r.received,
            sent=r.sent,
        )
        for r in rows
    ]


def calc_overall_rating(db: Session, page: int, limit: int):
    offset = (page - 1) * limit

    received_sub = (
        db.query(
            LikeTransaction.to_user_bitrix_id.label("employee_id"),
            func.count(LikeTransaction.id).label("received")
        )
        .group_by(LikeTransaction.to_user_bitrix_id)
        .subquery()
    )

    sent_sub = (
        db.query(
            LikeTransaction.from_user_bitrix_id.label("employee_id"),
            func.count(LikeTransaction.id).label("sent")
        )
        .group_by(LikeTransaction.from_user_bitrix_id)
        .subquery()
    )

    total_count = (
        db.query(Employee.bitrix_id)
        .outerjoin(received_sub, Employee.bitrix_id == received_sub.c.employee_id)
        .outerjoin(sent_sub, Employee.bitrix_id == sent_sub.c.employee_id)
        .filter(
            or_(
                received_sub.c.received.isnot(None),
                sent_sub.c.sent.isnot(None),
            )
        )
        .count()
    )

    rows = (
        db.query(
            Employee.bitrix_id,
            Employee.photo_url,
            Employee.name,
            Employee.lastname,
            func.coalesce(received_sub.c.received, 0).label("received"),
            func.coalesce(sent_sub.c.sent, 0).label("sent"),
        )
        .outerjoin(received_sub, Employee.bitrix_id == received_sub.c.employee_id)
        .outerjoin(sent_sub, Employee.bitrix_id == sent_sub.c.employee_id)
        .filter(
            or_(
                received_sub.c.received.isnot(None),
                sent_sub.c.sent.isnot(None),
            )
        )
        .order_by(
            desc(func.coalesce(received_sub.c.received, 0)),
            desc(func.coalesce(sent_sub.c.sent, 0)),
        )
        .offset(offset)
        .limit(limit)
        .all()
    )

    formatted_rows = [
        GameRatingRow(
            bitrix_id=r.bitrix_id,
            photo_url=r.photo_url,
            fio=f"{(r.lastname or '').strip()} {(r.name or '').strip()}".strip()
                or "Без имени",
            received=r.received,
            sent=r.sent,
        )
        for r in rows
    ]

    total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

    return {
        "rating": formatted_rows,
        "total_pages": total_pages
    }


@router.get("/api/rating/overall", response_model=Dict)
def get_overall_rating_route(
        page: int = 1,
        limit: int = 5,
        db: Session = Depends(get_db)
):
    return calc_overall_rating(db, page=page, limit=limit)


@router.get("/api/games", response_model=dict)
def get_all_games(is_active: bool = False, page: int = 1, limit: int = 5, db: Session = Depends(get_db)):
    offset = (page - 1) * limit

    if is_active:
        games = db.query(Game).filter(Game.game_is_active.is_(True)).offset(offset).limit(limit).all()
    else:
        games = db.query(Game).filter(Game.game_is_active.is_(False)).offset(offset).limit(limit).all()

    total_games = db.query(Game).filter(Game.game_is_active.is_(is_active)).count()
    total_pages = (total_games + limit - 1) // limit

    games_data = [GameResponse.validate(game) for game in games]

    return {
        "games": games_data,
        "total_pages": total_pages
    }



@router.get("/api/games/all", response_model=List[GameResponse])
def get_all_games_no_filter(db: Session = Depends(get_db)):
    try:
        games = db.query(Game).all()
        return games
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Ошибка при получении списка игр"
        )


@router.get("/api/games/{game_id}/rating", response_model=List[GameRatingRow])
def get_game_rating(game_id: int, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Игра не найдена",
        )
    return calc_game_rating(game.id, db)


@router.get("/api/games/active/rating", response_model=List[GameRatingRow])
def get_active_game_rating(db: Session = Depends(get_db)):
    active_game = (
        db.query(Game)
        .filter(Game.game_is_active == True)
        .first()
    )
    if not active_game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Активная игра не найдена",
        )
    return calc_game_rating(active_game.id, db)


@router.patch("/api/games/{game_id}", response_model=GameResponse)
def update_game(game_id: int, payload: GameUpdate, db: Session = Depends(get_db)):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Игра не найдена",
        )

    if payload.game_start >= payload.game_end:
        raise HTTPException(status_code=400, detail="Дата начала должна быть раньше даты завершения")

    data = payload.dict(exclude_unset=True)


    if data.get("game_is_active") is True:
        db.query(Game).filter(
            Game.id != game_id,
            Game.game_is_active.is_(True)
        ).update({Game.game_is_active: False})

    for field, value in data.items():
        setattr(game, field, value)

    try:
        db.commit()
        db.refresh(game)
        return game
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Ошибка при обновлении игры",
        )

@router.delete("/api/games/{game_id}")
def delete_game(game_id: int, db: Session = Depends(get_db)):

    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Игра не найдена",
        )

    like_count = db.query(LikeTransaction).filter(LikeTransaction.game_id == game_id).count()
    if like_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя удалить игру. В ней уже {like_count} Спасибок."
        )

    try:
        db.delete(game)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить игру, по которой уже есть Спасибки",
        )

    return


@router.post("/api/games")
def create_game(game_data: GameCreate, db: Session = Depends(get_db)):
    try:
        if game_data.game_is_active:
            existing_active_game = db.query(Game).filter(Game.game_is_active == True).first()
            if existing_active_game:
                raise HTTPException(status_code=400, detail=f"Нельзя создать активную игру. Уже есть активная игра: '{existing_active_game.name}'")

        if game_data.game_start >= game_data.game_end:
            raise HTTPException(status_code=400, detail="Дата начала должна быть раньше даты окончания")

        new_game = Game(**game_data.model_dump())
        db.add(new_game)
        db.commit()
        db.refresh(new_game)

        return new_game

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при создании игры: {str(e)}")

