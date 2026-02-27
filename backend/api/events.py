from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.models import Employee, SystemEvent, SystemEventsPage
from backend.scripts.database import get_db

router = APIRouter()


def require_superadmin(user_id: int, db: Session) -> Employee:
    user = db.query(Employee).filter(Employee.bitrix_id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Пользователь не найден")
    if not bool(getattr(user, "is_superadmin", False)):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Доступ только для суперадминистратора")
    return user


@router.get("/api/events", response_model=SystemEventsPage)
def get_system_events(
    user_id: int,
    page: int = 1,
    limit: int = 15,
    db: Session = Depends(get_db),
):
    if page < 1:
        page = 1
    if limit < 1:
        limit = 15
    if limit > 100:
        limit = 100

    require_superadmin(user_id, db)

    total = db.query(SystemEvent).count()
    total_pages = (total + limit - 1) // limit if total > 0 else 1
    if page > total_pages:
        page = total_pages
    offset = (page - 1) * limit

    rows = (
        db.query(SystemEvent)
        .order_by(SystemEvent.created_at.desc(), SystemEvent.id.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return SystemEventsPage(
        events=rows,
        total=total,
        page=page,
        size=limit,
        total_pages=total_pages,
    )

