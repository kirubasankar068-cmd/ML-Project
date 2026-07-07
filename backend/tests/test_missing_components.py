"""
Unit and Integration Tests for Newly Added Components (20 Test Cases)
"""

import json
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.utils.auth_utils import hash_password, verify_password
from backend.app.services.user_service import UserService
from backend.app.schemas.prediction import UserRegisterRequest, UserLoginRequest, PredictionReviewAction
from backend.app.database.models import User, Prediction


# ==========================================
# 1. AUTH UTILS TESTS (3 cases)
# ==========================================

def test_auth_utils_hash_password():
    """Test 1: Verify hash_password creates a valid bcrypt hash"""
    password = "secret_password"
    hashed = hash_password(password)
    assert hashed != password
    assert hashed.startswith(("$2a$", "$2b$", "$2y$"))


def test_auth_utils_verify_password_bcrypt():
    """Test 2: Verify verify_password correctly matches bcrypt hashed passwords"""
    password = "secret_password"
    hashed = hash_password(password)
    assert verify_password(password, hashed) is True
    assert verify_password("wrong_password", hashed) is False


def test_auth_utils_verify_password_plain_text():
    """Test 3: Verify verify_password falls back to plain-text check for legacy systems"""
    password = "plain_password"
    assert verify_password(password, password) is True
    assert verify_password(password, "wrong_password") is False


# ==========================================
# 2. USER SERVICE TESTS (6 cases)
# ==========================================

def test_user_service_register_success(db_session: Session):
    """Test 4: Verify UserService.register successfully creates a hashed user in SQLite"""
    payload = UserRegisterRequest(username="new_user", password="new_password_123", role="developer")
    user = UserService.register(db_session, payload)
    assert user.username == "new_user"
    assert user.role == "developer"
    assert verify_password("new_password_123", user.password_hash) is True


def test_user_service_register_duplicate(db_session: Session):
    """Test 5: Verify UserService.register raises 400 when username is taken"""
    payload = UserRegisterRequest(username="duplicate_user", password="password123", role="developer")
    UserService.register(db_session, payload)
    
    import pytest
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        UserService.register(db_session, payload)
    assert exc_info.value.status_code == 400


def test_user_service_authenticate_success(db_session: Session):
    """Test 6: Verify UserService.authenticate returns user upon correct credentials"""
    register_payload = UserRegisterRequest(username="auth_user", password="correct_password", role="developer")
    UserService.register(db_session, register_payload)
    
    login_payload = UserLoginRequest(username="auth_user", password="correct_password")
    authenticated_user = UserService.authenticate(db_session, login_payload)
    assert authenticated_user.username == "auth_user"


def test_user_service_authenticate_wrong_password(db_session: Session):
    """Test 7: Verify UserService.authenticate raises 401 on incorrect password"""
    register_payload = UserRegisterRequest(username="auth_user2", password="correct_password", role="developer")
    UserService.register(db_session, register_payload)
    
    import pytest
    from fastapi import HTTPException
    login_payload = UserLoginRequest(username="auth_user2", password="wrong_password")
    with pytest.raises(HTTPException) as exc_info:
        UserService.authenticate(db_session, login_payload)
    assert exc_info.value.status_code == 401


def test_user_service_bootstrap_admin_login(db_session: Session):
    """Test 8: Verify UserService.authenticate bootstraps an admin user if not present"""
    login_payload = UserLoginRequest(username="admin", password="admin123")
    user = UserService.authenticate(db_session, login_payload)
    assert user.username == "admin"
    assert user.role == "admin"


def test_user_service_bootstrap_dev_login(db_session: Session):
    """Test 9: Verify UserService.authenticate bootstraps a developer user if not present"""
    login_payload = UserLoginRequest(username="developer", password="dev123")
    user = UserService.authenticate(db_session, login_payload)
    assert user.username == "developer"
    assert user.role == "developer"


# ==========================================
# 3. RETRAINING ENDPOINT TESTS (4 cases)
# ==========================================

def test_api_retrain_endpoint_unauthorized(client: TestClient):
    """Test 10: Verify POST /api/retrain blocks unauthorized calls (missing token)"""
    response = client.post("/api/retrain")
    assert response.status_code == 401


def test_api_retrain_endpoint_forbidden_for_developer(client: TestClient):
    """Test 11: Verify POST /api/retrain blocks developer role with 403"""
    headers = {"Authorization": "Bearer test-dev-token"}
    with patch("backend.app.api.retrain.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.post("/api/retrain", headers=headers)
        assert response.status_code == 403


@patch("backend.app.api.retrain.run_retraining")
def test_api_retrain_endpoint_admin_success(mock_run, client: TestClient):
    """Test 12: Verify POST /api/retrain accepts admin token and dispatches task"""
    headers = {"Authorization": "Bearer test-admin-token"}
    with patch("backend.app.api.retrain.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "admin_user", "role": "admin"}
        response = client.post("/api/retrain", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert "started" in data["message"] or "dispatched" in data["status"] or "running" in data["status"]


def test_api_retrain_status_admin_only(client: TestClient):
    """Test 13: Verify GET /api/retrain/status requires admin role"""
    headers = {"Authorization": "Bearer test-dev-token"}
    with patch("backend.app.api.retrain.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/retrain/status", headers=headers)
        assert response.status_code == 403


# ==========================================
# 4. PREDICTION HISTORY TESTS (7 cases)
# ==========================================

def test_api_predictions_history_paginated(client: TestClient, db_session: Session):
    """Test 14: Verify GET /api/predictions supports pagination and returns correctly"""
    # Insert mock predictions
    for i in range(5):
        p = Prediction(
            bug_id=f"BUG-TEST-HIST-{i}",
            title=f"Test Bug Title {i}",
            severity="medium",
            component="Auth",
            predicted_priority="Medium",
            confidence=0.82
        )
        db_session.add(p)
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/predictions?limit=2&offset=1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 5
        assert len(data["history"]) == 2


def test_api_predictions_history_filtered(client: TestClient, db_session: Session):
    """Test 15: Verify GET /api/predictions applies filters correctly"""
    db_session.add(Prediction(bug_id="BUG-F1", title="Title 1", severity="high", component="Auth", predicted_priority="High", confidence=0.88))
    db_session.add(Prediction(bug_id="BUG-F2", title="Title 2", severity="low", component="UI", predicted_priority="Low", confidence=0.62))
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        
        # Test Priority filter
        response = client.get("/api/predictions?priority=High", headers=headers)
        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["history"][0]["bug_id"] == "BUG-F1"


def test_api_prediction_detail_success(client: TestClient, db_session: Session):
    """Test 16: Verify GET /api/predictions/{bug_id} retrieves detail successfully"""
    p = Prediction(
        bug_id="BUG-DETAIL-1",
        title="Detail Bug Title",
        severity="critical",
        component="Billing",
        predicted_priority="Critical",
        confidence=0.95,
        explanation="Stripe issue",
        recommendation="Fix core API",
        category="Payment",
        root_cause="Stripe timeout",
        impact="High",
        solution="Implement retry",
        recommendations_json=json.dumps(["Retry transaction"]),
        prevention_json=json.dumps(["Circuit breaker"])
    )
    db_session.add(p)
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/predictions/BUG-DETAIL-1", headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["bug_id"] == "BUG-DETAIL-1"
        assert data["prediction"]["priority"] == "Critical"
        assert data["category"] == "Payment"


def test_api_prediction_detail_not_found(client: TestClient):
    """Test 17: Verify GET /api/predictions/{bug_id} raises 404 if record is missing"""
    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/predictions/BUG-NONEXISTENT", headers=headers)
        assert response.status_code == 404


def test_api_prediction_review_override(client: TestClient, db_session: Session):
    """Test 18: Verify POST /api/predictions/{bug_id}/review updates priority and status"""
    p = Prediction(
        bug_id="BUG-REV-1",
        title="Review Bug",
        severity="high",
        component="Auth",
        predicted_priority="High",
        confidence=0.88,
        decision_status="Needs Human Review"
    )
    db_session.add(p)
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "admin", "role": "admin"}
        review_payload = {"approved_priority": "Critical", "reason": "Severe authentication leak"}
        
        response = client.post("/api/predictions/BUG-REV-1/review", json=review_payload, headers=headers)
        assert response.status_code == 200
        data = response.json()
        assert data["prediction"]["priority"] == "Critical"
        assert data["decision_status"] == "Overridden"


def test_api_prediction_export_csv_headers(client: TestClient, db_session: Session):
    """Test 19: Verify GET /api/predictions/export/csv streams valid CSV content and headers"""
    db_session.add(Prediction(
        bug_id="BUG-CSV-1",
        title="CSV Bug",
        severity="low",
        component="UI",
        predicted_priority="Low",
        confidence=0.65,
        decision_status="Auto-Approved"
    ))
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/predictions/export/csv", headers=headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "text/csv; charset=utf-8"
        assert "attachment; filename=prediction_history.csv" in response.headers["content-disposition"]


def test_api_prediction_export_csv_rows(client: TestClient, db_session: Session):
    """Test 20: Verify GET /api/predictions/export/csv content contains mock bug records"""
    db_session.add(Prediction(
        bug_id="BUG-CSV-TEST-2",
        title="Special CSV Row Title",
        severity="low",
        component="UI",
        predicted_priority="Low",
        confidence=0.65,
        decision_status="Auto-Approved"
    ))
    db_session.commit()

    headers = {"Authorization": "Bearer test-token"}
    with patch("backend.app.api.prediction_history.get_current_user") as mock_user:
        mock_user.return_value = {"sub": "dev_user", "role": "developer"}
        response = client.get("/api/predictions/export/csv", headers=headers)
        assert response.status_code == 200
        csv_text = response.text
        assert "BUG-CSV-TEST-2" in csv_text
        assert "Special CSV Row Title" in csv_text
