import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient
from datetime import datetime

# Import FastAPI app
import backend.app.main
from backend.app.main import app

client = TestClient(app)

# Helper headers for authenticated requests
AUTH_HEADERS = {
    "Authorization": "Bearer developer-mode-token"
}


def test_root_endpoint():
    """Tests GET / root endpoint"""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "service" in data
    assert data["status"] == "operational"


def test_health_check_endpoint():
    """Tests GET /api/health endpoint"""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "model_loaded" in data


def test_model_info_endpoint_unauthorized():
    """Tests GET /api/model-info is protected"""
    response = client.get("/api/model-info")
    assert response.status_code == 401


def test_model_info_endpoint_authorized():
    """Tests GET /api/model-info works with token"""
    response = client.get("/api/model-info", headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    assert "app_name" in data
    assert "model_type" in data


@patch("backend.app.api.routes.predictor_service")
def test_predict_endpoint(mock_pred, monkeypatch):
    """Tests POST /api/predict endpoint with valid payload"""
    # Configure mock prediction return value
    mock_pred.predict.return_value = (
        {
            'priority': 'High',
            'priority_score': 2.0,
            'confidence': 0.88,
            'probabilities': {'Low': 0.02, 'Medium': 0.10, 'High': 0.88, 'Critical': 0.00}
        },
        MagicMock() # mock features df
    )
    
    # Configure mock explanation return value
    mock_pred.get_explanation.return_value = {
        'reasoning': 'Mocked reasoning (Confidence: 88.0%)',
        'shap_impacts': [{'feature': 'Severity', 'impact': 0.5}]
    }

    payload = {
        "title": "Database login failing frequently",
        "description": "When multiple connection pool requests are made, database authentication fails.",
        "component": "database",
        "severity": "critical",
        "affected_users": 200,
        "is_reproducible": True,
        "reported_by": "tester@example.com",
        "environment": "Production",
        "module": "DB-Connector"
    }
    
    response = client.post("/api/predict", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 200
    data = response.json()
    
    # Assert return keys
    assert 'bug_id' in data
    assert data['prediction']['priority'] == 'High'
    assert data['prediction']['confidence'] == 0.88
    assert 'recommendation' in data
    assert 'explanation' in data


def test_predict_endpoint_invalid_payload():
    """Tests POST /api/predict with invalid data (fails Pydantic validation)"""
    payload = {
        "title": "Bug", 
        "description": "Short",
        "component": "",
        "severity": "invalid_severity", 
        "affected_users": -5 
    }
    
    response = client.post("/api/predict", json=payload, headers=AUTH_HEADERS)
    assert response.status_code == 422
