from backend.bitrix_sdk.python_current_SDK import BitrixCurrent

async def get_current_user(auth_id: str, refresh_id: str, domain: str):
    """Получает информацию о текущем пользователе из Bitrix24"""
    bx = BitrixCurrent(
        auth_id=auth_id,
        refresh_id=refresh_id,
        domain=domain,
    )

    current_user = await bx.call("user.current")

    if "result" not in current_user:
        raise ValueError(current_user.get("error_description", "Ошибка получения пользователя"))

    return current_user["result"]
