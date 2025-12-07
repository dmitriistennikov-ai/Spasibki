import asyncio

from sqlalchemy.orm import Session

from backend.bitrix_sdk.python_current_SDK import BitrixCurrent
from backend.services.db_get_tokens import get_tokens
from backend.services.db_get_employee import get_admins, get_employee_by_bitrix_id


async def send_bitrix_notification(from_user_id: int, to_user_id: int, db: Session):
    tokens = await asyncio.to_thread(get_tokens, from_user_id, db)

    if not tokens:
        return None

    bx = BitrixCurrent(
        auth_id=tokens.access_token,
        refresh_id=tokens.refresh_token,
        domain=tokens.domain,
    )
    message = f"❤️ Вам поставили лайк в приложении Спасибки!"

    await bx.call('im.notify.system.add', {'USER_ID': to_user_id, 'MESSAGE': message})

    return dict(status=200, message="Уведомление отправлено!")


async def send_bitrix_purchase_notification(from_user_id: int, db: Session):
    tokens = await asyncio.to_thread(get_tokens, from_user_id, db)
    if not tokens:
        return None

    from_user = await asyncio.to_thread(get_employee_by_bitrix_id, from_user_id, db)
    if not from_user:
        return None
    
    from_user_name = f'{from_user.name} {from_user.lastname}'

    to_user_list = await asyncio.to_thread(get_admins, db)
    to_user_ids = [user.bitrix_id for user in to_user_list]

    bx = BitrixCurrent(
        auth_id=tokens.access_token,
        refresh_id=tokens.refresh_token,
        domain=tokens.domain,
    )
    message = f"🛒 {from_user_name} совершил покупку в приложении Спасибки!"

    for to_user_id in to_user_ids:
        await bx.call('im.notify.system.add', {'USER_ID': to_user_id, 'MESSAGE': message})

    return dict(status=200, message="Уведомление отправлено!")

