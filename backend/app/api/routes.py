"""
FastAPI Routes Endpoint Module
"""

import time
import os
from datetime import datetime, timedelta
from typing import List
from uuid import uuid4
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks

from backend.app.schemas.prediction import (
    BugReportRequest, PredictionResponse, PriorityPrediction,
    PredictionExplanation, SHAPFeatureImpact, BatchPredictionRequest,
    BatchPredictionResponse, HealthResponse, ModelInfoResponse, ModelMetrics,
    PredictionHistoryResponse, PredictionHistoryRecord, UserLoginRequest, UserLoginResponse
)
from backend.app.services.model_loader import model_loader
from backend.app.services.predictor import predictor_service
from backend.app.middleware.auth import get_current_user, create_access_token
from backend.app.utils.db import history_db
from backend.app.utils.logger import setup_logger

logger = setup_logger("routes")
router = APIRouter()

# Simple mock user DB
MOCK_USERS = {
    "admin": "admin123",
    "developer": "dev123"
}

# In-memory retrain status tracker
RETRAIN_STATUS = {
    "status": "idle",
    "last_run": None,
    "error": None
}


@router.post("/login", response_model=UserLoginResponse, tags=["Authentication"])
async def login(payload: UserLoginRequest):
    """Logs a user in and returns a bearer access token"""
    username = payload.username
    password = payload.password
    
    if username in MOCK_USERS and MOCK_USERS[username] == password:
        token = create_access_token(
            data={"sub": username, "role": "admin" if username == "admin" else "user"}
        )
        return UserLoginResponse(access_token=token)
        
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Incorrect username or password"
    )


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check() -> HealthResponse:
    """Checks the health of the API and if models are loaded"""
    is_loaded = model_loader.model is not None
    api_status = "healthy" if is_loaded else "unhealthy"
    
    return HealthResponse(
        status=api_status,
        model_loaded=is_loaded,
        api_version="1.0.0",
        timestamp=datetime.utcnow()
    )


@router.get("/model-info", response_model=ModelInfoResponse, tags=["Model Info"])
async def get_model_info(current_user: dict = Depends(get_current_user)) -> ModelInfoResponse:
    """Returns metadata about the active ML model"""
    model = model_loader.model
    fe = model_loader.feature_engineer
    
    model_type = type(model).__name__ if model else "None Loaded"
    feature_names = fe.get_feature_names() if fe else []
    
    return ModelInfoResponse(
        app_name="Smart Bug Analyzer",
        version="1.0.0",
        model_type=model_type,
        feature_names=feature_names
    )


@router.post("/predict", response_model=PredictionResponse, tags=["Predictions"])
async def predict_priority(bug_report: BugReportRequest, current_user: dict = Depends(get_current_user)) -> PredictionResponse:
    """Predicts the priority level for a single bug report"""
    start_time = time.time()
    bug_id = f"BUG-{datetime.utcnow().strftime('%Y%m%d')}-{uuid4().hex[:6].upper()}"
    
    try:
        bug_data = bug_report.dict()
        
        # Execute prediction
        pred_result, features_df = predictor_service.predict(bug_data)
        
        # Generate explanations
        explanation_result = predictor_service.get_explanation(bug_data, pred_result, features_df)
        
        # Recommendations
        priority = pred_result['priority']
        conf = pred_result['confidence']
        
        if priority == 'Critical' and conf > 0.75:
            rec = "URGENT: Assign to Senior On-Call Engineer immediately. Open Zoom bridge."
        elif priority == 'Critical' or priority == 'High':
            rec = "High Priority: Include in the current active sprint. Assign within 24 hours."
        elif priority == 'Medium':
            rec = "Medium Priority: Add to upcoming sprint planning queue. Assign to feature developer."
        else:
            rec = "Low Priority: File to backlog. Address during routine maintenance cycles."

        # Logging to MLflow if available
        try:
            import mlflow
            # Ensure an active run or start one
            if mlflow.active_run() is None:
                mlflow.start_run(run_name="api_inference")
            mlflow.log_param("severity", bug_report.severity)
            mlflow.log_param("component", bug_report.component)
            mlflow.log_metric("confidence", conf)
            mlflow.log_param("predicted_priority", priority)
        except Exception:
            pass # MLflow integration is optional/fail-safe

        # Prepare response object
        response = PredictionResponse(
            bug_id=bug_id,
            prediction=PriorityPrediction(
                priority=priority,
                priority_score=pred_result['priority_score'],
                confidence=conf,
                probabilities=pred_result['probabilities']
            ),
            recommendation=rec,
            explanation=PredictionExplanation(
                reasoning=explanation_result['reasoning'],
                shap_impacts=[
                    SHAPFeatureImpact(feature=item['feature'], impact=item['impact'])
                    for item in explanation_result['shap_impacts']
                ]
            ),
            timestamp=datetime.utcnow()
        )
        
        # Insert into SQLite history DB
        history_record = {
            'bug_id': bug_id,
            'title': bug_report.title,
            'severity': bug_report.severity,
            'component': bug_report.component,
            'predicted_priority': priority,
            'confidence': conf,
            'recommendation': rec,
            'timestamp': response.timestamp.isoformat()
        }
        history_db.insert_prediction(history_record)
        
        latency_ms = (time.time() - start_time) * 1000
        logger.info(f"Prediction made for {bug_id} in {latency_ms:.1f}ms - Predicted: {priority}")
        return response
        
    except Exception as e:
        logger.error(f"Inference pipeline failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction execution failed: {str(e)}"
        )


@router.post("/batch-predict", response_model=BatchPredictionResponse, tags=["Predictions"])
async def batch_predict(payload: BatchPredictionRequest, current_user: dict = Depends(get_current_user)) -> BatchPredictionResponse:
    """Predicts priority levels for up to 1000 bugs in batch"""
    bugs = payload.bugs
    total = len(bugs)
    processed = 0
    failed = 0
    predictions = []
    
    for item in bugs:
        try:
            # We reuse the predict logic
            single_pred = await predict_priority(item, current_user)
            predictions.append(single_pred)
            processed += 1
        except Exception as e:
            logger.warning(f"Failed to process batch item '{item.title}': {e}")
            failed += 1
            
    return BatchPredictionResponse(
        total=total,
        processed=processed,
        failed=failed,
        predictions=predictions,
        timestamp=datetime.utcnow()
    )


@router.get("/prediction-history", response_model=PredictionHistoryResponse, tags=["Predictions"])
async def get_prediction_history(limit: int = 50, current_user: dict = Depends(get_current_user)) -> PredictionHistoryResponse:
    """Returns recent predictions saved in database"""
    history = history_db.get_history(limit)
    records = []
    
    for row in history:
        records.append(PredictionHistoryRecord(
            id=row.get('id'),
            bug_id=row.get('bug_id'),
            title=row.get('title'),
            severity=row.get('severity'),
            component=row.get('component'),
            predicted_priority=row.get('predicted_priority'),
            confidence=row.get('confidence'),
            recommendation=row.get('recommendation'),
            timestamp=row.get('timestamp')
        ))
        
    return PredictionHistoryResponse(
        total=len(records),
        history=records
    )


@router.get("/metrics", tags=["Metrics"])
async def get_prometheus_metrics():
    """Generates real-time Prometheus metrics scraped by monitoring agents"""
    summary = history_db.get_metrics_summary()
    
    # Format according to Prometheus exposition standard
    lines = [
        "# HELP bug_priority_predictions_total Total bug priority predictions made",
        "# TYPE bug_priority_predictions_total counter",
        f"bug_priority_predictions_total {summary['total']}",
        "",
        "# HELP bug_priority_predictions_by_class_total Bug predictions grouped by predicted priority class",
        "# TYPE bug_priority_predictions_by_class_total counter",
        f'bug_priority_predictions_by_class_total{{class="Low"}} {summary["low"]}',
        f'bug_priority_predictions_by_class_total{{class="Medium"}} {summary["medium"]}',
        f'bug_priority_predictions_by_class_total{{class="High"}} {summary["high"]}',
        f'bug_priority_predictions_by_class_total{{class="Critical"}} {summary["critical"]}',
        "",
        "# HELP bug_priority_predictions_average_confidence Average model prediction confidence",
        "# TYPE bug_priority_predictions_average_confidence gauge",
        f"bug_priority_predictions_average_confidence {summary['avg_confidence']:.4f}",
        ""
    ]
    
    from fastapi.responses import PlainTextResponse
    return PlainTextResponse("\n".join(lines))


def execute_background_retrain():
    """Background thread executing the ML retraining process"""
    global RETRAIN_STATUS
    RETRAIN_STATUS["status"] = "running"
    RETRAIN_STATUS["error"] = None
    
    try:
        logger.info("Initializing background retraining task...")
        
        # Imports training modules dynamically to save server startup time
        import pandas as pd
        from ml_pipeline.training.train import ModelTrainer
        from backend.app.services.feature_engineering import FeatureEngineer
        
        # Load raw dataset
        raw_path = "ml_pipeline/data/raw/all_departments_bugs_50k.csv"
        if not os.path.exists(raw_path):
            raise FileNotFoundError(f"Raw training data missing at {raw_path}")
            
        df = pd.read_csv(raw_path)
        
        # Preprocessing
        df = df.dropna(subset=['priority'])
        for col in df.select_dtypes(include=['object']).columns:
            df[col] = df[col].fillna('Unknown')
        for col in df.select_dtypes(include=['int64', 'float64']).columns:
            df[col] = df[col].fillna(df[col].median())
            
        # Fit Feature Engineer
        fe = FeatureEngineer()
        X = fe.fit_transform(df)
        
        priority_map = {'Low': 0, 'Medium': 1, 'High': 2, 'Critical': 3}
        y = df['priority'].map(priority_map)
        
        # Save preprocessed data
        os.makedirs("ml_pipeline/data/processed", exist_ok=True)
        X.to_csv("ml_pipeline/data/processed/X_train.csv", index=False)
        y.to_csv("ml_pipeline/data/processed/y_train.csv", index=False)
        
        # Save fitted Feature Engineer
        fe.save(settings.FEATURE_ENGINEER_PATH)
        
        # Train model
        trainer = ModelTrainer()
        # Mock training context to avoid mlflow failure
        training_results = trainer.train(X, y, test_size=0.2)
        
        if not training_results.get('success', False):
            raise RuntimeError("Model training failed in trainer.train()")
            
        # Save model
        trainer.save(settings.MODEL_PATH)
        
        # Reload models in memory singleton
        model_loader.reload()
        
        RETRAIN_STATUS["status"] = "success"
        RETRAIN_STATUS["last_run"] = datetime.now().isoformat()
        logger.info("Background retraining task completed successfully. Models reloaded.")
        
    except Exception as e:
        logger.error(f"Retraining task failed: {e}")
        RETRAIN_STATUS["status"] = "failed"
        RETRAIN_STATUS["error"] = str(e)
        RETRAIN_STATUS["last_run"] = datetime.now().isoformat()


@router.post("/retrain", tags=["Model Actions"])
async def trigger_retraining(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Triggers asynchronous retraining of the LightGBM classifier"""
    global RETRAIN_STATUS
    
    if RETRAIN_STATUS["status"] == "running":
        return {
            "message": "Retraining is already running in background.",
            "status": RETRAIN_STATUS
        }
        
    background_tasks.add_task(execute_background_retrain)
    return {
        "message": "Retraining task dispatched successfully.",
        "status": "dispatched"
    }


@router.get("/retrain/status", tags=["Model Actions"])
async def get_retraining_status(current_user: dict = Depends(get_current_user)):
    """Returns the current execution state of the retrainer"""
    return RETRAIN_STATUS
