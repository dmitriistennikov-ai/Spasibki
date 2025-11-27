from fastapi import APIRouter, HTTPException, status, Depends
from sqlalchemy.orm import Session

from backend.models import Employee, EmployeeUpdate, EmployeeShortResponse
from backend.scripts.database import get_db
from backend.services.bitrix_users import get_all_users as get_all_users_from_bitrix
from backend.services.db_get_tokens import get_tokens
from backend.services.db_save_employee import save_or_update_employees
from backend.services.employee_audit import build_employee_changes, log_employee_audit

router = APIRouter()

@router.get("/api/users")
async def get_all_users(
    limit: int = 0,
    offset: int = 0,
    only_gamers: bool = False,
    db: Session = Depends(get_db),
):
    """
    Список сотрудников
    - если limit == 0 → вернуть всех (для модалки "Отправить Спасибку" и других мест)
    - если limit > 0 → вернуть страницу с offset/limit (для настроек)
    - only_gamers = true → вернуть только тех, у кого is_gamer = True
    """

    query = db.query(Employee)

    if only_gamers:
        query = query.filter(Employee.is_gamer.is_(True))

    if limit > 0:
        query = query.offset(offset).limit(limit)

    users = query.all()

    return [
        {
            "bitrix_id": user.bitrix_id,
            "name": user.name,
            "lastname": user.lastname,
            "likes": user.likes,
            "coins": user.coins,
            "is_gamer": user.is_gamer,
            "is_admin": user.is_admin,
            "photo_url": user.photo_url
        }
        for user in users
    ]


@router.post("/api/all_users")
async def update_users(user_id: int, db: Session = Depends(get_db)):
    """
    Обновляет список сотрудников из Bitrix24.
    """
    try:
        tokens = get_tokens(user_id, db)
        if not tokens:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Нет сохранённых токенов для этого пользователя")

        users = await get_all_users_from_bitrix(auth_id = tokens.access_token, refresh_id = tokens.refresh_token, domain = tokens.domain)

        if not users:
            raise HTTPException(status_code=400, detail="Ошибка при запросе к API Битрикс24 или пустой ответ")

        updated_count = save_or_update_employees(users, db)

        return {
            "message": "Список сотрудников обновлён",
            "count": updated_count,
        }

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка при обновлении сотрудников",
        )


@router.patch("/api/users/{bitrix_id}", response_model=EmployeeShortResponse)
async def update_employee(
    bitrix_id: int,
    payload: EmployeeUpdate,
    admin_id: int,
    db: Session = Depends(get_db),
):
    """
    Обновление сотрудника по bitrix_id.
    Разрешено менять только: name, lastname, coins, is_gamer, is_admin.
    Пишем аудит-лог в employee_audit.
    """
    employee = (
        db.query(Employee)
        .filter(Employee.bitrix_id == bitrix_id)
        .first()
    )

    if employee is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Сотрудник не найден",
        )

    data = payload.model_dump(exclude_unset=True)

    if not data:
        return employee

    changes = build_employee_changes(employee, data)

    if not changes:
        return employee

    try:
        log_employee_audit(
            db=db,
            employee=employee,
            admin_bitrix_id=admin_id,
            changes=changes,
        )

        for field, value in data.items():
            if field in ("name", "lastname", "coins", "is_gamer", "is_admin"):
                setattr(employee, field, value)

        db.commit()
        db.refresh(employee)
        return employee

    except Exception as e:
        db.rollback()
        print("Ошибка при обновлении сотрудника:", e)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Ошибка при обновлении сотрудника",
        )
