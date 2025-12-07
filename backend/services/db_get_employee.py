from sqlalchemy.orm import Session
from backend.models import Employee

def get_admins(db: Session):
    return db.query(Employee).filter(Employee.is_admin == True).all()

def get_employee_by_bitrix_id(bitrix_id: int, db: Session):
    return db.query(Employee).filter(Employee.bitrix_id == bitrix_id).first()