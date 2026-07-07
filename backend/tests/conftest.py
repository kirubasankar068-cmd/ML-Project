import pytest
from unittest.mock import MagicMock, patch

# Global Mocking of mongo_client and gemini_service before importing any app components
import backend.app.database.mongodb
mock_mongo_client = MagicMock()
mock_mongo_client.is_active = False
mock_mongo_client.predictions = MagicMock()
mock_mongo_client.users = MagicMock()
mock_mongo_client.uploaded_files = MagicMock()
mock_mongo_client.model_metrics = MagicMock()
mock_mongo_client.audit_logs = MagicMock()
backend.app.database.mongodb.mongo_client = mock_mongo_client

import backend.app.services.gemini_service
mock_gemini_service = MagicMock()
mock_gemini_service.enabled = True
mock_gemini_service.analyze_bug.return_value = {
    "priority": "High",
    "confidence": 0.85,
    "explanation": "Gemini verified this bug violates authentication constraints.",
    "recommended_action": "High Priority: Include in active sprint backlog.",
    "estimated_fix_time": "1 day",
    "affected_modules": ["Authentication_core"]
}
backend.app.services.gemini_service.gemini_service = mock_gemini_service

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.main import app
from backend.app.database.database import Base, get_db
from backend.app.database.models import User

# Test SQLite in-memory database
SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="session", autouse=True)
def init_test_db():
    """Initializes tables in the in-memory database"""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def db_session():
    """Provides a transactional database session for a test function"""
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    
    yield session
    
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture(scope="function", autouse=True)
def override_db(db_session):
    """Overrides the FastAPI get_db dependency for the duration of the test"""
    def _override_get_db():
        try:
            yield db_session
        finally:
            pass
            
    app.dependency_overrides[get_db] = _override_get_db
    yield
    del app.dependency_overrides[get_db]


@pytest.fixture(scope="function")
def client(override_db):
    """Provides a FastAPI TestClient"""
    return TestClient(app)


@pytest.fixture(scope="function", autouse=True)
def mock_mongo():
    """Provides the mocked MongoDB client singleton"""
    mock_mongo_client.is_active = False
    mock_mongo_client.predictions.reset_mock()
    mock_mongo_client.users.reset_mock()
    mock_mongo_client.uploaded_files.reset_mock()
    mock_mongo_client.model_metrics.reset_mock()
    mock_mongo_client.audit_logs.reset_mock()
    yield mock_mongo_client


@pytest.fixture(scope="function", autouse=True)
def mock_gemini():
    """Provides the mocked GeminiService singleton"""
    mock_gemini_service.enabled = True
    mock_gemini_service.analyze_bug.reset_mock()
    mock_gemini_service.analyze_bug.return_value = {
        "priority": "High",
        "confidence": 0.85,
        "explanation": "Gemini verified this bug violates authentication constraints.",
        "recommended_action": "High Priority: Include in active sprint backlog.",
        "estimated_fix_time": "1 day",
        "affected_modules": ["Authentication_core"]
    }
    yield mock_gemini_service
