from datetime import datetime, time, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from backend.models import Employee, Game, GameParticipant


def _bitrix_active(value: object) -> bool:
    normalized = str(value).strip().lower()
    if normalized in ("true", "1", "y"):
        return True
    if normalized in ("false", "0", "n"):
        return False
    raise ValueError("Bitrix24 did not provide a valid ACTIVE status")


def save_or_update_employees(
    users: list[dict], db: Session, *, sync_bitrix_status: bool = False
) -> int:
    """
    Создаёт или обновляет сотрудников списком.
    Возвращает количество обработанных записей.
    """
    count = 0
    statuses: dict[int, bool] = {}
    if sync_bitrix_status:
        for data in users:
            if not isinstance(data, dict) or not data.get("ID"):
                raise ValueError("Bitrix24 returned an employee without an ID")
            bitrix_id = int(data["ID"])
            if bitrix_id <= 0 or bitrix_id in statuses:
                raise ValueError("Bitrix24 returned an invalid or duplicate employee ID")
            statuses[bitrix_id] = _bitrix_active(data.get("ACTIVE"))

    employee_count = db.query(func.count(Employee.id)).scalar() or 0

    for data in users:
        bitrix_id = data.get("ID")
        if not bitrix_id:
            continue

        bitrix_id = int(bitrix_id)
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
            if sync_bitrix_status:
                user.bitrix_active = statuses[bitrix_id]
        else:
            is_admin = employee_count == 0

            user = Employee(
                bitrix_id=bitrix_id,
                name=data.get("NAME", ""),
                lastname=data.get("LAST_NAME", ""),
                email=email,
                position=position,
                is_gamer=True,
                bitrix_active=statuses[bitrix_id] if sync_bitrix_status else True,
                is_admin=is_admin,
                photo_url=photo_url,
            )
            db.add(user)
            employee_count += 1
        count += 1

    if sync_bitrix_status:
        inactive_ids = [bitrix_id for bitrix_id, active in statuses.items() if not active]
        if inactive_ids:
            cutoff = datetime.combine(datetime.now(timezone.utc).date(), time.min)
            unfinished_game_ids = db.query(Game.id).filter(Game.game_end >= cutoff)
            db.query(GameParticipant).filter(
                GameParticipant.employee_bitrix_id.in_(inactive_ids),
                GameParticipant.game_id.in_(unfinished_game_ids),
            ).delete(synchronize_session=False)

    db.commit()
    return count
