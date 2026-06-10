import pytest
from unittest.mock import MagicMock, patch
import pandas as pd
import numpy as np
from backend.app.services.predictor import BugPriorityPredictorService

@pytest.fixture
def mock_predictor_inputs():
    """Mock model and feature engineer objects"""
    mock_model = MagicMock()
    # Mock model predicts class 2 (High)
    mock_model.predict.return_value = np.array([2])
    # Mock probabilities: Low, Medium, High, Critical
    mock_model.predict_proba.return_value = np.array([[0.05, 0.15, 0.65, 0.15]])
    
    mock_fe = MagicMock()
    mock_fe.transform.return_value = pd.DataFrame([[1, 2, 3]], columns=['feat1', 'feat2', 'feat3'])
    
    return mock_model, mock_fe

@patch('backend.app.services.model_loader.model_loader')
def test_predictor_single_prediction(mock_loader_instance, mock_predictor_inputs):
    """Tests single bug report prediction using mocked model and feature engineer"""
    mock_model, mock_fe = mock_predictor_inputs
    mock_loader_instance.model = mock_model
    mock_loader_instance.feature_engineer = mock_fe
    
    # Initialize predictor
    predictor = BugPriorityPredictorService()
    
    bug_data = {
        'title': 'Broken layout in login form',
        'description': 'The login button overlaps the text field. Hard to access.',
        'component': 'UI',
        'severity': 'high',
        'affected_users': 150,
        'is_reproducible': True
    }
    
    result, _ = predictor.predict(bug_data)
    
    assert result['priority'] == 'High'
    assert result['priority_score'] == 2.0
    assert result['confidence'] == 0.65
    assert 'probabilities' in result
    assert result['probabilities']['High'] == 0.65

@patch('backend.app.services.model_loader.model_loader')
def test_predictor_reasoning(mock_loader_instance):
    """Tests the generated reasoning text for bug priority"""
    mock_loader_instance.model = MagicMock()
    mock_loader_instance.feature_engineer = MagicMock()
    
    predictor = BugPriorityPredictorService()
    
    # Test Case 1: Critical bug
    bug_critical = {
        'severity': 'critical',
        'affected_users': 150,
        'is_reproducible': True
    }
    pred_critical = {'priority': 'Critical', 'confidence': 0.85}
    explanation = predictor.get_explanation(bug_critical, pred_critical, pd.DataFrame())
    reasoning_critical = explanation['reasoning']
    assert "Critical severity reported" in reasoning_critical
    assert "150 users affected" in reasoning_critical
    assert "Bug is easily reproducible" in reasoning_critical
    
    # Test Case 2: Low bug
    bug_low = {
        'severity': 'low',
        'affected_users': 2,
        'is_reproducible': False
    }
    pred_low = {'priority': 'Low', 'confidence': 0.90}
    explanation_low = predictor.get_explanation(bug_low, pred_low, pd.DataFrame())
    reasoning_low = explanation_low['reasoning']
    assert "Low impact severity" in reasoning_low
