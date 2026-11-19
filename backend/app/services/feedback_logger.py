"""
Feedback Logging System Service
Logs all model predictions to predictions_log.csv and developer corrections to feedback_log.csv.
"""

import os
import csv
import threading
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional
import pandas as pd

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger

logger = setup_logger("feedback_logger")

# Default CSV file paths
DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "data"))
os.makedirs(DATA_DIR, exist_ok=True)

PREDICTIONS_LOG_PATH = os.path.join(DATA_DIR, "predictions_log.csv")
FEEDBACK_LOG_PATH = os.path.join(DATA_DIR, "feedback_log.csv")

PREDICTIONS_HEADER = [
    "prediction_id",
    "timestamp",
    "summary",
    "description",
    "severity",
    "component",
    "bug_type",
    "affected_users",
    "is_reproducible",
    "predicted_priority",
    "confidence"
]

FEEDBACK_HEADER = [
    "prediction_id",
    "timestamp",
    "summary",
    "description",
    "severity",
    "component",
    "bug_type",
    "affected_users",
    "is_reproducible",
    "predicted_priority",
    "corrected_priority",
    "developer_id",
    "notes"
]


class FeedbackLogger:
    """Handles thread-safe logging of predictions and developer feedback for retrain lifecycle"""

    def __init__(
        self,
        predictions_path: str = PREDICTIONS_LOG_PATH,
        feedback_path: str = FEEDBACK_LOG_PATH
    ):
        self.predictions_path = predictions_path
        self.feedback_path = feedback_path
        self._lock = threading.Lock()
        self._ensure_files_exist()

    def _ensure_files_exist(self):
        """Creates CSV log files with headers if they do not exist"""
        with self._lock:
            if not os.path.exists(self.predictions_path) or os.path.getsize(self.predictions_path) == 0:
                with open(self.predictions_path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(PREDICTIONS_HEADER)
                logger.info(f"Initialized predictions log at {self.predictions_path}")

            if not os.path.exists(self.feedback_path) or os.path.getsize(self.feedback_path) == 0:
                with open(self.feedback_path, "w", newline="", encoding="utf-8") as f:
                    writer = csv.writer(f)
                    writer.writerow(FEEDBACK_HEADER)
                logger.info(f"Initialized feedback log at {self.feedback_path}")

    def log_prediction(
        self,
        bug_data: Dict[str, Any],
        predicted_priority: str,
        confidence: float,
        prediction_id: Optional[str] = None
    ) -> str:
        """
        Logs a single bug priority prediction event to predictions_log.csv
        
        Args:
            bug_data: Dictionary of input bug features
            predicted_priority: Predicted priority label (LOW, MEDIUM, HIGH, CRITICAL)
            confidence: Model confidence score (0.0 to 1.0)
            prediction_id: Optional unique prediction ID
            
        Returns:
            str: prediction_id generated or used
        """
        if not prediction_id:
            import uuid
            prediction_id = f"pred-{uuid.uuid4().hex[:12]}"

        timestamp = datetime.now(timezone.utc).isoformat()

        row = [
            prediction_id,
            timestamp,
            str(bug_data.get("summary") or bug_data.get("title") or ""),
            str(bug_data.get("description") or ""),
            str(bug_data.get("severity") or "medium"),
            str(bug_data.get("component") or "General"),
            str(bug_data.get("bug_type") or "Bug"),
            int(bug_data.get("affected_users", 1)),
            bool(bug_data.get("is_reproducible", True)),
            str(predicted_priority).upper(),
            float(confidence)
        ]

        with self._lock:
            with open(self.predictions_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(row)

        logger.info(f"Logged prediction {prediction_id}: priority={predicted_priority}, confidence={confidence:.2f}")
        return prediction_id

    def log_feedback(
        self,
        prediction_id: str,
        corrected_priority: str,
        developer_id: str = "dev",
        notes: str = "",
        bug_data: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Logs developer confirmation or correction to feedback_log.csv
        
        Args:
            prediction_id: Prediction ID being confirmed/corrected
            corrected_priority: Verified target priority label (LOW, MEDIUM, HIGH, CRITICAL)
            developer_id: Name/ID of developer submitting feedback
            notes: Optional feedback notes
            bug_data: Optional direct bug features if prediction_id is missing from log
            
        Returns:
            Dict containing logged feedback details
        """
        timestamp = datetime.now(timezone.utc).isoformat()
        corrected_label = str(corrected_priority).upper()
        
        # Default feature values
        features = {
            "summary": "",
            "description": "",
            "severity": "medium",
            "component": "General",
            "bug_type": "Bug",
            "affected_users": 1,
            "is_reproducible": True,
            "predicted_priority": corrected_label
        }

        # Attempt to lookup original prediction in predictions_log.csv
        found = False
        if os.path.exists(self.predictions_path):
            try:
                df_preds = pd.read_csv(self.predictions_path)
                match = df_preds[df_preds["prediction_id"] == prediction_id]
                if not match.empty:
                    found = True
                    rec = match.iloc[-1]
                    features["summary"] = str(rec.get("summary", ""))
                    features["description"] = str(rec.get("description", ""))
                    features["severity"] = str(rec.get("severity", "medium"))
                    features["component"] = str(rec.get("component", "General"))
                    features["bug_type"] = str(rec.get("bug_type", "Bug"))
                    features["affected_users"] = int(rec.get("affected_users", 1))
                    features["is_reproducible"] = bool(rec.get("is_reproducible", True))
                    features["predicted_priority"] = str(rec.get("predicted_priority", corrected_label))
            except Exception as e:
                logger.warning(f"Could not search predictions_log.csv for {prediction_id}: {e}")

        # Fallback to direct bug_data if provided
        if not found and bug_data:
            features["summary"] = str(bug_data.get("summary") or bug_data.get("title") or "")
            features["description"] = str(bug_data.get("description") or "")
            features["severity"] = str(bug_data.get("severity", "medium"))
            features["component"] = str(bug_data.get("component", "General"))
            features["bug_type"] = str(bug_data.get("bug_type", "Bug"))
            features["affected_users"] = int(bug_data.get("affected_users", 1))
            features["is_reproducible"] = bool(bug_data.get("is_reproducible", True))
            features["predicted_priority"] = str(bug_data.get("predicted_priority", corrected_label))

        row = [
            prediction_id,
            timestamp,
            features["summary"],
            features["description"],
            features["severity"],
            features["component"],
            features["bug_type"],
            features["affected_users"],
            features["is_reproducible"],
            features["predicted_priority"],
            corrected_label,
            developer_id,
            notes
        ]

        with self._lock:
            with open(self.feedback_path, "a", newline="", encoding="utf-8") as f:
                writer = csv.writer(f)
                writer.writerow(row)

        logger.info(f"Logged feedback for {prediction_id}: corrected_priority={corrected_label} by {developer_id}")
        return {
            "prediction_id": prediction_id,
            "timestamp": timestamp,
            "corrected_priority": corrected_label,
            "original_predicted_priority": features["predicted_priority"],
            "developer_id": developer_id,
            "status": "success"
        }

    def get_predictions_df(self) -> pd.DataFrame:
        """Returns predictions log as DataFrame"""
        if os.path.exists(self.predictions_path) and os.path.getsize(self.predictions_path) > 0:
            return pd.read_csv(self.predictions_path)
        return pd.DataFrame(columns=PREDICTIONS_HEADER)

    def get_feedback_df(self) -> pd.DataFrame:
        """Returns feedback log as DataFrame"""
        if os.path.exists(self.feedback_path) and os.path.getsize(self.feedback_path) > 0:
            return pd.read_csv(self.feedback_path)
        return pd.DataFrame(columns=FEEDBACK_HEADER)


# Global Singleton Logger Instance
feedback_logger = FeedbackLogger()
