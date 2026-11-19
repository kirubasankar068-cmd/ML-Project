"""
Model Retraining & Lifecycle Management API Router
"""

from datetime import datetime, timezone
from typing import Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks

from backend.app.middleware.auth import get_current_user
from backend.app.services.smart_bug_priority import (
    retrain_model,
    verify_prediction,
    continuous_learning_pipeline,
    promote_model,
    rollback_model
)
run_retraining = retrain_model
from backend.app.database.database import SessionLocal
from backend.app.database.models import ModelVersion
from backend.app.utils.logger import setup_logger

from backend.app.services.training_stats_service import training_stats_service
from backend.app.middleware.auth import get_optional_user

logger = setup_logger("api_retrain")
router = APIRouter()

RETRAIN_STATUS = {
    "status": "idle",
    "last_run": None,
    "error": None
}


class VerifyPredictionRequest(BaseModel):
    bug_id: str
    actual_priority: str = Field(..., description="Actual verified priority: LOW, MEDIUM, HIGH, CRITICAL")
    verified_by: Optional[str] = Field(default="admin", description="Verifier name or user ID")


class RetrainSettingsRequest(BaseModel):
    auto_train_enabled: bool = True
    samples_needed_for_retrain: int = Field(default=100, ge=1)


def execute_background_retrain():
    """Background task executing continuous learning retrain via RetrainAgent"""
    global RETRAIN_STATUS
    RETRAIN_STATUS["status"] = "running"
    RETRAIN_STATUS["error"] = None
    training_stats_service.update_training_status("Training")
    try:
        logger.info("Initializing background retraining task with RetrainAgent...")
        from backend.scripts.retrain_agent import RetrainAgent
        agent = RetrainAgent()
        res = agent.run_retraining()
        RETRAIN_STATUS["status"] = "completed"
        RETRAIN_STATUS["last_run"] = datetime.now(timezone.utc).isoformat()
        RETRAIN_STATUS["result"] = res
        training_stats_service.update_training_status("Completed", result=res if isinstance(res, dict) else {})
        logger.info(f"Background retraining completed. Result: {res}")
    except Exception as e:
        logger.error(f"Background retraining failed: {e}", exc_info=True)
        RETRAIN_STATUS["status"] = "failed"
        RETRAIN_STATUS["error"] = str(e)
        RETRAIN_STATUS["last_run"] = datetime.now(timezone.utc).isoformat()
        training_stats_service.update_training_status("Failed")


@router.get("/retrain/stats", tags=["Model Actions"])
async def get_model_training_stats(current_user: Optional[dict] = Depends(get_optional_user)):
    """Returns persistent model_training_stats for Settings page"""
    return training_stats_service.get_stats()


@router.post("/retrain/settings", tags=["Model Actions"])
async def update_model_training_settings(
    payload: RetrainSettingsRequest,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Updates auto-train enabled toggle and samples_needed_for_retrain threshold"""
    res = training_stats_service.update_settings(
        auto_train_enabled=payload.auto_train_enabled,
        threshold=payload.samples_needed_for_retrain
    )
    return res


@router.post("/retrain/train-now", tags=["Model Actions"])
async def train_now_endpoint(
    background_tasks: BackgroundTasks,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Triggers immediate manual retraining in background"""
    global RETRAIN_STATUS
    if RETRAIN_STATUS["status"] == "running":
        return {
            "message": "Retraining is already in progress.",
            "status": "running"
        }

    training_stats_service.update_training_status("Training")
    background_tasks.add_task(execute_background_retrain)
    return {
        "message": "Manual retraining job triggered in background.",
        "status": "running"
    }


@router.post("/retrain", tags=["Model Actions"])
async def trigger_retraining(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Triggers retraining of the model pipeline"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for retraining operations."
        )
    global RETRAIN_STATUS
    if RETRAIN_STATUS["status"] == "running":
        return {
            "message": "Retraining is already in progress.",
            "status": "running"
        }

    training_stats_service.update_training_status("Training")
    background_tasks.add_task(execute_background_retrain)
    return {
        "message": "Retraining job started in the background.",
        "status": "running"
    }


@router.get("/retrain/status", tags=["Model Actions"])
async def get_retraining_status(current_user: dict = Depends(get_current_user)):
    """Returns current retraining execution state"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required for retraining status."
        )
    return RETRAIN_STATUS


@router.post("/verify", tags=["Model Actions"])
async def verify_prediction_endpoint(
    payload: VerifyPredictionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user)
):
    """
    Submits developer/admin verified actual priority for a bug.
    Stores verified priority, increments model_training_stats verified count,
    and triggers auto-training when threshold reached.
    """
    res = verify_prediction(
        bug_id=payload.bug_id,
        actual_priority=payload.actual_priority,
        verified_by=payload.verified_by or current_user.get("sub", "admin")
    )

    stats, should_autotrain = training_stats_service.increment_verified_sample()
    if should_autotrain:
        logger.info(f"Auto-train threshold reached ({stats['new_verified_samples']}/{stats['samples_needed_for_retrain']}). Triggering background retraining.")
        background_tasks.add_task(execute_background_retrain)

    res["training_stats"] = stats
    return res



@router.get("/model-versions", tags=["Model Versioning"])
async def list_model_versions(current_user: dict = Depends(get_current_user)):
    """Returns list of all model versions with evaluation metrics"""
    db = SessionLocal()
    try:
        versions = db.query(ModelVersion).order_by(ModelVersion.id.desc()).all()
        result = []
        for v in versions:
            result.append({
                "model_version": v.model_version,
                "dataset_version": v.dataset_version,
                "training_date": v.training_date.isoformat() if v.training_date else None,
                "accuracy": v.accuracy,
                "precision": v.precision,
                "recall": v.recall,
                "f1_score": v.f1_score,
                "macro_f1": v.macro_f1,
                "model_status": v.model_status,
                "model_file": v.model_file,
                "verified_samples_count": v.verified_samples_count
            })
        return {"total": len(result), "versions": result}
    finally:
        db.close()


@router.post("/models/promote/{version}", tags=["Model Versioning"])
async def promote_model_endpoint(version: str, current_user: dict = Depends(get_current_user)):
    """Promotes a specific model version to production active state"""
    res = promote_model(version)
    if res.get("status") == "failed":
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res


@router.post("/models/rollback", tags=["Model Versioning"])
async def rollback_model_endpoint(current_user: dict = Depends(get_current_user)):
    """Rolls back production active model to previous active version"""
    res = rollback_model()
    if res.get("status") == "failed":
        raise HTTPException(status_code=400, detail=res.get("message", "Rollback failed"))
    return res
