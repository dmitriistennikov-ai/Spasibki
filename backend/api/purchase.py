from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from backend.models import BuyTransaction, Item
from backend.scripts.database import get_db

router = APIRouter()


class PurchaseHistoryResponse(BaseModel):
    id: int
    item_name: str
    item_photo_url: Optional[str]
    amount_spent: int
    created_at: datetime

    class Config:
        from_attributes = True


class PurchaseHistoryPage(BaseModel):
    purchases: List[PurchaseHistoryResponse]
    total: int
    page: int
    size: int
    total_pages: int


@router.get("/api/user/{user_id}/purchases", response_model=PurchaseHistoryPage)
async def get_user_purchases(
        user_id: int,
        page: int = Query(1, ge=1),
        limit: int = Query(5, ge=1, le=50),
        db: Session = Depends(get_db)
):
    offset = (page - 1) * limit

    # Базовый запрос: покупки пользователя + данные о товаре
    query = db.query(BuyTransaction, Item) \
        .join(Item, BuyTransaction.item_id == Item.id) \
        .filter(BuyTransaction.buyer_id == user_id)

    # Считаем общее количество для пагинации
    total_count = query.count()

    # Получаем записи с сортировкой (сначала новые)
    results = query.order_by(BuyTransaction.created_at.desc()) \
        .offset(offset) \
        .limit(limit) \
        .all()

    # Формируем ответ
    purchases_list = []
    for buy_tx, item in results:
        purchases_list.append(PurchaseHistoryResponse(
            id=buy_tx.id,
            item_name=item.name,
            item_photo_url=item.photo_url,
            amount_spent=buy_tx.amount_spent,
            created_at=buy_tx.created_at
        ))

    import math
    total_pages = math.ceil(total_count / limit) if total_count > 0 else 1

    return PurchaseHistoryPage(
        purchases=purchases_list,
        total=total_count,
        page=page,
        size=limit,
        total_pages=total_pages
    )
