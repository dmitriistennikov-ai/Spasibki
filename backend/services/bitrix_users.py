from backend.bitrix_sdk.python_current_SDK import BitrixCurrent

async def get_all_users(auth_id: str, refresh_id: str, domain: str) -> list[dict]:
    try:
        bx = BitrixCurrent(
            auth_id=auth_id,
            refresh_id=refresh_id,
            domain=domain,
        )

        all_users = []
        start = 0

        while True:
            users_batch = await bx.call("user.get", {
                "start": start,
                "ACTIVE": True,
                "USER_TYPE": "employee",
            })

            batch_result = users_batch.get("result", [])

            if not batch_result:
                break

            all_users.extend(batch_result)
            start += len(batch_result)

            if len(batch_result) < 50:
                break

        return all_users

    except Exception as e:
        print("Ошибка Bitrix user.get:", e)
        return []

