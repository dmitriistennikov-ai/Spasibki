from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from backend.models import Employee, SystemEvent

EVENT_GAME_CREATED = "game_created"
EVENT_GAME_UPDATED = "game_updated"
EVENT_GAME_DELETED = "game_deleted"
EVENT_ITEM_CREATED = "item_created"
EVENT_ITEM_UPDATED = "item_updated"
EVENT_ITEM_DELETED = "item_deleted"
EVENT_ITEM_PURCHASED = "item_purchased"
EVENT_EMPLOYEE_COINS_CHANGED = "employee_coins_changed"

TARGET_GAME = "game"
TARGET_ITEM = "item"
TARGET_EMPLOYEE = "employee"
TARGET_PURCHASE = "purchase"


def employee_full_name(employee: Employee | None) -> str:
    if not employee:
        return "Неизвестный пользователь"
    full_name = f"{(employee.name or '').strip()} {(employee.lastname or '').strip()}".strip()
    return full_name or f"Пользователь {employee.bitrix_id}"


def resolve_actor_name_snapshot(db: Session, actor_bitrix_id: int | None) -> str:
    if actor_bitrix_id is None:
        return "Система"
    employee = db.query(Employee).filter(Employee.bitrix_id == actor_bitrix_id).first()
    if not employee:
        return f"Пользователь {actor_bitrix_id}"
    return employee_full_name(employee)


def make_json_safe(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): make_json_safe(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [make_json_safe(v) for v in value]
    return str(value)


def log_event(
    db: Session,
    *,
    event_type: str,
    actor_bitrix_id: int | None,
    target_type: str,
    target_id: int | None,
    message: str,
    target_name_snapshot: str | None = None,
    payload: dict[str, Any] | None = None,
    actor_name_snapshot: str | None = None,
) -> SystemEvent:
    entry = SystemEvent(
        event_type=event_type,
        actor_bitrix_id=actor_bitrix_id,
        actor_name_snapshot=actor_name_snapshot or resolve_actor_name_snapshot(db, actor_bitrix_id),
        target_type=target_type,
        target_id=target_id,
        target_name_snapshot=target_name_snapshot,
        message=message,
        payload=make_json_safe(payload) if payload is not None else None,
    )
    db.add(entry)
    return entry

