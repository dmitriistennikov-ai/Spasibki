
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.scripts.database import get_db
from ..models import Employee

router = APIRouter()


@router.get("/api/user")
async def get_user(user_id: int, db: Session = Depends(get_db)):

    user = db.query(Employee).filter_by(bitrix_id=user_id).first()

    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    return {
        "name": user.name,
        "lastname": user.lastname,
        "position": user.position,
        "email": user.email,
        "likes": user.likes,
        "coins": user.coins,
        "is_admin": user.is_admin,
        "photo_url": user.photo_url,
    }