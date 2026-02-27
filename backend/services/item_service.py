import logging
from pathlib import Path

from fastapi import HTTPException, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from backend.models import Item, Employee, BuyTransaction
from backend.services.event_log import (
    EVENT_ITEM_CREATED,
    EVENT_ITEM_PURCHASED,
    TARGET_ITEM,
    log_event,
)

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

        buyer_name = f"{(buyer_query.name or '').strip()} {(buyer_query.lastname or '').strip()}".strip() or f"Пользователь {buyer_id}"
        item_name = item_query.name or f"товар #{item_id}"
        log_event(
            db,
            event_type=EVENT_ITEM_PURCHASED,
            actor_bitrix_id=buyer_id,
            target_type=TARGET_ITEM,
            target_id=item_id,
            target_name_snapshot=item_name,
            message=f"{buyer_name} купил(а) {item_name} в приложении Спасибки.",
            payload={
                "buyer_id": buyer_id,
                "buyer_name": buyer_name,
                "item_id": item_id,
                "item_name": item_name,
                "price": int(amount_spent),
                "coins_after_purchase": int(buyer_query.coins),
                "stock_after_purchase": int(item_query.stock),
            },
        )

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


def create_item_service(db: Session, item_data: dict, actor_bitrix_id: int | None = None) -> Item:
    try:
        new_item = Item(**item_data)
        db.add(new_item)
        db.flush()
        log_event(
            db,
            event_type=EVENT_ITEM_CREATED,
            actor_bitrix_id=actor_bitrix_id,
            target_type=TARGET_ITEM,
            target_id=new_item.id,
            target_name_snapshot=new_item.name,
            message=f"Создан товар «{new_item.name}»",
            payload={
                "id": new_item.id,
                "name": new_item.name,
                "description": new_item.description,
                "price": new_item.price,
                "stock": new_item.stock,
                "is_active": new_item.is_active,
                "photo_url": new_item.photo_url,
            },
        )
        db.commit()
        db.refresh(new_item)
        return new_item

    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Некорректные данные: {str(e)}")

    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"SQLAlchemy error при создании товара: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка БД при создании товара")
    except Exception as e:
        db.rollback()
        logger.exception(f"Неизвестная ошибка при создании товара: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Ошибка при создании товара")


def save_file(target_path: Path, contents: bytes):
    try:
        with open(target_path, "wb") as f:
            f.write(contents)
    except Exception as e:
        logger.error(f"Ошибка записи файла {target_path}: {repr(e)}")

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Не удалось сохранить файл",
        )
