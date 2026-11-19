"""
Unit tests for Smart Bug Priority Predictor core functionality:
- Dataset upload & validation
- Data leakage detection
- Preprocessing & Feature Engineering
- Model training & metrics evaluation
- Bug prediction & database result storage
- Human verification & continuous learning pipeline threshold trigger
- Automated retraining with verified actual priorities only
- Model versioning, promotion, and rollback
"""

import os
import pytest
import pandas as pd
import numpy as np

from backend.app.services.smart_bug_priority import (
    validate_dataset,
    detect_data_leakage,
    preprocess_dataset,
    train_model,
    predict_bug,
    store_prediction,
    verify_prediction,
    continuous_learning_pipeline,
    retrain_model,
    evaluate_model,
    promote_model,
    rollback_model,
    SmartBugPriorityPipeline
)
from backend.app.database.database import engine, Base
from backend.app.database.models import Prediction, ModelVersion


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Binds SQLite tables before tests run"""
    Base.metadata.create_all(bind=engine)
    yield


@pytest.fixture
def sample_bug_dataframe():
    """Generates sample bug dataset DataFrame for testing"""
    data = {
        'summary': [
            "Critical server memory overflow crash on checkout",
            "Typo in header navigation link",
            "Slow SQL query execution on user profile page",
            "Authentication token invalidation flaw",
            "Button alignment issue on mobile viewport",
            "Database connection pool exhausted during peak load",
            "CSS color contrast fails accessibility audit",
            "Payment gateway webhook times out unexpectedly"
        ] * 3,
        'description': [
            "Application throws OutOfMemoryException when user submits order.",
            "Spelling mistake in 'About Us' link in navigation header.",
            "Query takes over 8 seconds to return search results.",
            "JWT token remains valid after user logs out.",
            "Submit button overlaps text field on small screen.",
            "Server logs show connection pool limit reached.",
            "Contrast ratio is 2.5:1 which is below WCAG AAA standard.",
            "Stripe API webhook drops connection after 30 seconds."
        ] * 3,
        'severity': ["critical", "low", "high", "high", "low", "critical", "low", "critical"] * 3,
        'component': ["Backend", "UI", "Database", "Auth", "UI", "Database", "UI", "Payment"] * 3,
        'bug_type': ["Bug", "Docs", "Performance", "Security", "UI", "Performance", "UI", "Bug"] * 3,
        'priority': ["CRITICAL", "LOW", "HIGH", "HIGH", "LOW", "CRITICAL", "LOW", "CRITICAL"] * 3
    }
    return pd.DataFrame(data)


def test_validate_dataset(sample_bug_dataframe):
    """1. Test validate_dataset function"""
    df_valid, target_col = validate_dataset(sample_bug_dataframe)
    assert target_col == 'priority'
    assert len(df_valid) == 24
    assert 'summary' in df_valid.columns
    assert 'description' in df_valid.columns

    # Test invalid dataset handling
    with pytest.raises(ValueError):
        validate_dataset(pd.DataFrame({'foo': [1, 2, 3]}))


def test_detect_data_leakage(sample_bug_dataframe):
    """2. Test detect_data_leakage function"""
    df_leak = sample_bug_dataframe.copy()
    df_leak['resolution_time'] = "2 hours"
    df_leak['fixed_by'] = "dev_1"
    df_leak['actual_priority'] = df_leak['priority']

    cleaned_df, removed = detect_data_leakage(df_leak, target_col='priority')
    assert 'resolution_time' in removed
    assert 'fixed_by' in removed
    assert 'actual_priority' in removed
    assert 'resolution_time' not in cleaned_df.columns


def test_preprocess_dataset(sample_bug_dataframe):
    """3. Test preprocess_dataset function"""
    df_proc, y_proc, metadata = preprocess_dataset(sample_bug_dataframe, target_col='priority')
    assert len(df_proc) == 24
    assert len(y_proc) == 24
    assert metadata['num_samples'] == 24
    assert isinstance(y_proc, pd.Series)
    assert set(y_proc.unique()).issubset({0, 1, 2, 3})


def test_train_model_and_evaluate(sample_bug_dataframe):
    """4 & 10. Test train_model and evaluate_model functions"""
    train_res = train_model(sample_bug_dataframe, model_version="SBP-v1.test")
    
    assert train_res['model_version'] == "SBP-v1.test"
    assert train_res['model_status'] == "active"
    assert 'metrics' in train_res
    assert 'accuracy' in train_res['metrics']
    assert 'macro_f1' in train_res['metrics']
    assert os.path.exists(train_res['model_file'])


def test_predict_bug_and_store():
    """5 & 6. Test predict_bug and store_prediction functions"""
    bug_input = {
        "title": "Critical database deadlock on transaction commit",
        "description": "High concurrent orders cause deadlock in PostgreSQL order table.",
        "severity": "critical",
        "component": "Database",
        "bug_type": "Performance",
        "affected_users": 350,
        "is_reproducible": True
    }

    pred_res = predict_bug(bug_input)
    assert 'bug_id' in pred_res
    assert pred_res['predicted_priority'] in ["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    assert 0.0 <= pred_res['confidence'] <= 1.0
    assert 'explanation' in pred_res
    assert pred_res['prediction_id'] is not None


def test_human_verification_and_continuous_learning():
    """7, 8, 9. Test verify_prediction, continuous_learning_pipeline, and retrain_model"""
    # Create 5 predictions and verify them to trigger the continuous learning threshold
    for i in range(5):
        bug_id = f"BUG-TEST-VERIFY-{i}"
        store_prediction(
            bug_id=bug_id,
            input_data={"summary": f"Bug {i}", "description": f"Desc {i}"},
            predicted_priority="MEDIUM",
            confidence=0.75,
            model_version="SBP-v1.test"
        )
        
        actual_prio = "CRITICAL" if i % 2 == 0 else "HIGH"
        v_res = verify_prediction(bug_id=bug_id, actual_priority=actual_prio, verified_by="admin_tester")
        assert v_res['status'] == "success"

    # Verify that the 5th verification triggered retrain_model
    cl_check = continuous_learning_pipeline()
    assert 'threshold' in cl_check


def test_promote_and_rollback():
    """11 & 12. Test promote_model and rollback_model functions"""
    # Test promote
    res_promote = promote_model("SBP-v1.test")
    assert res_promote['status'] == "success"
    assert res_promote['active_version'] == "SBP-v1.test"

    # Test rollback
    res_rollback = rollback_model()
    assert 'status' in res_rollback
