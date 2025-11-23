
import httpx

class BitrixCurrent:
    """
    Класс-обёртка для вызовов Bitrix24 от имени конкретного пользователя.
    """

    def __init__(self, auth_id: str, refresh_id: str, domain: str, app_sid: str = ""):
        """
        auth_id — токен пользователя (ACCESS_TOKEN)
        refresh_id — токен обновления
        domain — домен портала Bitrix24 (например, b24-xxx.bitrix24.ru)
        app_sid — внутренний идентификатор приложения
        """
        self.access_token = auth_id
        self.refresh_token = refresh_id
        self.domain = domain
        self.app_sid = app_sid

    async def call(self, method: str, params: dict = None):
        """
        Выполняет REST-запрос к Bitrix24 от имени текущего пользователя.
        """
        if params is None:
            params = {}

        url = f"https://{self.domain}/rest/{method}.json"

        async with httpx.AsyncClient() as client:
            response = await client.post(url, data={**params, "auth": self.access_token})
            return response.json()