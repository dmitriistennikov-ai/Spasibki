import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, or_, desc
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.models import (
    Game,
    GameParticipant,
    Employee,
    LikeTransaction,
    GameResponse,
    GameUpdate,
    GameCreate,
    GameRatingRow,
    OverallRatingResponse,
    MonthlyTopResponse,
    MonthlyTopRow,
)
from backend.scripts.database import get_db
from backend.scripts.time_utils import LOCAL_TZ
from backend.services.event_log import (
    EVENT_GAME_CREATED,
    EVENT_GAME_DELETED,
    EVENT_GAME_UPDATED,
    TARGET_GAME,
    log_event,
)

router = APIRouter()

logger = logging.getLogger(__name__)


def game_snapshot(game: Game, participant_ids: list[int] | None = None) -> dict:
    return {
        "id": int(game.id),
        "name": game.name,
        "description": game.description,
        "game_start": game.game_start.isoformat() if game.game_start else None,
        "game_end": game.game_end.isoformat() if game.game_end else None,
        "game_is_active": bool(game.game_is_active),
        "setting_limitParameter": (
            game.setting_limitParameter.value
            if getattr(game, "setting_limitParameter", None) is not None
            else None
        ),
        "setting_limitValue": int(game.setting_limitValue or 0),
        "setting_limitToOneUser": int(game.setting_limitToOneUser or 0),
        "participant_ids": sorted(int(x) for x in (participant_ids if participant_ids is not None else list(game.participant_ids))),
    }


def normalize_and_validate_participant_ids(db: Session, participant_ids: list[int] | None) -> list[int]:
    if participant_ids is None:
        return []

    normalized: list[int] = []
    seen = set()
    for raw_id in participant_ids:
        try:
            bitrix_id = int(raw_id)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Некорректный список участников")
        if bitrix_id <= 0:
            raise HTTPException(status_code=400, detail="Некорректный список участников")
        if bitrix_id in seen:
            continue
        seen.add(bitrix_id)
        normalized.append(bitrix_id)

    if not normalized:
        return []

    allowed_rows = (
        db.query(Employee.bitrix_id)
        .filter(
            Employee.bitrix_id.in_(normalized),
            Employee.is_gamer.is_(True),
        )
        .all()
    )
    allowed_ids = {row.bitrix_id for row in allowed_rows}
    invalid_ids = [eid for eid in normalized if eid not in allowed_ids]
    if invalid_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Нельзя добавить участников: сотрудники недоступны для игр ({', '.join(map(str, invalid_ids))})",
        )

    return normalized


def replace_game_participants(db: Session, game_id: int, participant_ids: list[int]) -> None:
    db.query(GameParticipant).filter(GameParticipant.game_id == game_id).delete(synchronize_session=False)
    if participant_ids:
        db.add_all([
            GameParticipant(game_id=game_id, employee_bitrix_id=bitrix_id)
            for bitrix_id in participant_ids
        ])


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


def calc_monthly_top_active_game(db: Session, limit: int = 3) -> MonthlyTopResponse:
    active_game = (
        db.query(Game)
        .filter(Game.game_is_active.is_(True))
        .first()
    )

    now_local = datetime.now(LOCAL_TZ)
    period_start_local = now_local.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if period_start_local.month == 12:
        next_month_local = period_start_local.replace(
            year=period_start_local.year + 1,
            month=1,
        )
    else:
        next_month_local = period_start_local.replace(month=period_start_local.month + 1)

    # Timestamps in DB are stored as naive datetimes and treated as UTC in the app.
    period_start_utc = period_start_local.astimezone(timezone.utc).replace(tzinfo=None)
    next_month_utc = next_month_local.astimezone(timezone.utc).replace(tzinfo=None)

    rows = (
        db.query(
            Employee.bitrix_id,
            Employee.photo_url,
            Employee.name,
            Employee.lastname,
            func.count(LikeTransaction.id).label("received"),
        )
        .join(LikeTransaction, LikeTransaction.to_user_bitrix_id == Employee.bitrix_id)
        .filter(
            LikeTransaction.created_at >= period_start_utc,
            LikeTransaction.created_at < next_month_utc,
        )
        .group_by(
            Employee.bitrix_id,
            Employee.photo_url,
            Employee.name,
            Employee.lastname,
        )
        .order_by(
            desc(func.count(LikeTransaction.id)),
            Employee.lastname.asc(),
            Employee.name.asc(),
        )
        .limit(limit)
        .all()
    )

    leaders = [
        MonthlyTopRow(
            bitrix_id=row.bitrix_id,
            photo_url=row.photo_url,
            fio=f"{(row.lastname or '').strip()} {(row.name or '').strip()}".strip() or "Без имени",
            received=row.received,
            place=index,
        )
        for index, row in enumerate(rows, start=1)
    ]

    return MonthlyTopResponse(
        has_active_game=active_game is not None,
        game_id=active_game.id if active_game else None,
        game_name=active_game.name if active_game else "",
        period_start=period_start_local.replace(tzinfo=None),
        period_end=now_local.replace(tzinfo=None),
        leaders=leaders,
    )


@router.get("/api/rating/overall", response_model=OverallRatingResponse)
def get_overall_rating_route(
        page: int = 1,
        limit: int = 5,
        db: Session = Depends(get_db)
):
    return calc_overall_rating(db, page=page, limit=limit)


@router.get("/api/rating/monthly-top-active-game", response_model=MonthlyTopResponse)
def get_monthly_top_active_game(db: Session = Depends(get_db)):
    return calc_monthly_top_active_game(db, limit=3)


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
def update_game(
    game_id: int,
    payload: GameUpdate,
    admin_id: int | None = None,
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Игра не найдена",
        )

    data = payload.model_dump(exclude_unset=True)
    participant_ids_raw = data.pop("participant_ids", None)
    participant_ids = None
    if participant_ids_raw is not None:
        participant_ids = normalize_and_validate_participant_ids(db, participant_ids_raw)

    before = game_snapshot(game)

    if (data.get("game_start") is not None and data.get("game_end") is not None and
            data.get("game_start") >= data.get("game_end")):
        raise HTTPException(status_code=400, detail="Дата начала должна быть раньше даты завершения")

    elif data.get("game_start") is not None and data.get("game_start") >= game.game_end:
        raise HTTPException(status_code=400, detail="Новая дата начала должна быть раньше текущей даты завершения")

    elif data.get("game_end") is not None and data.get("game_end") <= game.game_start:
        raise HTTPException(status_code=400, detail="Новая дата завершения должна быть позже текущей даты начала")

    if data.get("game_is_active") is True:
        db.query(Game).filter(
            Game.id != game_id,
            Game.game_is_active.is_(True)
        ).update({Game.game_is_active: False})

    for field, value in data.items():
        setattr(game, field, value)

    if participant_ids is not None:
        replace_game_participants(db, game.id, participant_ids)

    effective_participants = participant_ids if participant_ids is not None else before["participant_ids"]
    after = game_snapshot(game, participant_ids=effective_participants)
    changed_fields = [field for field in data.keys() if before.get(field) != after.get(field)]
    if participant_ids is not None and before.get("participant_ids") != after.get("participant_ids"):
        changed_fields.append("participant_ids")

    if changed_fields:
        log_event(
            db,
            event_type=EVENT_GAME_UPDATED,
            actor_bitrix_id=admin_id,
            target_type=TARGET_GAME,
            target_id=game.id,
            target_name_snapshot=game.name,
            message=f"Изменена игра «{game.name}»",
            payload={
                "before": before,
                "after": after,
                "changed_fields": changed_fields,
            },
        )

    try:
        db.commit()
        db.refresh(game)
        return game
    except Exception:
        logger.exception(f"Ошибка БД при обновлении игры ID {game_id}.")
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Ошибка при обновлении игры",
        )

@router.delete("/api/games/{game_id}")
def delete_game(game_id: int, admin_id: int | None = None, db: Session = Depends(get_db)):

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
        snapshot = game_snapshot(game)
        log_event(
            db,
            event_type=EVENT_GAME_DELETED,
            actor_bitrix_id=admin_id,
            target_type=TARGET_GAME,
            target_id=game.id,
            target_name_snapshot=game.name,
            message=f"Удалена игра «{game.name}»",
            payload={"snapshot": snapshot},
        )
        db.delete(game)
        db.commit()
    except IntegrityError:
        logger.exception(f"Ошибка БД при удалении игры ID {game_id}.")
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Нельзя удалить игру, по которой уже есть Спасибки",
        )

    return


@router.post("/api/games", status_code=status.HTTP_201_CREATED, response_model=GameResponse)
def create_game(game_data: GameCreate, admin_id: int | None = None, db: Session = Depends(get_db)):
    if game_data.game_start >= game_data.game_end:
        raise HTTPException(status_code=400, detail="Дата начала должна быть раньше даты завершения")

    if game_data.game_is_active:
        existing_active_game = db.query(Game).filter(Game.game_is_active.is_(True)).first()
        if existing_active_game:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Нельзя создать активную игру. Уже есть активная игра: '{existing_active_game.name}'"
            )

    try:
        payload = game_data.model_dump()
        participant_ids = normalize_and_validate_participant_ids(db, payload.pop("participant_ids", []))

        new_game = Game(**payload)
        db.add(new_game)
        db.flush()

        replace_game_participants(db, new_game.id, participant_ids)

        log_event(
            db,
            event_type=EVENT_GAME_CREATED,
            actor_bitrix_id=admin_id,
            target_type=TARGET_GAME,
            target_id=new_game.id,
            target_name_snapshot=new_game.name,
            message=f"Создана игра «{new_game.name}»",
            payload=game_snapshot(new_game, participant_ids=participant_ids),
        )

        db.commit()
        db.refresh(new_game)

        return new_game

    except Exception:
        logger.exception("Ошибка при создании игры в БД.")
        db.rollback()

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при создании игры из-за внутренней проблемы сервера."
        )
