"""
Model Retraining API Endpoint Router
"""

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks

from backend.app.middleware.auth import get_current_user
from backend.app.services.model_loader import model_loader
from backend.app.utils.logger import setup_logger
from backend.mlops.training.retrain import run_retraining

logger = setup_logger("api_retrain")
router = APIRouter()

# Thread-safe in-memory state tracking retraining status
RETRAIN_STATUS = {
    "status": "idle",
    "last_run": None,
    "error": None
}


def execute_background_retrain():
    """Background task to run the retraining pipeline and reload the model"""
    global RETRAIN_STATUS
    RETRAIN_STATUS["status"] = "running"
    RETRAIN_STATUS["error"] = None
    try:
        logger.info("Initializing background retraining pipeline...")
        # Run training scripts
        run_retraining()
        # Reload models in memory singleton
        model_loader.reload()
        RETRAIN_STATUS["status"] = "completed"
        RETRAIN_STATUS["last_run"] = datetime.utcnow().isoformat()
        logger.info("Background retraining completed successfully.")
    except Exception as e:
        logger.error(f"Background retraining failed: {e}", exc_info=True)
        RETRAIN_STATUS["status"] = "failed"
        RETRAIN_STATUS["error"] = str(e)
        RETRAIN_STATUS["last_run"] = datetime.utcnow().isoformat()


@router.post("/retrain", tags=["Model Actions"])
async def trigger_retraining(background_tasks: BackgroundTasks, current_user: dict = Depends(get_current_user)):
    """Triggers asynchronous retraining of the LightGBM classifier (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )

    global RETRAIN_STATUS
    if RETRAIN_STATUS["status"] == "running":
        return {
            "message": "Retraining is already in progress.",
            "status": "running"
        }

    background_tasks.add_task(execute_background_retrain)
    return {
        "message": "Retraining job started in the background.",
        "status": "running"
    }


@router.get("/retrain/status", tags=["Model Actions"])
async def get_retraining_status(current_user: dict = Depends(get_current_user)):
    """Returns the current execution state of the retrainer (admin only)"""
    if current_user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required."
        )
    return RETRAIN_STATUS
