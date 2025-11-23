from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from backend.models import Item, ItemCreate, ItemUpdate, ItemResponse, BuyTransaction, BuyTransactionResponse, \
    BuyTransactionCreate, Employee
from backend.scripts.database import get_db
from typing import List
from sqlalchemy import func, extract, and_


router = APIRouter()

@router.get("/api/show-items", response_model=list[ItemResponse])
async def get_show_items(db: Session = Depends(get_db)):

    available_items = db.query(Item).filter(
        Item.is_active == True,
        Item.stock > 0
    ).all()

    return available_items


@router.post("/api/buy-item", response_model=BuyTransactionResponse)
async def buy_item(item: BuyTransactionCreate, db: Session = Depends(get_db)):

    needed_item = (db.query(Item).filter(
        Item.id == item.item_id,
        Item.stock > 0,
        Item.is_active == True
    ).first())

    if not needed_item:
        raise HTTPException(status_code=400, detail="Данный товар недоступен")

    buyer = db.query(Employee).filter(Employee.bitrix_id == item.buyer_id).first()

    if not buyer:
        raise HTTPException(status_code=404, detail="Покупатель не найден")

    current_balance = buyer.coins

    if current_balance < item.amount_spent:
        raise HTTPException(status_code=400, detail="Недостаточно средств")

    try:
        needed_item.stock -= 1
        buyer.coins -= item.amount_spent
        new_buy_transaction = BuyTransaction(**item.model_dump())
        db.add(new_buy_transaction)
        db.commit()
        db.refresh(new_buy_transaction)

        return new_buy_transaction

    except SQLAlchemyError as e:
        db.rollback()
        print("DB error in /api/buy-item:", repr(e))
        raise HTTPException(status_code=500, detail=f"Ошибка БД при покупке: {e}")

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Ошибка при покупке")

@router.post("/api/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    try:
        new_item = Item(**item.model_dump())
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        return new_item
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Некорректные данные: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при создании товара: {str(e)}")


@router.get("/api/items", response_model=List[ItemResponse])
def list_items(db: Session = Depends(get_db)):
    items = db.query(Item).order_by(Item.id.desc()).all()
    return items


@router.patch("/api/items/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    item_update: ItemUpdate,
    db: Session = Depends(get_db),
):
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if db_item is None:
        raise HTTPException(status_code=404, detail="Товар не найден")

    data = item_update.model_dump(exclude_unset=True)

    if not data:
        return db_item

    try:
        for field, value in data.items():
            setattr(db_item, field, value)

        db.commit()
        db.refresh(db_item)
        return db_item

    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"Некорректные данные: {str(e)}")
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при обновлении товара: {str(e)}")


@router.delete("/api/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
):
    db_item = db.query(Item).filter(Item.id == item_id).first()
    if db_item is None:
        raise HTTPException(status_code=404, detail="Товар не найден")

    try:
        db.delete(db_item)
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Ошибка при удалении товара: {str(e)}")