from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.models import (
    LikeTransaction,
    Employee,
    Item,
    BuyTransaction,
    LikeHistoryResponse,
    UserLikesHistory,
    AllLikesHistory,
    AllLikeTransactionResponse,
    ActivityFeedRow,
    ActivityFeedResponse,
    LOCAL_OFFSET,
)
from backend.scripts.database import get_db

router = APIRouter()


@router.get("/api/user/{user_id}/likes", response_model=UserLikesHistory)
async def get_likes_history(user_id: int, limit: int = 50, offset: int = 0, db: Session = Depends(get_db)):
    likes = db.query(LikeTransaction).filter(
        (LikeTransaction.from_user_bitrix_id == user_id) |
        (LikeTransaction.to_user_bitrix_id == user_id)
    ).order_by(LikeTransaction.created_at.desc()).offset(offset).limit(limit).all()

    if not likes:
        return {"likes": [], "total_pages": 1}

    total_likes = db.query(LikeTransaction).filter(
        (LikeTransaction.from_user_bitrix_id == user_id) |
        (LikeTransaction.to_user_bitrix_id == user_id)
    ).count()

    total_pages = (total_likes + limit - 1) // limit

    result = []
    for like in likes:
        type_ = "sent" if like.from_user_bitrix_id == user_id else "received"
        from_user = db.query(Employee).filter_by(bitrix_id=like.from_user_bitrix_id).first()
        to_user = db.query(Employee).filter_by(bitrix_id=like.to_user_bitrix_id).first()

        result.append(LikeHistoryResponse(
            id=like.id,
            date=like.created_at,
            type=type_,
            from_user_bitrix_id=like.from_user_bitrix_id,
            to_user_bitrix_id=like.to_user_bitrix_id,
            msg=like.message,
            sticker_id=like.sticker_id,
            from_user_name=f"{from_user.name} {from_user.lastname}" if from_user else "Неизвестно",
            to_user_name=f"{to_user.name} {to_user.lastname}" if to_user else "Неизвестно",
        ))

    return {"likes": result, "total_pages": total_pages}


@router.get("/api/likes/feed", response_model=AllLikesHistory)
def get_all_likes_feed(
        db: Session = Depends(get_db),
        limit: int = 10,
        offset: int = 0,
):
    try:
        total_count = db.query(LikeTransaction).count()
        total_pages = (total_count + limit - 1) // limit

        likes_data = (
            db.query(
                LikeTransaction.id,
                LikeTransaction.created_at,
                Employee.name.label('from_user_name'),
                Employee.lastname.label('from_user_lastname'),
                Employee.photo_url.label('from_user_photo_url'),
                LikeTransaction.to_user_bitrix_id,
                LikeTransaction.from_user_bitrix_id,
                LikeTransaction.message.label('msg'),
                LikeTransaction.sticker_id,
            )
            .join(Employee, LikeTransaction.from_user_bitrix_id == Employee.bitrix_id, isouter=True)
            .order_by(LikeTransaction.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )

        likes_list = []

        for like in likes_data:
            to_user = db.query(Employee).filter_by(bitrix_id=like.to_user_bitrix_id).first()
            local_time = like.created_at + timedelta(hours=LOCAL_OFFSET)

            from_name = ""
            if like.from_user_name:
                from_name = f"{like.from_user_name} {like.from_user_lastname or ''}".strip()
            else:
                from_name = "Неизвестно"

            to_name = ""
            if to_user:
                to_name = f"{to_user.name} {to_user.lastname or ''}".strip()
            else:
                to_name = "Неизвестно"

            likes_list.append(
                AllLikeTransactionResponse(
                    id=like.id,
                    date=local_time,
                    from_user_bitrix_id=like.from_user_bitrix_id,
                    to_user_bitrix_id=like.to_user_bitrix_id,
                    from_user_name=from_name,
                    to_user_name=to_name,
                    from_user_photo_url=like.from_user_photo_url,
                    to_user_photo_url=to_user.photo_url if to_user else None,
                    msg=like.msg,
                    sticker_id=like.sticker_id,
                )
            )

        return AllLikesHistory(
            likes=likes_list,
            total_pages=total_pages
        )

    except Exception as e:
        print(f"Ошибка при получении ленты: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при загрузке истории Спасибок")


@router.get("/api/activity/feed", response_model=ActivityFeedResponse)
def get_activity_feed(
        db: Session = Depends(get_db),
        limit: int = 20,
        offset: int = 0,
):
    try:
        total_likes = db.query(LikeTransaction).count()
        total_purchases = db.query(BuyTransaction).count()
        total_count = total_likes + total_purchases
        total_pages = (total_count + limit - 1) // limit if total_count > 0 else 1

        likes_data = (
            db.query(
                LikeTransaction.id,
                LikeTransaction.created_at,
                Employee.name.label('from_user_name'),
                Employee.lastname.label('from_user_lastname'),
                Employee.photo_url.label('from_user_photo_url'),
                LikeTransaction.to_user_bitrix_id,
                LikeTransaction.from_user_bitrix_id,
                LikeTransaction.message.label('msg'),
                LikeTransaction.sticker_id,
            )
            .join(Employee, LikeTransaction.from_user_bitrix_id == Employee.bitrix_id, isouter=True)
            .order_by(LikeTransaction.created_at.desc())
            .all()
        )

        purchases_data = (
            db.query(
                BuyTransaction.id,
                BuyTransaction.created_at,
                BuyTransaction.buyer_id,
                BuyTransaction.amount_spent,
                Item.name.label('item_name'),
                Item.photo_url.label('item_photo_url'),
                Employee.name.label('buyer_name'),
                Employee.lastname.label('buyer_lastname'),
                Employee.photo_url.label('buyer_photo_url'),
            )
            .join(Item, BuyTransaction.item_id == Item.id, isouter=True)
            .join(Employee, BuyTransaction.buyer_id == Employee.bitrix_id, isouter=True)
            .order_by(BuyTransaction.created_at.desc())
            .all()
        )

        events: list[ActivityFeedRow] = []

        for like in likes_data:
            to_user = db.query(Employee).filter_by(bitrix_id=like.to_user_bitrix_id).first()
            local_time = like.created_at + timedelta(hours=LOCAL_OFFSET)

            from_name = (
                f"{like.from_user_name} {like.from_user_lastname or ''}".strip()
                if like.from_user_name else "Неизвестно"
            )
            to_name = (
                f"{to_user.name} {to_user.lastname or ''}".strip()
                if to_user else "Неизвестно"
            )

            events.append(ActivityFeedRow(
                id=like.id,
                event_type="thanks",
                date=local_time,
                from_user_bitrix_id=like.from_user_bitrix_id,
                to_user_bitrix_id=like.to_user_bitrix_id,
                from_user_name=from_name,
                to_user_name=to_name,
                from_user_photo_url=like.from_user_photo_url,
                to_user_photo_url=to_user.photo_url if to_user else None,
                msg=like.msg,
                sticker_id=like.sticker_id,
            ))

        for purchase in purchases_data:
            local_time = purchase.created_at + timedelta(hours=LOCAL_OFFSET)
            buyer_fullname = (
                f"{purchase.buyer_name or ''} {purchase.buyer_lastname or ''}".strip()
                or "Неизвестно"
            )

            events.append(ActivityFeedRow(
                id=purchase.id,
                event_type="purchase",
                date=local_time,
                buyer_id=purchase.buyer_id,
                buyer_name=buyer_fullname,
                buyer_photo_url=purchase.buyer_photo_url,
                item_name=purchase.item_name or "Товар",
                item_photo_url=purchase.item_photo_url,
                amount_spent=purchase.amount_spent,
            ))

        events.sort(key=lambda e: (e.date, e.id), reverse=True)
        page_slice = events[offset:offset + limit]

        return ActivityFeedResponse(
            events=page_slice,
            total_pages=total_pages,
        )

    except Exception as e:
        print(f"Ошибка при получении общей ленты: {e}")
        raise HTTPException(status_code=500, detail="Ошибка при загрузке ленты активности")
