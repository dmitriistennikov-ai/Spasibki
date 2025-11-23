from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Enum, Index, Text, func
from sqlalchemy import JSON
from sqlalchemy.orm import relationship
from enum import Enum as PyEnum
from datetime import datetime, timedelta
from backend.scripts.database import Base
from pydantic import BaseModel, Field, validator, ConfigDict
from decimal import Decimal
from typing import Optional
LOCAL_OFFSET = 5

# --- 1. Таблица для авторизации / токенов Bitrix24 ---
class BitrixAuth(Base):
    __tablename__ = "bitrix_auth"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("employees.id"), nullable=True)
    member_id = Column(String, index=True)
    status = Column(String, nullable=True)
    domain = Column(String, nullable=True)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    expires_at = Column(DateTime, default=lambda: datetime.utcnow() + timedelta(hours=1))
    created_at = Column(DateTime, default=datetime.utcnow)

    # связь с сотрудником (один-к-одному)
    employee = relationship("Employee", back_populates="auth")


# --- 2. Таблица сотрудников ---
class Employee(Base):
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True, index=True)
    bitrix_id = Column(Integer, unique=True, nullable=False)
    name = Column(String, nullable=False)
    lastname = Column(String, nullable=False)
    position = Column(String, nullable=True)
    email = Column(String, nullable=True)
    likes = Column(Integer, default=0)
    coins = Column(Integer, nullable=False, default=0)
    is_gamer = Column(Boolean, default=True, nullable=False)
    is_admin = Column(Boolean, default=False, nullable=False)

    auth = relationship("BitrixAuth", uselist=False, back_populates="employee")

class EmployeeShortResponse(BaseModel):
    bitrix_id: int
    name: str
    lastname: str
    coins: int
    is_gamer: bool
    is_admin: bool

    model_config = ConfigDict(from_attributes=True)

class EmployeeUpdate(BaseModel):
    name: Optional[str] = Field(
        None, min_length=1, max_length=100, description="Имя сотрудника"
    )
    lastname: Optional[str] = Field(
        None, min_length=1, max_length=100, description="Фамилия сотрудника"
    )
    coins: Optional[int] = Field(
        None, ge=0, le=1_000_000_000, description="Баланс монет"
    )
    is_gamer: Optional[bool] = Field(
        None, description="Принимает ли участие в играх"
    )
    is_admin: Optional[bool] = Field(
        None, description="Имеет ли расширенные права доступа"
    )

class EmployeeAudit(Base):
    __tablename__ = "employee_audit"

    id = Column(Integer, primary_key=True, index=True)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    changed_by_bitrix_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    changes = Column(JSON, nullable=False)
    employee = relationship("Employee", backref="audits")


# --- 3. Таблица транзакций лайков ---
class LikeTransaction(Base):
    __tablename__ = "like_transactions"

    id = Column(Integer, primary_key=True, index=True)
    from_user_bitrix_id = Column(Integer, ForeignKey("employees.bitrix_id"), nullable=True)
    to_user_bitrix_id = Column(Integer, ForeignKey("employees.bitrix_id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=lambda: datetime.utcnow() + timedelta(hours=LOCAL_OFFSET))
    game_id = Column(Integer, ForeignKey("games.id"), nullable=True)
    message = Column(Text, nullable=True)

    from_user = relationship("Employee", foreign_keys=[from_user_bitrix_id], lazy="joined", overlaps="to_user")
    to_user = relationship("Employee", foreign_keys=[to_user_bitrix_id], lazy="joined", overlaps="from_user")
    game = relationship("Game", back_populates="likes")

    __table_args__ = (
        Index('ix_like_transactions_from_user_game', 'from_user_bitrix_id', 'game_id'),
        Index('ix_like_transactions_to_user_game', 'to_user_bitrix_id', 'game_id'),
        Index('ix_like_transactions_created_game', 'created_at', 'game_id'),
    )

# --- 4. Таблица игры ---
class LimitParameter(PyEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"
    GAME = "game"

class Game(Base):
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    game_start = Column(DateTime, default=datetime.utcnow)
    game_end = Column(DateTime, nullable=False)
    game_is_active = Column(Boolean, default=False)
    setting_limitParameter = Column(Enum(LimitParameter), nullable=False)
    setting_limitValue = Column(Integer, default=1)
    setting_limitToOneUser = Column(Integer, default=1, nullable=False)

    likes = relationship("LikeTransaction", back_populates="game")


class GameResponse(BaseModel):
    id: int
    name: str
    description: str | None
    game_start: datetime | None = None
    game_end: datetime | None = None
    game_is_active: bool
    setting_limitParameter: str | None = None
    setting_limitValue: int | None = None
    setting_limitToOneUser: int | None = None

    class Config:
        from_attributes = True

class GameUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    game_start: Optional[datetime] = None
    game_end: Optional[datetime] = None
    game_is_active: Optional[bool] = None
    setting_limitParameter: Optional[LimitParameter] = None
    setting_limitValue: Optional[int] = None
    setting_limitToOneUser: Optional[int] = None

    class Config:
        from_attributes = True

class GameCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название игры")
    description: Optional[str] = Field(None, max_length=500, description="Описание игры")
    game_start: datetime = Field(..., description="Дата и время начала игры")
    game_end: datetime = Field(..., description="Дата и время окончания игры")
    game_is_active: bool = Field(False, description="Активна ли игра")
    setting_limitParameter: LimitParameter = Field(..., description="Период для ограничения спасибок", examples=["day", "week", "month", "game"])
    setting_limitValue: int = Field(default=1, ge=1, le=1000, description="Максимальное количество спасибок за период")
    setting_limitToOneUser: int = Field(default=2, ge=1, le=100, description="Максимальное количество спасибок одному пользователю")


# --- 5. Таблица Товар ---
class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Integer, nullable=False)
    stock = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, default=True)

class ItemCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Название товара")
    description: Optional[str] = Field(None, max_length=500, description="Описание товара")
    price: int = Field(..., ge=0, le=100000000, description="Цена товара")
    stock: int = Field(default=0, ge=0, le=1000000, description="Количество на складе")
    is_active: bool = Field(default=True, description="Активен ли товар")

class ItemUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Название товара")
    description: Optional[str] = Field(None, max_length=500, description="Описание товара")
    price: Optional[int] = Field(None, ge=0, le=100000000, description="Цена товара")
    stock: Optional[int] = Field(None, ge=0, le=1000000, description="Количество на складе")
    is_active: Optional[bool] = Field(None, description="Активен ли товар")

class ItemResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    price: int
    stock: int
    is_active: bool

    model_config = ConfigDict(from_attributes=True)

# --- 6. Таблица покупок  ---
class BuyTransaction(Base):
    __tablename__ = "buy_transactions"

    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(Integer, ForeignKey("employees.bitrix_id"), nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    amount_spent = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

class BuyTransactionCreate(BaseModel):
    buyer_id: int
    item_id: int
    amount_spent: int


class BuyTransactionResponse(BaseModel):
    id: int
    buyer_id: int
    item_id: int
    amount_spent: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)