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

    result = user_data.get("result") or []
    if not result:
        return None

    user = result[0] or {}
    photo = user.get("PERSONAL_PHOTO")
    
    return photo or None
