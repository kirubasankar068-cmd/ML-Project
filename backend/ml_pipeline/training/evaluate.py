"""
Model Evaluation Script
"""

import os
import pickle
import logging
import pandas as pd
from sklearn.metrics import classification_report, confusion_matrix, roc_auc_score

logger = logging.getLogger(__name__)

def evaluate_model(model_path: str, x_test_path: str, y_test_path: str, output_dir: str = "ml_pipeline/data/processed"):
    """Loads a model and datasets to calculate metrics"""
    logger.info("Starting model evaluation...")
    
    # Load test data
    X_test = pd.read_csv(x_test_path)
    y_test = pd.read_csv(y_test_path).squeeze()
    
    # Load model
    if not os.path.exists(model_path):
        raise FileNotFoundError(f"Model file not found at {model_path}")
        
    with open(model_path, 'rb') as f:
        model = pickle.load(f)
        
    # Make predictions
    y_pred = model.predict(X_test)
    y_pred_proba = model.predict_proba(X_test)
    
    # Classification Report
    priority_map = {0: 'Low', 1: 'Medium', 2: 'High', 3: 'Critical'}
    target_names = [priority_map[i] for i in range(4)]
    
    report = classification_report(y_test, y_pred, target_names=target_names, output_dict=True)
    report_text = classification_report(y_test, y_pred, target_names=target_names)
    
    logger.info("\nClassification Report:\n" + report_text)
    
    # Save report to csv
    os.makedirs(output_dir, exist_ok=True)
    report_df = pd.DataFrame(report).transpose()
    report_df.to_csv(os.path.join(output_dir, "classification_report.csv"))
    
    # Confusion Matrix
    cm = confusion_matrix(y_test, y_pred)
    pd.DataFrame(cm, index=target_names, columns=target_names).to_csv(
        os.path.join(output_dir, "confusion_matrix.csv")
    )
    
    logger.info("Evaluation complete. Metrics saved to output directory.")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    evaluate_model(
        model_path="backend/app/models/optimized_lightgbm_model.pkl",
        x_test_path="ml_pipeline/data/processed/X_test.csv",
        y_test_path="ml_pipeline/data/processed/y_test.csv"
    )
