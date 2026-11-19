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


def init_db_schema():
    """Initializes tables and migrates missing columns in SQLite if needed"""
    Base.metadata.create_all(bind=engine)
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        try:
            with engine.connect() as conn:
                from sqlalchemy import inspect, text
                inspector = inspect(engine)
                if inspector.has_table("predictions"):
                    existing_cols = [c["name"] for c in inspector.get_columns("predictions")]
                    new_cols = {
                        "model_version": "VARCHAR DEFAULT 'SBP-v1.0'",
                        "input_data_json": "TEXT",
                        "actual_priority": "VARCHAR",
                        "verified_by": "VARCHAR",
                        "verified_at": "DATETIME",
                        "is_verified": "BOOLEAN DEFAULT 0",
                        "used_in_retraining": "BOOLEAN DEFAULT 0"
                    }
                    for col_name, col_type in new_cols.items():
                        if col_name not in existing_cols:
                            conn.execute(text(f"ALTER TABLE predictions ADD COLUMN {col_name} {col_type}"))
                    conn.commit()
        except Exception as e:
            print(f"Database schema migration warning: {e}")


# Run schema initialization automatically
init_db_schema()


def get_db():
    """FastAPI Dependency to yield a database session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

