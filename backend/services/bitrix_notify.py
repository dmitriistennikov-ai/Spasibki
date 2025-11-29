import asyncio

from sqlalchemy.orm import Session

from backend.bitrix_sdk.python_current_SDK import BitrixCurrent
from backend.services.db_get_tokens import get_tokens


async def send_bitrix_notification(from_user_id: int, to_user_id: int, db: Session):
    tokens = await asyncio.to_thread(get_tokens, from_user_id, db)

    if not tokens:
        return None

    bx = BitrixCurrent(
        auth_id=tokens.access_token,
        refresh_id=tokens.refresh_token,
        domain=tokens.domain,
    )
    message = f"❤️ Вам поставили лайк!"

    await bx.call('im.notify.system.add', {'USER_ID': to_user_id, 'MESSAGE': message})

    return dict(status=200, message="Уведомление отправлено!")