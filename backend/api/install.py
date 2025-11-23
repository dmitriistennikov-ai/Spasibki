from fastapi import APIRouter, Request
from fastapi.responses import HTMLResponse
import json

router = APIRouter()

@router.post("/install", response_class=HTMLResponse)
async def install_app(request: Request):
    data = await request.form()
    print("Install data:", data)

    domain = request.query_params.get("DOMAIN")
    app_sid = request.query_params.get("APP_SID")
    print("Query params:", dict(request.query_params))

    # Сохраняем данные авторизации из запроса
    settings = {
        "access_token": data.get("AUTH_ID"),
        "refresh_token": data.get("REFRESH_ID"),
        "application_token": app_sid,
        "domain": domain,
    }



    html = """
        <html>
          <head>
            <script src="//api.bitrix24.com/api/v1/"></script>
            <script>
              BX24.init(function(){
                  BX24.installFinish();
              });
            </script>
          </head>
          <body>
            <h3>✅ Установка приложения завершена</h3>
          </body>
        </html>
        """
    return HTMLResponse(content=html)

