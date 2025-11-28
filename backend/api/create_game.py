from fastapi import APIRouter, HTTPException, Depends
from backend.scripts.database import SessionLocal, get_db
from .. models import Game, GameUpdate, GameResponse
from datetime import datetime
from pydantic import BaseModel
from sqlalchemy.orm import Session
from backend.services.db_search_active_game import search_active_game

router = APIRouter()


# @router.patch("/api/update_game/{game_id}")
# def update_game(game_id: int, game_update: GameUpdate, db: Session = Depends(get_db)):
#     try:
#         game_for_update = db.query(Game).filter(Game.id == game_id).first()
#         if not game_for_update:
#             raise HTTPException(status_code=404, detail="Игра не найдена")
#         if game_update.game_is_active:
#             existing_active_game = db.query(Game).filter(
#             Game.game_is_active == True,
#                 Game.id != game_id,
#         ).first()
#         if existing_active_game:
#             raise HTTPException(status_code=400, detail="Нельзя активировать игру. Уже есть активная игра")
#
#         if game_update.game_start and game_update.game_end:
#             if game_update.game_start >= game_update.game_end:
#                 raise HTTPException(
#                     status_code=400,
#                     detail="Дата начала должна быть раньше даты завершения"
#                 )
#
#         update_data = game_update.dict(exclude_unset=True)
#         for field, value in update_data.items():
#             setattr(game_for_update, field, value)
#
#         db.commit()
#         db.refresh(game_for_update)
#
#         return game_for_update
#
#     except HTTPException:
#         raise
#     except Exception as e:
#         db.rollback()
#         raise HTTPException(status_code=500, detail=f"Ошибка при обновлении игры: {str(e)}")






# @router.post("/api/create_game")
# async def create_game(request: GameCreateRequest, db: Session = Depends(get_db)):
#     active_game = search_active_game(db)
#     if active_game:
#         raise HTTPException(status_code=400, detail="Уже существует активная игра")
#
#     try:
#         game = Game(
#             name=request.name,
#             description=request.description,
#             game_start=request.game_start,
#             game_end=request.game_end,
#             setting_limitParameter=request.setting_limitParameter,
#             setting_limitValue=request.setting_limitValue,
#             game_is_active=request.game_is_active,
#         )
#         db.add(game)
#         db.commit()
#         db.refresh(game)
#
#         return {"message": "Новая игра создана", "game_id": game.id}
#
#     except Exception as e:
#         db.rollback()
#         import traceback
#         print("🔥 Ошибка при создании игры:", e)
#         traceback.print_exc()
#         raise HTTPException(500, detail=f"Ошибка создания: {str(e)}")


