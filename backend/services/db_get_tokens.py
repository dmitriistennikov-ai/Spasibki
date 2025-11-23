from sqlalchemy.orm import Session
from backend.scripts.database import SessionLocal
from backend.models import BitrixAuth


def get_tokens(user_id: int, db: Session) -> BitrixAuth | None:
    return db.query(BitrixAuth).filter_by(user_id=user_id).first()


