import os
import sys
import pickle
import logging
from datetime import datetime
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

try:
    import mlflow
    HAS_MLFLOW = True
except ImportError:
    HAS_MLFLOW = False

# Make sure we can import backend app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../../..")))


from backend.app.config.settings import settings
from backend.app.database.database import SessionLocal
from backend.app.database.models import Prediction, ModelMetric

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mlops_retrain")

def run_retraining():
    logger.info("Initializing MLOps Retraining Job...")
    
    # 1. Fetch fresh predictions from the database as retraining signals
    db = SessionLocal()
    try:
        new_records = db.query(Prediction).filter(Prediction.decision_status == "Approved").all()
        logger.info(f"Fetched {len(new_records)} approved prediction overrides for retraining.")
    except Exception as e:
        logger.warning(f"Could not fetch data from DB: {e}. Utilizing bootstrap dataset.")
        new_records = []
    finally:
        db.close()
        
    # 2. Load primary reference dataset
    raw_path = "backend/ml_pipeline/data/raw/all_departments_bugs_50k.csv"
    if not os.path.exists(raw_path):
        logger.warning(f"Reference raw dataset missing at {raw_path}. Generating synthetic bootstrap.")
        # Create a mock bootstrap dataset
        df = pd.DataFrame({
            "title": [f"Bootstrap Bug Title {i}" for i in range(100)],
            "description": [f"Bootstrap long bug description error logs traceback stack at line {i}" for i in range(100)],
            "severity": np.random.choice(["low", "medium", "high", "critical"], 100),
            "component": np.random.choice(["Auth", "UI", "Billing", "Database"], 100),
            "affected_users": np.random.randint(1, 1000, 100),
            "is_reproducible": np.random.choice([0, 1], 100),
            "priority": np.random.choice(["Low", "Medium", "High", "Critical"], 100)
        })
    else:
        df = pd.read_csv(raw_path).sample(200) # take sample to run quickly
        
    # Append fresh overridden bugs to training set
    if new_records:
        extra_rows = []
        for r in new_records:
            extra_rows.append({
                "title": r.title,
                "description": r.explanation or "User manual override logs",
                "severity": r.severity,
                "component": r.component,
                "affected_users": 100,
                "is_reproducible": 1,
                "priority": r.predicted_priority
            })
        df = pd.concat([df, pd.DataFrame(extra_rows)], ignore_index=True)
        
    # 3. Fit pipeline
    from backend.app.services.feature_engineering import FeatureEngineer
    fe = FeatureEngineer()
    X = fe.fit_transform(df)
    
    priority_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Critical': 3}
    y = df['priority'].map(priority_map).fillna(1).astype(int)
    
    # Save processed dataset
    os.makedirs("backend/ml_pipeline/data/processed", exist_ok=True)
    X.to_csv("backend/ml_pipeline/data/processed/X_train.csv", index=False)
    y.to_csv("backend/ml_pipeline/data/processed/y_train.csv", index=False)
    
    # Save Feature Engineer
    fe.save(settings.FEATURE_ENGINEER_PATH)
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    # Train classifier (mock using Scikit-Learn RandomForest to ensure compatibility if LightGBM fails)
    try:
        from lightgbm import LGBMClassifier
        clf = LGBMClassifier(n_estimators=50, random_state=42)
        clf.fit(X_train, y_train)
        logger.info("Trained LightGBM model successfully.")
    except Exception as e:
        logger.warning(f"LightGBM training failed: {e}. Falling back to RandomForestClassifier.")
        from sklearn.ensemble import RandomForestClassifier
        clf = RandomForestClassifier(n_estimators=50, random_state=42)
        clf.fit(X_train, y_train)
        
    # Predict & Evaluate
    preds = clf.predict(X_test)
    accuracy = float(accuracy_score(y_test, preds))
    f1 = float(f1_score(y_test, preds, average="macro"))
    precision = float(precision_score(y_test, preds, average="macro", zero_division=0))
    recall = float(recall_score(y_test, preds, average="macro", zero_division=0))
    
    logger.info(f"Model Evaluated: Accuracy={accuracy:.4f}, F1={f1:.4f}")
    
    # Save model binary
    os.makedirs(os.path.dirname(settings.MODEL_PATH), exist_ok=True)
    with open(settings.MODEL_PATH, "wb") as f:
        pickle.dump(clf, f)
    logger.info(f"Model saved successfully to {settings.MODEL_PATH}")
    
    # Save Model metrics in DB
    db = SessionLocal()
    try:
        db.query(ModelMetric).update({ModelMetric.active: False})
        metric = ModelMetric(
            model_name="lightgbm_retrained",
            accuracy=accuracy,
            f1_score=f1,
            precision=precision,
            recall=recall,
            active=True
        )
        db.add(metric)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log metrics in DB: {e}")
    finally:
        db.close()
        
    # 4. Log to MLflow
    if HAS_MLFLOW:
        try:
            mlflow.set_tracking_uri(settings.MLFLOW_TRACKING_URI)
            mlflow.set_experiment(settings.MLFLOW_EXPERIMENT_NAME)
            with mlflow.start_run(run_name="mlops_pipeline_retrain"):
                mlflow.log_param("estimator", type(clf).__name__)
                mlflow.log_param("dataset_size", len(df))
                mlflow.log_metric("accuracy", accuracy)
                mlflow.log_metric("f1_score", f1)
                mlflow.log_metric("precision", precision)
                mlflow.log_metric("recall", recall)
            logger.info("Successfully logged parameters and metrics to MLflow.")
        except Exception as ex:
            logger.warning(f"MLflow logging bypassed: {ex}")
            
    # DVC Tracking Hook
    logger.info("Executing DVC Commit Hook...")
    os.system("dvc commit -f")
    logger.info("DVC commit complete.")

if __name__ == "__main__":
    run_retraining()
