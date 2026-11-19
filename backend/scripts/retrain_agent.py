"""
Retraining Agent Script
Periodically checks feedback_log.csv for new confirmed/corrected labels,
retrains existing model architecture on combined dataset (original + feedback),
evaluates candidate model vs active production model on a held-out validation set,
only replaces production model if candidate F1-score is higher,
saves each version separately (model_v1.pkl, model_v2.pkl, etc.),
and logs detailed evaluation results.
"""

import os
import sys
import time
import glob
import pickle
import logging
import argparse
from datetime import datetime, timezone
from typing import Dict, Any, Tuple, Optional

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import f1_score, accuracy_score, precision_score, recall_score

# Ensure root backend directory is in sys.path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if BASE_DIR not in sys.path:
    sys.path.insert(0, BASE_DIR)

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger
from backend.app.services.feedback_logger import feedback_logger, FEEDBACK_LOG_PATH
from backend.app.services.model_loader import model_loader
from backend.app.services.smart_bug_priority import SmartBugPriorityPipeline, PRIORITY_STR_TO_NUM

logger = setup_logger("retrain_agent")

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "app", "models"))
os.makedirs(MODELS_DIR, exist_ok=True)

RAW_DATASET_PATH = os.path.abspath(os.path.join(
    os.path.dirname(__file__), "..", "ml_pipeline", "data", "raw", "all_departments_bugs_50k.csv"
))


class RetrainAgent:
    """Agent that handles automated retraining lifecycle based on feedback_log.csv"""

    def __init__(
        self,
        feedback_path: str = FEEDBACK_LOG_PATH,
        raw_dataset_path: str = RAW_DATASET_PATH,
        models_dir: str = MODELS_DIR,
        production_model_path: str = settings.MODEL_PATH
    ):
        self.feedback_path = feedback_path
        self.raw_dataset_path = raw_dataset_path
        self.models_dir = models_dir
        self.production_model_path = production_model_path
        
        os.makedirs(self.models_dir, exist_ok=True)
        if os.path.dirname(self.production_model_path):
            os.makedirs(os.path.dirname(self.production_model_path), exist_ok=True)

    def _get_next_version_filename(self) -> str:
        """Determines next version file name model_v1.pkl, model_v2.pkl, etc."""
        pattern = os.path.join(self.models_dir, "model_v*.pkl")
        existing = glob.glob(pattern)
        max_v = 0
        for fname in existing:
            base = os.path.basename(fname)
            try:
                # e.g., model_v1.pkl -> 1
                v_num = int(base.replace("model_v", "").replace(".pkl", ""))
                if v_num > max_v:
                    max_v = v_num
            except ValueError:
                continue
        next_v = max_v + 1
        return os.path.join(self.models_dir, f"model_v{next_v}.pkl")

    def has_new_feedback(self, last_processed_count: int = 0) -> Tuple[bool, int]:
        """Checks if feedback_log.csv contains new records"""
        if not os.path.exists(self.feedback_path) or os.path.getsize(self.feedback_path) == 0:
            return False, 0
        try:
            df_fb = pd.read_csv(self.feedback_path)
            current_count = len(df_fb)
            return current_count > last_processed_count, current_count
        except Exception as e:
            logger.error(f"Error checking feedback log: {e}")
            return False, 0

    def load_combined_dataset(self) -> pd.DataFrame:
        """Loads baseline dataset and merges developer corrections from feedback_log.csv"""
        df_base = pd.DataFrame()
        if os.path.exists(self.raw_dataset_path):
            try:
                df_base = pd.read_csv(self.raw_dataset_path)
                logger.info(f"Loaded {len(df_base)} records from base dataset: {self.raw_dataset_path}")
            except Exception as e:
                logger.warning(f"Could not load raw dataset from {self.raw_dataset_path}: {e}")

        # If base is empty, build a baseline sample dataset
        if df_base.empty:
            logger.info("Generating baseline dataset structure...")
            df_base = pd.DataFrame({
                "summary": [
                    "Database connection timeout on login",
                    "UI button misaligned on mobile screen",
                    "Critical memory leak causes server crash",
                    "Typo in user settings documentation",
                    "Payment gateway fails during checkout",
                    "Slow page load on dashboard overview"
                ] * 100,
                "description": [
                    "Connection pool drops under high query load",
                    "Submit button overlaps with footer text",
                    "Unfreed memory pointers in image processing module",
                    "Spelling mistake in parameter tooltips",
                    "Transaction rollback failure leaves order pending",
                    "Database query lacks index on timestamp column"
                ] * 100,
                "severity": ["high", "low", "critical", "low", "critical", "medium"] * 100,
                "component": ["Backend", "Frontend", "Core Engine", "Docs", "Payment API", "Analytics"] * 100,
                "bug_type": ["Bug", "UI", "Crash", "Docs", "Bug", "Performance"] * 100,
                "affected_users": [120, 5, 2500, 1, 1500, 450] * 100,
                "is_reproducible": [True, True, True, False, True, True] * 100,
                "priority": ["HIGH", "LOW", "CRITICAL", "LOW", "CRITICAL", "MEDIUM"] * 100
            })

        # Load feedback data
        df_fb = feedback_logger.get_feedback_df()
        if not df_fb.empty:
            logger.info(f"Merging {len(df_fb)} developer feedback records from feedback_log.csv")
            # Map feedback columns to match baseline dataset
            df_fb_mapped = pd.DataFrame({
                "summary": df_fb["summary"],
                "description": df_fb["description"],
                "severity": df_fb["severity"],
                "component": df_fb["component"],
                "bug_type": df_fb["bug_type"],
                "affected_users": df_fb["affected_users"],
                "is_reproducible": df_fb["is_reproducible"],
                "priority": df_fb["corrected_priority"]
            })
            # Combine baseline + feedback
            combined = pd.concat([df_base, df_fb_mapped], ignore_index=True)
            return combined
        
        return df_base

    def evaluate_model_pipeline(
        self,
        pipeline: SmartBugPriorityPipeline,
        val_df: pd.DataFrame
    ) -> Tuple[float, float, Dict[str, float]]:
        """
        Evaluates a SmartBugPriorityPipeline model on held-out validation DataFrame
        Returns (weighted_f1, macro_f1, metrics_dict)
        """
        try:
            # Map priority target column
            target_series = val_df["priority"].astype(str).str.upper()
            y_true = target_series.map(lambda s: PRIORITY_STR_TO_NUM.get(s, 1)).values

            # Make predictions
            preds = []
            for _, row in val_df.iterrows():
                b_dict = {
                    "summary": row.get("summary", ""),
                    "description": row.get("description", ""),
                    "severity": row.get("severity", "medium"),
                    "component": row.get("component", "General"),
                    "bug_type": row.get("bug_type", "Bug"),
                    "affected_users": row.get("affected_users", 1),
                    "is_reproducible": row.get("is_reproducible", True)
                }
                res = pipeline.predict_single(b_dict)
                pred_label = res["predicted_priority"]
                pred_code = PRIORITY_STR_TO_NUM.get(pred_label, 1)
                preds.append(pred_code)

            y_pred = np.array(preds)

            weighted_f1 = float(f1_score(y_true, y_pred, average="weighted", zero_division=0))
            macro_f1 = float(f1_score(y_true, y_pred, average="macro", zero_division=0))
            accuracy = float(accuracy_score(y_true, y_pred))
            precision = float(precision_score(y_true, y_pred, average="weighted", zero_division=0))
            recall = float(recall_score(y_true, y_pred, average="weighted", zero_division=0))

            metrics = {
                "accuracy": accuracy,
                "precision": precision,
                "recall": recall,
                "weighted_f1": weighted_f1,
                "macro_f1": macro_f1
            }
            return weighted_f1, macro_f1, metrics
        except Exception as e:
            logger.error(f"Error evaluating model pipeline: {e}")
            return 0.0, 0.0, {"weighted_f1": 0.0, "macro_f1": 0.0}

    def run_retraining(self, force: bool = False) -> Dict[str, Any]:
        """
        Executes complete retraining, evaluation, validation comparison, and promotion lifecycle
        """
        logger.info("=== Starting Retraining Agent Lifecycle ===")

        # 1. Load combined dataset
        combined_df = self.load_combined_dataset()
        if len(combined_df) < 5:
            msg = f"Insufficient dataset size ({len(combined_df)} records) to execute retraining."
            logger.warning(msg)
            return {"status": "skipped", "reason": msg}

        # Ensure priority target column exists
        if "priority" not in combined_df.columns:
            logger.error("Combined dataset missing 'priority' column.")
            return {"status": "failed", "error": "Missing priority target column"}

        # 2. Hold out validation set (20%)
        train_df, val_df = train_test_split(
            combined_df, test_size=0.2, random_state=42, stratify=combined_df["priority"] if len(combined_df) > 20 else None
        )
        logger.info(f"Split dataset into Train: {len(train_df)} rows, Validation: {len(val_df)} rows")

        # 3. Evaluate CURRENT production model on validation set
        current_pipeline = SmartBugPriorityPipeline(model_version="current_prod")
        current_prod_loaded = False
        if os.path.exists(self.production_model_path):
            try:
                with open(self.production_model_path, "rb") as f:
                    prod_obj = pickle.load(f)
                    if isinstance(prod_obj, SmartBugPriorityPipeline):
                        current_pipeline = prod_obj
                        current_prod_loaded = True
                    elif hasattr(prod_obj, "predict"):
                        current_pipeline.model = prod_obj
                        current_pipeline.is_fitted = True
                        current_prod_loaded = True
            except Exception as e:
                logger.warning(f"Could not load active production model from {self.production_model_path}: {e}")

        prod_f1, prod_macro_f1, prod_metrics = (0.0, 0.0, {})
        if current_prod_loaded:
            prod_f1, prod_macro_f1, prod_metrics = self.evaluate_model_pipeline(current_pipeline, val_df)
            logger.info(f"Current Production Model Validation Weighted F1-Score: {prod_f1:.4f} (Macro F1: {prod_macro_f1:.4f})")
        else:
            logger.info("No active production model found on disk. Baseline score set to 0.0.")

        # 4. Train NEW candidate model using existing architecture
        version_filepath = self._get_next_version_filename()
        version_name = os.path.basename(version_filepath).replace(".pkl", "")
        logger.info(f"Training new candidate model architecture version: {version_name}...")

        candidate_pipeline = SmartBugPriorityPipeline(model_version=version_name)
        train_res = candidate_pipeline.fit(train_df)
        
        # 5. Evaluate candidate model on same held-out validation set
        cand_f1, cand_macro_f1, cand_metrics = self.evaluate_model_pipeline(candidate_pipeline, val_df)
        logger.info(f"Candidate Model ({version_name}) Validation Weighted F1-Score: {cand_f1:.4f} (Macro F1: {cand_macro_f1:.4f})")

        # Save candidate version separately regardless
        try:
            with open(version_filepath, "wb") as f:
                pickle.dump(candidate_pipeline, f)
            logger.info(f"Saved versioned model candidate to {version_filepath}")
        except Exception as e:
            logger.error(f"Failed to save versioned candidate model: {e}")

        # 6. Compare F1-scores & Decide Promotion
        improved = (cand_f1 > prod_f1) or force or (not current_prod_loaded)

        result_summary = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "candidate_version": version_name,
            "candidate_file": version_filepath,
            "production_f1": prod_f1,
            "candidate_f1": cand_f1,
            "f1_improvement": cand_f1 - prod_f1,
            "promoted": improved,
            "candidate_metrics": cand_metrics,
            "production_metrics": prod_metrics
        }

        if improved:
            logger.info(f"🏆 [SUCCESS] Retraining IMPROVED model! F1 increased from {prod_f1:.4f} to {cand_f1:.4f}. Promoted {version_name} to production.")
            # Promote candidate model to production model path
            try:
                with open(self.production_model_path, "wb") as f:
                    pickle.dump(candidate_pipeline, f)
                logger.info(f"Overwrote active production model at {self.production_model_path}")
                # Reload global model loader Singleton
                model_loader.reload()
            except Exception as e:
                logger.error(f"Failed to promote candidate model to production path: {e}")
                result_summary["promoted"] = False
                result_summary["error"] = str(e)
        else:
            logger.info(f"⚠️ [NO IMPROVEMENT] Candidate F1 ({cand_f1:.4f}) did NOT exceed production F1 ({prod_f1:.4f}). Retaining current production model.")

        return result_summary


def main():
    parser = argparse.ArgumentParser(description="Smart Bug Priority Predictor - Retraining Agent")
    parser.add_argument("--run-once", action="store_true", help="Run a single retraining check and exit")
    parser.add_argument("--interval", type=int, default=0, help="Periodic interval in seconds to run loop")
    parser.add_argument("--force", action="store_true", help="Force model replacement even if F1 score does not improve")
    args = parser.parse_args()

    agent = RetrainAgent()

    if args.run_once or args.interval <= 0:
        res = agent.run_retraining(force=args.force)
        print(f"Retraining Result: {res}")
    else:
        logger.info(f"Starting continuous retraining loop with interval of {args.interval} seconds...")
        last_count = 0
        while True:
            has_new, curr_count = agent.has_new_feedback(last_count)
            if has_new or args.force:
                logger.info(f"Detected new feedback entries ({curr_count} total). Running retraining agent...")
                res = agent.run_retraining(force=args.force)
                last_count = curr_count
            else:
                logger.info("No new feedback data detected. Waiting for next interval check...")
            time.sleep(args.interval)


if __name__ == "__main__":
    main()
