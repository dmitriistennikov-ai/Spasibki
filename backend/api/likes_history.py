from datetime import datetime
from typing import Literal
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models import LikeTransaction, Employee
from backend.scripts.database import get_db

router = APIRouter()

class LikeHistoryResponse(BaseModel):
    id: int
    date: datetime
    type: Literal["sent", "received"]
    from_user_bitrix_id: int
    to_user_bitrix_id: int
    msg: Optional[str] = None
    from_user_name: str
    to_user_name: str

    class Config:
        from_attributes = True


@router.get("/api/user/{user_id}/likes", response_model=dict)
async def get_likes_history(user_id: int, limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    likes = db.query(LikeTransaction).filter(
        (LikeTransaction.from_user_bitrix_id == user_id) |
        (LikeTransaction.to_user_bitrix_id == user_id)
    ).order_by(LikeTransaction.created_at.desc()).offset(offset).limit(limit).all()

    if not likes:
        return {"likes": [], "total_pages": 1}

    total_likes = db.query(LikeTransaction).filter(
        (LikeTransaction.from_user_bitrix_id == user_id) |
        (LikeTransaction.to_user_bitrix_id == user_id)
    ).count()

    total_pages = (total_likes + limit - 1) // limit  # Количество страниц

    result = []
    for like in likes:
        type_ = "sent" if like.from_user_bitrix_id == user_id else "received"
        from_user = db.query(Employee).filter_by(bitrix_id=like.from_user_bitrix_id).first()
        to_user = db.query(Employee).filter_by(bitrix_id=like.to_user_bitrix_id).first()

        result.append(LikeHistoryResponse(
            id=like.id,
            date=like.created_at,
            type=type_,
            from_user_bitrix_id=like.from_user_bitrix_id,
            to_user_bitrix_id=like.to_user_bitrix_id,
            msg=like.message,
            from_user_name=f"{from_user.name} {from_user.lastname}" if from_user else "Неизвестно",
            to_user_name=f"{to_user.name} {to_user.lastname}" if to_user else "Неизвестно",
        ))

    return {"likes": result, "total_pages": total_pages}
