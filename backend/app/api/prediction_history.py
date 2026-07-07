"""
Prediction History and Export API Endpoints Router
"""

import csv
import io
import json
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.app.database.database import get_db
from backend.app.database.models import Prediction, AuditLog, User
from backend.app.schemas.prediction import (
    PredictionHistoryResponse, PredictionHistoryRecord, PredictionResponse,
    PriorityPrediction, PredictionExplanation, PredictionReviewAction
)
from backend.app.middleware.auth import get_current_user
from backend.app.database.mongodb import mongo_client
from backend.app.utils.logger import setup_logger

logger = setup_logger("api_history")
router = APIRouter()


def log_history_audit(action: str, user_id: Optional[int], username: Optional[str], description: str, db: Session, ip_address: Optional[str] = None):
    """Helper to log audit events into both SQLite and MongoDB (if active)"""
    try:
        audit = AuditLog(action=action, user_id=user_id, description=description, ip_address=ip_address)
        db.add(audit)
        db.commit()
    except Exception as e:
        logger.error(f"Failed to log audit in SQLite: {e}")
        db.rollback()

    if mongo_client.is_active:
        try:
            mongo_client.audit_logs.insert_one({
                "action": action,
                "username": username,
                "description": description,
                "ip_address": ip_address,
                "timestamp": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Failed to log audit in MongoDB: {e}")


def make_prediction_response(r: Prediction) -> PredictionResponse:
    """Helper to convert SQLite Prediction model into PredictionResponse"""
    try:
        recs = json.loads(r.recommendations_json) if r.recommendations_json else []
    except Exception:
        recs = [r.recommendation] if r.recommendation else []
        
    try:
        prevs = json.loads(r.prevention_json) if r.prevention_json else []
    except Exception:
        prevs = []
        
    est_fix = "3 days" if r.predicted_priority == "Low" else "1 day"
    modules = [f"{r.component}_core"]
    
    priority_scores_map = {'Low': 0.0, 'Medium': 1.0, 'High': 2.0, 'Critical': 3.0}
    score = priority_scores_map.get(r.predicted_priority, 1.0)
    
    return PredictionResponse(
        bug_id=r.bug_id,
        prediction=PriorityPrediction(
            priority=r.predicted_priority,
            priority_score=score,
            confidence=r.confidence,
            probabilities={'Low': 0.1, 'Medium': 0.8, 'High': 0.1, 'Critical': 0.0}
        ),
        local_model_priority=r.local_model_priority,
        gemini_verified_priority=r.gemini_verified_priority,
        decision_status=r.decision_status,
        recommendation=r.recommendation or "",
        explanation=PredictionExplanation(
            reasoning=r.explanation or "",
            shap_impacts=[]
        ),
        estimated_fix_time=est_fix,
        affected_modules=modules,
        timestamp=r.timestamp or datetime.utcnow(),
        category=r.category,
        rootCause=r.root_cause,
        impact=r.impact,
        solution=r.solution,
        recommendation_list=recs,
        prevention=prevs
    )


def make_prediction_response_from_mongo(doc: dict) -> PredictionResponse:
    """Helper to convert MongoDB Prediction document into PredictionResponse"""
    try:
        recs = json.loads(doc.get("recommendations_json", "[]")) if doc.get("recommendations_json") else []
    except Exception:
        recs = [doc.get("recommendation", "")] if doc.get("recommendation") else []
        
    try:
        prevs = json.loads(doc.get("prevention_json", "[]")) if doc.get("prevention_json") else []
    except Exception:
        prevs = []
        
    est_fix = "3 days" if doc.get("predicted_priority") == "Low" else "1 day"
    modules = [f"{doc.get('component')}_core"]
    
    priority_scores_map = {'Low': 0.0, 'Medium': 1.0, 'High': 2.0, 'Critical': 3.0}
    score = priority_scores_map.get(doc.get("predicted_priority"), 1.0)
    
    ts = doc.get("timestamp")
    if not isinstance(ts, datetime):
        ts = datetime.utcnow()
        
    return PredictionResponse(
        bug_id=doc.get("bug_id"),
        prediction=PriorityPrediction(
            priority=doc.get("predicted_priority"),
            priority_score=score,
            confidence=doc.get("confidence", 0.0),
            probabilities={'Low': 0.1, 'Medium': 0.8, 'High': 0.1, 'Critical': 0.0}
        ),
        local_model_priority=doc.get("local_model_priority"),
        gemini_verified_priority=doc.get("gemini_verified_priority"),
        decision_status=doc.get("decision_status", "Auto-Approved"),
        recommendation=doc.get("recommendation", ""),
        explanation=PredictionExplanation(
            reasoning=doc.get("explanation", ""),
            shap_impacts=[]
        ),
        estimated_fix_time=est_fix,
        affected_modules=modules,
        timestamp=ts,
        category=doc.get("category"),
        rootCause=doc.get("root_cause"),
        impact=doc.get("impact"),
        solution=doc.get("solution"),
        recommendation_list=recs,
        prevention=prevs
    )


@router.get("/predictions", response_model=PredictionHistoryResponse, tags=["History"])
async def get_prediction_history(
    limit: int = 20,
    offset: int = 0,
    priority: Optional[str] = None,
    component: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Returns a filtered and paginated list of bug predictions history"""
    # 1. Fetch from MongoDB (if active)
    if mongo_client.is_active:
        try:
            filter_query = {}
            if priority:
                filter_query["predicted_priority"] = priority
            if component:
                filter_query["component"] = component
                
            cursor = mongo_client.predictions.find(filter_query)
            total = mongo_client.predictions.count_documents(filter_query)
            
            records = list(cursor.sort("timestamp", -1).skip(offset).limit(limit))
            history_records = []
            
            for r in records:
                ts = r.get("timestamp")
                ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
                history_records.append(PredictionHistoryRecord(
                    id=str(r["_id"]),
                    bug_id=r.get("bug_id"),
                    title=r.get("title"),
                    severity=r.get("severity"),
                    component=r.get("component"),
                    predicted_priority=r.get("predicted_priority"),
                    confidence=r.get("confidence"),
                    recommendation=r.get("recommendation"),
                    timestamp=ts_str
                ))
            return PredictionHistoryResponse(total=total, history=history_records)
        except Exception as e:
            logger.error(f"Failed to query predictions history in MongoDB: {e}")

    # 2. Fall back to SQLite
    query = db.query(Prediction)
    if priority:
        query = query.filter(Prediction.predicted_priority == priority)
    if component:
        query = query.filter(Prediction.component == component)
        
    total = query.count()
    records = query.order_by(Prediction.timestamp.desc()).offset(offset).limit(limit).all()
    
    history_records = []
    for r in records:
        history_records.append(PredictionHistoryRecord(
            id=r.id,
            bug_id=r.bug_id,
            title=r.title,
            severity=r.severity,
            component=r.component,
            predicted_priority=r.predicted_priority,
            confidence=r.confidence,
            recommendation=r.recommendation,
            timestamp=r.timestamp.isoformat() if r.timestamp else None
        ))
        
    return PredictionHistoryResponse(total=total, history=history_records)


@router.get("/predictions/{bug_id}", response_model=PredictionResponse, tags=["History"])
async def get_prediction_detail(
    bug_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Retrieves detailed fields of a single prediction"""
    if mongo_client.is_active:
        try:
            record = mongo_client.predictions.find_one({"bug_id": bug_id})
            if record:
                return make_prediction_response_from_mongo(record)
        except Exception as e:
            logger.error(f"Failed to query single prediction in MongoDB: {e}")

    record = db.query(Prediction).filter(Prediction.bug_id == bug_id).first()
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction record with bug_id {bug_id} not found"
        )
    return make_prediction_response(record)


@router.post("/predictions/{bug_id}/review", response_model=PredictionResponse, tags=["History"])
async def resolve_human_review(
    bug_id: str,
    action: PredictionReviewAction,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allows updating or overriding the predicted priority of a bug report"""
    # SQLite fetch
    record = db.query(Prediction).filter(Prediction.bug_id == bug_id).first()
    
    # MongoDB fetch (if active)
    mongo_record = None
    if mongo_client.is_active:
        try:
            mongo_record = mongo_client.predictions.find_one({"bug_id": bug_id})
        except Exception as e:
            logger.error(f"Failed to find review record in MongoDB: {e}")

    if not record and not mongo_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Prediction record with bug_id {bug_id} not found"
        )

    # Resolve new status
    old_priority = record.predicted_priority if record else mongo_record.get("predicted_priority")
    new_priority = action.approved_priority
    decision_status = "Overridden" if old_priority != new_priority else "Approved"
    
    original_recommendation = record.recommendation if record else mongo_record.get("recommendation", "")
    recommendation = f"{original_recommendation} [HUMAN RESOLUTION: {action.reason}]"

    # SQLite Update
    if record:
        record.predicted_priority = new_priority
        record.decision_status = decision_status
        record.recommendation = recommendation
        db.commit()
        db.refresh(record)

    # MongoDB Update
    if mongo_client.is_active:
        try:
            mongo_client.predictions.update_one(
                {"bug_id": bug_id},
                {"$set": {
                    "predicted_priority": new_priority,
                    "decision_status": decision_status,
                    "recommendation": recommendation
                }}
            )
        except Exception as e:
            logger.error(f"Failed to update prediction in MongoDB: {e}")

    # Fetch SQLite User ID for Auditing
    user_id = db.query(User.id).filter(User.username == current_user.get("sub")).scalar()
    
    # Audit log
    log_history_audit(
        "BUG_REVIEW_RESOLVED",
        user_id,
        current_user.get("sub"),
        f"Bug {bug_id} priority changed from {old_priority} to {new_priority}. Reason: {action.reason}",
        db
    )

    if record:
        return make_prediction_response(record)
    else:
        # Re-fetch from MongoDB
        updated_mongo = mongo_client.predictions.find_one({"bug_id": bug_id})
        return make_prediction_response_from_mongo(updated_mongo)


def generate_csv_stream(predictions: List[Prediction]):
    """Generator function to stream prediction rows in CSV format"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write CSV header
    writer.writerow([
        "ID", "Bug ID", "Title", "Severity", "Component", 
        "Predicted Priority", "Confidence", "Decision Status", 
        "Category", "Root Cause", "Impact", "Solution", "Timestamp"
    ])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)
    
    for r in predictions:
        writer.writerow([
            r.id,
            r.bug_id,
            r.title,
            r.severity,
            r.component,
            r.predicted_priority,
            r.confidence,
            r.decision_status,
            r.category,
            r.root_cause,
            r.impact,
            r.solution,
            r.timestamp.isoformat() if r.timestamp else ""
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


def generate_csv_stream_from_mongo(predictions: List[dict]):
    """Generator function to stream MongoDB documents in CSV format"""
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write CSV header
    writer.writerow([
        "ID", "Bug ID", "Title", "Severity", "Component", 
        "Predicted Priority", "Confidence", "Decision Status", 
        "Category", "Root Cause", "Impact", "Solution", "Timestamp"
    ])
    yield output.getvalue()
    output.seek(0)
    output.truncate(0)
    
    for doc in predictions:
        ts = doc.get("timestamp")
        ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
        writer.writerow([
            str(doc.get("_id")),
            doc.get("bug_id"),
            doc.get("title"),
            doc.get("severity"),
            doc.get("component"),
            doc.get("predicted_priority"),
            doc.get("confidence"),
            doc.get("decision_status"),
            doc.get("category"),
            doc.get("root_cause"),
            doc.get("impact"),
            doc.get("solution"),
            ts_str
        ])
        yield output.getvalue()
        output.seek(0)
        output.truncate(0)


@router.get("/predictions/export/csv", tags=["History"])
async def export_predictions_csv(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Streams the entire predictions history in CSV format for download"""
    if mongo_client.is_active:
        try:
            records = list(mongo_client.predictions.find().sort("timestamp", -1))
            return StreamingResponse(
                generate_csv_stream_from_mongo(records),
                media_type="text/csv",
                headers={"Content-Disposition": "attachment; filename=prediction_history.csv"}
            )
        except Exception as e:
            logger.error(f"Failed to fetch CSV records from MongoDB: {e}")

    # Fallback to SQLite
    records = db.query(Prediction).order_by(Prediction.timestamp.desc()).all()
    return StreamingResponse(
        generate_csv_stream(records),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=prediction_history.csv"}
    )
