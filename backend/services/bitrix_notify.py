from backend.bitrix_sdk.python_current_SDK import BitrixCurrent
from backend.services.db_get_tokens import get_tokens
from sqlalchemy.orm import Session

async def send_bitrix_notification(from_user_id: int, to_user_id: int, db: Session):
    """
    Отправляет системное уведомление пользователю Bitrix24.
    """
    tokens = get_tokens(from_user_id, db)
    if not tokens:
        print("❌ Нет токенов для пользователя:", from_user_id)
        return None

    bx = BitrixCurrent(
        auth_id=tokens.access_token,
        refresh_id=tokens.refresh_token,
        domain=tokens.domain,
    )
    message = f"❤️ Вам поставили лайк!"

    await bx.call('im.notify.system.add', {'USER_ID': to_user_id, 'MESSAGE': message})

    return dict(status=200, message="Уведомление отправлено!")