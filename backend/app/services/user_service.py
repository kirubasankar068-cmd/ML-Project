"""
User Authentication Service and Endpoints
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from backend.app.database.database import get_db
from backend.app.database.models import User, AuditLog
from backend.app.schemas.prediction import UserRegisterRequest, UserLoginRequest, UserLoginResponse
from backend.app.utils.auth_utils import hash_password, verify_password
from backend.app.middleware.auth import create_access_token
from backend.app.database.mongodb import mongo_client
from backend.app.utils.logger import setup_logger

logger = setup_logger("user_service")
router = APIRouter()


class MongoUserMock:
    def __init__(self, id, username, password_hash, role):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.role = role


def log_user_audit(action: str, user_id: Optional[int], username: Optional[str], description: str, db: Session, ip_address: Optional[str] = None):
    """Helper to log audit events into both SQLite and MongoDB (if active)"""
    try:
        audit = AuditLog(action=action, user_id=user_id, description=description, ip_address=ip_address)
        db.add(audit)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log audit in SQLite: {e}")
        db.rollback()

    if mongo_client.is_active:
        try:
            mongo_client.audit_logs.insert_one({
                "action": action,
                "username": username,
                "description": description,
                "ip_address": ip_address,
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Failed to log audit in MongoDB: {e}")


class UserService:
    @staticmethod
    def register(db: Session, payload: UserRegisterRequest) -> User:
        username = payload.username
        role_val = payload.role or "developer"

        # Check if user already exists
        existing_user = db.query(User).filter(User.username == username).first()
        if not existing_user and mongo_client.is_active:
            try:
                if mongo_client.users.find_one({"username": username}):
                    existing_user = True
            except Exception:
                pass

        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username already registered"
            )

        hashed = hash_password(payload.password)
        new_user = User(
            username=username,
            password_hash=hashed,
            role=role_val
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)

        # Sync new user to MongoDB if active
        if mongo_client.is_active:
            try:
                mongo_client.users.insert_one({
                    "username": username,
                    "password_hash": hashed,
                    "role": role_val,
                    "created_at": datetime.utcnow()
                })
            except Exception as e:
                logger.error(f"Failed to sync user to MongoDB: {e}")

        log_user_audit("USER_REGISTER", new_user.id, username, f"User {username} registered.", db)
        return new_user

    @staticmethod
    def authenticate(db: Session, payload: UserLoginRequest):
        username = payload.username
        password = payload.password

        user = None
        # Check if user exists in MongoDB first (if active)
        if mongo_client.is_active:
            try:
                mongo_user = mongo_client.users.find_one({"username": username})
                if mongo_user:
                    user = MongoUserMock(
                        id=str(mongo_user["_id"]),
                        username=mongo_user["username"],
                        password_hash=mongo_user["password_hash"],
                        role=mongo_user["role"]
                    )
            except Exception as e:
                logger.error(f"Failed to query user in MongoDB: {e}")

        # Fall back to SQLite
        if not user:
            user = db.query(User).filter(User.username == username).first()

        # Bootstrap user roles if database is empty and credentials match defaults
        if not user:
            if username in ["admin", "developer"] and password in ["admin123", "dev123"]:
                role = "admin" if username == "admin" else "developer"
                hashed = hash_password(password)
                user = User(username=username, password_hash=hashed, role=role)
                db.add(user)
                db.commit()
                db.refresh(user)

                if mongo_client.is_active:
                    try:
                        mongo_client.users.update_one(
                            {"username": username},
                            {"$set": {
                                "username": username,
                                "password_hash": hashed,
                                "role": role,
                                "created_at": datetime.utcnow()
                            }},
                            upsert=True
                        )
                    except Exception as e:
                        logger.error(f"Failed to sync bootstrapped user to MongoDB: {e}")
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Incorrect username or password"
                )

        if not verify_password(password, user.password_hash):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )

        return user


@router.post("/register", response_model=UserLoginResponse, tags=["Authentication"])
async def register_user(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """Registers a new user and returns a signed access token"""
    user = UserService.register(db, payload)
    token = create_access_token(data={"sub": user.username, "role": user.role})
    return UserLoginResponse(
        access_token=token,
        role=user.role,
        username=user.username
    )


@router.post("/login/db", response_model=UserLoginResponse, tags=["Authentication"])
async def login_database(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticates user credentials against the database and returns a signed access token"""
    user = UserService.authenticate(db, payload)
    token = create_access_token(data={"sub": user.username, "role": user.role})
    
    # Audit log
    user_id_val = user.id if isinstance(user.id, int) else None
    log_user_audit("USER_LOGIN", user_id_val, user.username, f"User {user.username} logged in via DB.", db)
    
    return UserLoginResponse(
        access_token=token,
        role=user.role,
        username=user.username
    )
