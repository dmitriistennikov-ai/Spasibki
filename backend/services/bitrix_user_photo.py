from backend.bitrix_sdk.python_current_SDK import BitrixCurrent


async def get_user_photo(auth_id: str, refresh_id: str, domain: str, user_id: int):
    bx = BitrixCurrent(
        auth_id=auth_id,
        refresh_id=refresh_id,
        domain=domain,
    )

    user_data = await bx.call("user.get", {
        "ID": user_id,
    })

    if "result" not in user_data:
        raise ValueError(user_data.get("error_description", "Ошибка получения пользователя"))

    user_photo = user_data["result"][0]["PERSONAL_PHOTO"]
    if not user_photo:
        return None

    return user_photo
