"""
Automated Integration Tests for New Pipeline Extensions:
1. Feedback Logger (predictions_log.csv & feedback_log.csv)
2. Solution Engine (6-phase diagnostic & fix plans)
3. Retrain Agent (Evaluation split, F1 score comparison, versioning)
4. Pipeline Integration (predict -> solution plan -> log prediction)
"""

import os
import sys
import pytest
import pandas as pd

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.services.feedback_logger import FeedbackLogger
from backend.app.services.solution_engine import SolutionEngine
from backend.scripts.retrain_agent import RetrainAgent
from backend.app.services.predictor import BugPriorityPredictorService, predictor_service


@pytest.fixture
def temp_logger(tmp_path):
    pred_csv = os.path.join(tmp_path, "predictions_log.csv")
    fb_csv = os.path.join(tmp_path, "feedback_log.csv")
    return FeedbackLogger(predictions_path=pred_csv, feedback_path=fb_csv)


def test_feedback_logger_flow(temp_logger):
    bug_data = {
        "summary": "Database connection pool exhausted",
        "description": "HikariCP pool drops active connections under load",
        "severity": "critical",
        "component": "Database",
        "bug_type": "Crash",
        "affected_users": 500,
        "is_reproducible": True
    }

    # 1. Log prediction
    pred_id = temp_logger.log_prediction(
        bug_data=bug_data,
        predicted_priority="CRITICAL",
        confidence=0.95
    )
    assert pred_id.startswith("pred-")

    df_preds = temp_logger.get_predictions_df()
    assert len(df_preds) == 1
    assert df_preds.iloc[0]["predicted_priority"] == "CRITICAL"

    # 2. Log developer feedback correction
    fb_res = temp_logger.log_feedback(
        prediction_id=pred_id,
        corrected_priority="HIGH",
        developer_id="senior_dev_1",
        notes="Adjusted to HIGH based on failover setup"
    )
    assert fb_res["status"] == "success"
    assert fb_res["corrected_priority"] == "HIGH"

    df_fb = temp_logger.get_feedback_df()
    assert len(df_fb) == 1
    assert df_fb.iloc[0]["corrected_priority"] == "HIGH"
    assert df_fb.iloc[0]["developer_id"] == "senior_dev_1"


def test_solution_engine_all_categories():
    categories = ["crash", "ui", "data_loss", "performance", "security", "network", "database", "general"]
    priorities = ["CRITICAL", "HIGH", "MEDIUM", "LOW"]

    for cat in categories:
        for prio in priorities:
            plan = SolutionEngine.get_solution_plan(predicted_priority=prio, bug_category=cat)
            assert "title" in plan
            assert plan["category"] == cat
            assert plan["priority"] == prio
            assert len(plan["steps"]) == 6
            
            phase_names = [step["name"] for step in plan["steps"]]
            expected_phases = ["Identify", "Reproduce", "Isolate", "Fix", "Verify", "Log outcome"]
            assert phase_names == expected_phases
            
            for step in plan["steps"]:
                assert len(step["actions"]) > 0


def test_retrain_agent_lifecycle(tmp_path):
    fb_csv = os.path.join(tmp_path, "feedback_log.csv")
    models_dir = os.path.join(tmp_path, "models")
    prod_model_path = os.path.join(models_dir, "optimized_lightgbm_model.pkl")

    # Create dummy feedback file with developer corrections
    fb_logger = FeedbackLogger(predictions_path=os.path.join(tmp_path, "preds.csv"), feedback_path=fb_csv)
    fb_logger.log_feedback(
        prediction_id="pred-001",
        corrected_priority="CRITICAL",
        developer_id="dev_test",
        notes="Corrected priority label",
        bug_data={
            "summary": "Critical memory leak crash",
            "description": "Server crashes every 2 hours due to unreleased buffers",
            "severity": "critical",
            "component": "Core",
            "bug_type": "Crash",
            "affected_users": 1000,
            "is_reproducible": True
        }
    )

    agent = RetrainAgent(
        feedback_path=fb_csv,
        raw_dataset_path="",  # trigger baseline fallback
        models_dir=models_dir,
        production_model_path=prod_model_path
    )

    # Force retraining to test candidate training, F1 evaluation & versioning
    result = agent.run_retraining(force=True)

    assert "candidate_version" in result
    assert "candidate_f1" in result
    assert result["promoted"] is True
    assert os.path.exists(prod_model_path)
    assert os.path.exists(result["candidate_file"])


def test_predictor_service_integration():
    bug_data = {
        "title": "Authentication token expired error on refresh",
        "description": "User is forcibly logged out when token refreshes after 60 minutes",
        "severity": "high",
        "component": "Authentication",
        "bug_type": "Security",
        "affected_users": 150,
        "is_reproducible": True
    }

    result, features = predictor_service.predict(bug_data)

    assert "priority" in result
    assert "confidence" in result
    assert "prediction_id" in result
    assert "solution_plan" in result

    plan = result["solution_plan"]
    assert "title" in plan
    assert len(plan["steps"]) == 6
    assert plan["steps"][0]["name"] == "Identify"
