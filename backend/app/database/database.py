import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

from backend.app.config.settings import settings

# Retrieve connection string from settings
SQLALCHEMY_DATABASE_URL = settings.DATABASE_URL

# Handle sqlite specific threading constraint
connect_args = {}
if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
    connect_args["check_same_thread"] = False
    # Make sure parent directories exist for SQLite file
    db_file_path = SQLALCHEMY_DATABASE_URL.replace("sqlite:///", "")
    os.makedirs(os.path.dirname(os.path.abspath(db_file_path)), exist_ok=True)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """FastAPI Dependency to yield a database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
