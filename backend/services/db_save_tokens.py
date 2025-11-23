from sqlalchemy.orm import Session
from sqlalchemy import and_
from datetime import datetime, timedelta
from backend.models import BitrixAuth

def save_or_update_token(domain, user_id, member_id, auth_id, refresh_id, expires_in, status, db: Session):
    """Сохраняет или обновляет токены Bitrix пользователя"""

    token = db.query(BitrixAuth).filter(
        and_(
            BitrixAuth.user_id == user_id,
            BitrixAuth.member_id == member_id
        )
    ).first()

    if token:
        token.access_token = auth_id
        token.refresh_token = refresh_id
        token.expires_at = datetime.utcnow() + timedelta(seconds=int(expires_in))
        token.status = status
    else:
        token = BitrixAuth(
            domain=domain,
            user_id=user_id,
            member_id=member_id,
            access_token=auth_id,
            refresh_token=refresh_id,
            expires_at=datetime.utcnow() + timedelta(seconds=int(expires_in)),
            status=status,
        )
        db.add(token)

