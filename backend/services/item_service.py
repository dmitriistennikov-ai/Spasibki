import logging

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models import Item, Employee, BuyTransaction

logger = logging.getLogger(__name__)


def execute_buy_transaction(db: Session, item_id: int, buyer_id: int, amount_spent: float):
    try:
        item_query = db.query(Item).filter(
            Item.id == item_id,
            Item.is_active == True
        ).with_for_update().first()

        if not item_query:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Товар не найден или неактивен"
            )

        if item_query.stock <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Товар закончился"
            )

        buyer_query = db.query(Employee).filter(
            Employee.bitrix_id == buyer_id
        ).with_for_update().first()

        if not buyer_query:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Покупатель не найден"
            )

        if buyer_query.coins < amount_spent:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Недостаточно средств"
            )

        item_query.stock -= 1
        buyer_query.coins -= amount_spent

        new_buy_transaction = BuyTransaction(
            item_id=item_id,
            buyer_id=buyer_id,
            amount_spent=amount_spent
        )
        db.add(new_buy_transaction)

        db.commit()
        db.refresh(new_buy_transaction)

        logger.info(f"Покупка успешна: User {buyer_id} купил Item {item_id}")
        return new_buy_transaction

    except HTTPException:
        db.rollback()
        raise

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"DB Error при покупке товара: {repr(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Внутренняя ошибка базы данных при обработке покупки."
        )

    except Exception as e:
        db.rollback()
        logger.exception(f"Неизвестная ошибка при покупке товара: {repr(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Неизвестная ошибка сервера."
        )
