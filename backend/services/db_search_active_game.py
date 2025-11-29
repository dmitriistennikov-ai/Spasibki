from sqlalchemy.orm import Session

from backend.models import Game


def search_active_game(db: Session):

    return db.query(Game).filter(Game.game_is_active == True).first()




