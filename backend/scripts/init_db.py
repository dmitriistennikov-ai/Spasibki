from database import Base, engine

print("Создаю таблицы...")
Base.metadata.create_all(bind=engine)
print("✅ Готово! База данных создана.")

