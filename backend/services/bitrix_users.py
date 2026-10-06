import httpx


async def get_all_users(auth_id: str, domain: str) -> list[dict]:
    all_users: list[dict] = []
    total: int | None = None
    url = f"https://{domain}/rest/user.get.json"

    async with httpx.AsyncClient(timeout=30.0) as client:
        while total is None or len(all_users) < total:
            response = await client.post(
                url,
                json={
                    "auth": auth_id,
                    "filter": {"USER_TYPE": "employee"},
                    "start": len(all_users),
                },
            )
            response.raise_for_status()
            payload = response.json()

            if not isinstance(payload, dict):
                raise ValueError("Bitrix user.get returned an invalid response")
            if payload.get("error"):
                raise ValueError(f"Bitrix user.get failed: {payload['error']}")

            batch = payload.get("result")
            page_total = payload.get("total")
            if not isinstance(batch, list) or type(page_total) is not int:
                raise ValueError("Bitrix user.get returned an incomplete response")
            if total is None:
                total = page_total
            elif total != page_total:
                raise ValueError("Bitrix user.get total changed during pagination")
            if (not batch and len(all_users) < total) or len(all_users) + len(batch) > total:
                raise ValueError("Bitrix user.get did not return all employees")

            all_users.extend(batch)

    return all_users
