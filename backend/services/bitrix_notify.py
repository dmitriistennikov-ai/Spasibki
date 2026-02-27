import asyncio
import logging

from sqlalchemy.orm import Session

from backend.bitrix_sdk.python_current_SDK import BitrixCurrent
from backend.models import BitrixAuth
from backend.services.db_get_tokens import get_tokens
from backend.services.db_get_employee import get_admins, get_employee_by_bitrix_id

logger = logging.getLogger(__name__)


def _get_latest_portal_token(db: Session) -> BitrixAuth | None:
    return (
        db.query(BitrixAuth)
        .order_by(BitrixAuth.created_at.desc())
        .first()
    )


async def _send_system_notify_with_token(token: BitrixAuth, to_user_id: int, message: str):
    bx = BitrixCurrent(
        auth_id=token.access_token,
        refresh_id=token.refresh_token,
        domain=token.domain,
    )
    return await bx.call('im.notify.system.add', {'USER_ID': to_user_id, 'MESSAGE': message})


async def send_bitrix_notification(from_user_id: int, to_user_id: int, db: Session):
    message = "❤️ Вам отправили Спасибку!"
    tried_user_ids = []
    candidates: list[BitrixAuth] = []

    sender_tokens = await asyncio.to_thread(get_tokens, from_user_id, db)
    if sender_tokens:
        candidates.append(sender_tokens)
        tried_user_ids.append(from_user_id)

    if to_user_id != from_user_id:
        receiver_tokens = await asyncio.to_thread(get_tokens, to_user_id, db)
        if receiver_tokens:
            candidates.append(receiver_tokens)
            tried_user_ids.append(to_user_id)

    if not candidates:
        latest_token = await asyncio.to_thread(_get_latest_portal_token, db)
        if latest_token:
            candidates.append(latest_token)

    if not candidates:
        logger.warning(
            "Bitrix notification skipped: no saved tokens found (from_user_id=%s, to_user_id=%s)",
            from_user_id,
            to_user_id,
        )
        return {"status": 204, "message": "Нет токенов для отправки уведомления"}

    last_error = None
    for token in candidates:
        try:
            result = await _send_system_notify_with_token(token, to_user_id, message)
        except Exception as exc:
            last_error = str(exc)
            logger.exception(
                "Bitrix notification request failed (domain=%s, token_user_id=%s, to_user_id=%s)",
                getattr(token, "domain", None),
                getattr(token, "user_id", None),
                to_user_id,
            )
            continue

        if isinstance(result, dict) and result.get("error"):
            last_error = f"{result.get('error')}: {result.get('error_description', '')}".strip()
            logger.warning(
                "Bitrix notification rejected (domain=%s, token_user_id=%s, to_user_id=%s): %s",
                getattr(token, "domain", None),
                getattr(token, "user_id", None),
                to_user_id,
                result,
            )
            continue

        logger.info(
            "Bitrix notification sent (token_user_id=%s -> to_user_id=%s)",
            getattr(token, "user_id", None),
            to_user_id,
        )
        return {"status": 200, "message": "Уведомление отправлено!", "provider_result": result}

    return {
        "status": 502,
        "message": "Bitrix не принял уведомление",
        "detail": last_error or "Неизвестная ошибка",
    }


async def send_bitrix_purchase_notification(from_user_id: int, item_name: str, db: Session):
    tokens = await asyncio.to_thread(get_tokens, from_user_id, db)
    if not tokens:
        return None

    from_user = await asyncio.to_thread(get_employee_by_bitrix_id, from_user_id, db)
    if not from_user:
        return None
    
    from_user_name = f"{(from_user.name or '').strip()} {(from_user.lastname or '').strip()}".strip() or str(from_user_id)

    to_user_list = await asyncio.to_thread(get_admins, db)
    to_user_ids = [user.bitrix_id for user in to_user_list]

    safe_item_name = (item_name or "").strip() or "товар"
    message = f"🛒 {from_user_name} купил(а) {safe_item_name} в приложении Спасибки."

    for to_user_id in to_user_ids:
        result = await _send_system_notify_with_token(tokens, to_user_id, message)
        if isinstance(result, dict) and result.get("error"):
            logger.warning(
                "Bitrix purchase notification rejected (token_user_id=%s, to_user_id=%s): %s",
                from_user_id,
                to_user_id,
                result,
            )

    return dict(status=200, message="Уведомление отправлено!")

