import math

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from backend.models import BuyTransaction, Item, PurchaseHistoryPage, PurchaseHistoryResponse, AllPurchasesPage, \
    AllPurchasesRow, Employee
from backend.scripts.database import get_db
from backend.scripts.time_utils import to_local_time

router = APIRouter()


@router.get("/api/user/{user_id}/purchases", response_model=PurchaseHistoryPage)
async def get_user_purchases(
        user_id: int,
        page: int = Query(1, ge=1),
        limit: int = Query(5, ge=1, le=50),
        db: Session = Depends(get_db)
):
    offset = (page - 1) * limit

    query = db.query(BuyTransaction, Item) \
        .join(Item, BuyTransaction.item_id == Item.id) \
        .filter(BuyTransaction.buyer_id == user_id)

    total_count = query.count()

    results = query.order_by(BuyTransaction.created_at.desc()) \
        .offset(offset) \
        .limit(limit) \
        .all()

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


@router.get("/api/purchases", response_model=AllPurchasesPage)
async def get_all_purchases(
        page: int = Query(1, ge=1),
        limit: int = Query(20, ge=1, le=100),
        db: Session = Depends(get_db),
):
    offset = (page - 1) * limit

    query = (
        db.query(BuyTransaction, Item, Employee)
        .join(Item, BuyTransaction.item_id == Item.id)
        .join(Employee, BuyTransaction.buyer_id == Employee.bitrix_id)
    )

    total_count = query.count()

    results = (
        query.order_by(BuyTransaction.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    purchases_list: list[AllPurchasesRow] = []

    for buy_tx, item, employee in results:
        purchases_list.append(
            AllPurchasesRow(
                id=buy_tx.id,
                buyer_name=employee.name,
                buyer_lastname=employee.lastname,
                item_name=item.name,
                amount_spent=buy_tx.amount_spent,
                created_at=to_local_time(buy_tx.created_at),
            )
        )

    total_pages = math.ceil(total_count / limit) if total_count > 0 else 1

    return AllPurchasesPage(
        purchases=purchases_list,
        total=total_count,
        page=page,
        size=limit,
        total_pages=total_pages,
    )
