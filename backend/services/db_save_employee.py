from backend.scripts.database import SessionLocal
from backend.models import Employee
from sqlalchemy.orm import Session



def save_or_update_employees(users: list[dict], db: Session) -> int:
    """
    Создаёт или обновляет сотрудников списком.
    Возвращает количество обработанных записей.
    """
    count = 0
    for data in users:
        # print(data)
        bitrix_id = data.get("ID")
        # print(bitrix_id)
        if not bitrix_id:
            continue

        user = db.query(Employee).filter(Employee.bitrix_id == bitrix_id).first()

        email = data.get("EMAIL", "")
        position = data.get("WORK_POSITION", "")

        if user:
            user.name = data.get("NAME", user.name)
            user.lastname = data.get("LAST_NAME", user.lastname)
            user.email = email
            user.position = position
        else:
            user = Employee(
                bitrix_id=bitrix_id,
                name=data.get("NAME", ""),
                lastname=data.get("LAST_NAME", ""),
                email=email,
                position=position,
                is_gamer=True,
            )
            db.add(user)
        print(f'Добавил {data.get('NAME')}')
        count += 1

    db.commit()
    return count
