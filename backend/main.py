from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from backend.api.create_game import router as create_game_router
from backend.api.games import router as games_router
from backend.api.install import router as install_router
from backend.api.items import router as items_router
from backend.api.like import router as like_router
from backend.api.likes_history import router as likes_history_router
from backend.api.likes_info import router as likes_info_router
from backend.api.user import router as user_router
from backend.api.users import router as users_router
from backend.scripts.database import Base, engine, SessionLocal
from backend.services.bitrix_user import get_current_user
from backend.services.db_save_employee import save_or_update_employees
from backend.services.db_save_tokens import save_or_update_token

app = FastAPI()

app.include_router(install_router)
app.include_router(users_router)
app.include_router(like_router)
app.include_router(user_router)
app.include_router(create_game_router)
app.include_router(games_router)
app.include_router(likes_info_router)
app.include_router(likes_history_router)
app.include_router(items_router)

# Base.metadata.drop_all(engine)
Base.metadata.create_all(bind=engine)

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / "frontend"
app.mount("/frontend", StaticFiles(directory=str(FRONTEND_DIR)), name="frontend")

@app.post("/")
async def root(request: Request):
    form = await request.form()
    data = dict(form)
    domain = data.get("DOMAIN") or request.query_params.get("DOMAIN")
    auth_id = data.get("AUTH_ID")
    refresh_id = data.get("REFRESH_ID")
    expires_in = data.get("AUTH_EXPIRES", 3600)
    member_id = data.get("member_id")
    status = data.get("status")

    current_user_data = await get_current_user(auth_id, refresh_id, domain)
    user_id = current_user_data["ID"]

    db = SessionLocal()
    try:
        save_or_update_employees([current_user_data], db)
        save_or_update_token(domain, user_id, member_id, auth_id, refresh_id, expires_in, status, db)
        db.commit()

    except Exception as e:
        db.rollback()
        raise e

    finally:
        db.close()

    html = f"""
        <script>
          window.location.href = '/frontend/base.html?user_id={user_id}&domain={domain}';
        </script>
        """

    return HTMLResponse(content=html)




