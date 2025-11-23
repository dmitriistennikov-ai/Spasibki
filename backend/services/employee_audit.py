from typing import Dict, Any
from sqlalchemy.orm import Session
from backend.models import Employee, EmployeeAudit


ALLOWED_EMPLOYEE_FIELDS = ("name", "lastname", "coins", "is_gamer", "is_admin")


def build_employee_changes(employee: Employee, data: Dict[str, Any]) -> Dict[str, dict]:
    """
    Собирает словарь изменений по полям из data относительно текущего employee.
    Формат:
    {
      "coins": {"old": 10, "new": 25},
      "is_admin": {"old": False, "new": True}
    }
    """
    changes: Dict[str, dict] = {}

    for field, new_value in data.items():
        if field not in ALLOWED_EMPLOYEE_FIELDS:
            continue

        old_value = getattr(employee, field, None)
        if old_value != new_value:
            changes[field] = {
                "old": old_value,
                "new": new_value,
            }

    return changes


def log_employee_audit(
    db: Session,
    employee: Employee,
    admin_bitrix_id: int,
    changes: Dict[str, dict],
) -> None:
    """
    Создаёт запись в таблице employee_audit, если есть изменения.
    """
    if not changes:
        return

    entry = EmployeeAudit(
        employee_id=employee.id,
        changed_by_bitrix_id=admin_bitrix_id,
        changes=changes,
    )
    db.add(entry)
