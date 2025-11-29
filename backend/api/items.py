import asyncio
import uuid
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response, status, UploadFile, File
from sqlalchemy.orm import Session

from backend.models import Item, ItemCreate, ItemUpdate, ItemResponse, BuyTransactionResponse, \
    BuyTransactionCreate
from backend.scripts.database import get_db
from backend.services.item_service import execute_buy_transaction, create_item_service, save_file

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[2]
STATIC_DIR = BASE_DIR / "static"
ITEMS_UPLOAD_DIR = STATIC_DIR / "uploads" / "items"
ITEMS_UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


@router.get("/api/show-items", response_model=list[ItemResponse])
async def get_show_items(db: Session = Depends(get_db)):

    available_items = db.query(Item).filter(
        Item.is_active == True,
        Item.stock > 0
    ).all()

    return available_items

@router.post("/api/buy-item", response_model=BuyTransactionResponse)
async def buy_item(item: BuyTransactionCreate, db: Session = Depends(get_db)):

    try:
        new_transaction = await asyncio.to_thread(
            execute_buy_transaction,
            db,
            item.item_id,
            item.buyer_id,
            item.amount_spent
        )

        return new_transaction

    except HTTPException as e:
        raise e

    except Exception as e:
        raise HTTPException(status_code=500, detail="Ошибка покупки")


@router.post("/api/items", response_model=ItemResponse, status_code=status.HTTP_201_CREATED)
async def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    item_data = item.model_dump()

    try:
        new_item = await asyncio.to_thread(create_item_service, db, item_data)

        return new_item

    except HTTPException:
        raise


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


@router.post("/api/items/upload-image")
async def upload_item_image(file: UploadFile = File(...)):

    allowed_content_types = {
        "image/jpeg", "image/png", "image/webp", "image/gif",
    }

    if file.content_type not in allowed_content_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Допустимы только изображения (jpeg, png, webp, gif)",
        )

    ext = Path(file.filename or "").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4().hex}{ext}"
    target_path = ITEMS_UPLOAD_DIR / filename

    contents = await file.read()

    try:
        await asyncio.to_thread(save_file, target_path, contents)

    except HTTPException:
        raise

    public_url = f"/static/uploads/items/{filename}"

    return {"url": public_url}
