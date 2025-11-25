from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Employee


def save_or_update_employees(users: list[dict], db: Session) -> int:
    """
    Создаёт или обновляет сотрудников списком.
    Возвращает количество обработанных записей.
    """
    count = 0

    employee_count = db.query(func.count(Employee.id)).scalar()

    for data in users:
        bitrix_id = data.get("ID")
        if not bitrix_id:
            continue

        user = db.query(Employee).filter(Employee.bitrix_id == bitrix_id).first()

        email = data.get("EMAIL", "")
        position = data.get("WORK_POSITION", "")
        photo_url = data.get("PERSONAL_PHOTO", "")

        if user:
            user.name = data.get("NAME", user.name)
            user.lastname = data.get("LAST_NAME", user.lastname)
            user.email = email
            user.position = position
            user.photo_url = photo_url
        else:
            is_admin = employee_count == 0

            user = Employee(
                bitrix_id=bitrix_id,
                name=data.get("NAME", ""),
                lastname=data.get("LAST_NAME", ""),
                email=email,
                position=position,
                is_gamer=True,
                is_admin=is_admin,
                photo_url=photo_url,
            )
            db.add(user)
            employee_count += 1
        print(f'Добавил {data.get('NAME')}')
        count += 1

    db.commit()
    return count
