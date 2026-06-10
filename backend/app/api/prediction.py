import os
import shutil
import time
from datetime import datetime
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session

from backend.app.database.database import get_db
from backend.app.database.models import Prediction, UploadedFile, User, AuditLog
from backend.app.schemas.prediction import (
    BugReportRequest, PredictionResponse, PriorityPrediction,
    PredictionExplanation, SHAPFeatureImpact, UserLoginRequest, UserLoginResponse,
    PredictionReviewAction, BatchPredictionResponse, BatchPredictionRequest
)
from backend.app.services.bug_classifier import bug_classifier
from backend.app.services.gemini_service import gemini_service
from backend.app.services.image_analyzer import image_analyzer
from backend.app.services.file_processor import file_processor
from backend.app.middleware.auth import get_current_user, create_access_token
from backend.app.utils.logger import setup_logger

logger = setup_logger("api_prediction")
router = APIRouter()

# Temporary upload storage path
UPLOAD_DIR = "backend/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.post("/login", response_model=UserLoginResponse, tags=["Authentication"])
async def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticates users and issues JWT token"""
    username = payload.username
    password = payload.password
    
    # Check if user exists in Database
    user = db.query(User).filter(User.username == username).first()
    
    # Simple default admin/dev bootstrap if DB is empty
    if not user:
        if username in ["admin", "developer"] and password in ["admin123", "dev123"]:
            # Auto register user
            role = "admin" if username == "admin" else "developer"
            user = User(username=username, password_hash=password, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password"
            )
            
    if user.password_hash != password:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password"
        )
        
    token = create_access_token(data={"sub": user.username, "role": user.role})
    
    # Audit log
    audit = AuditLog(action="USER_LOGIN", user_id=user.id, description=f"User {user.username} logged in.")
    db.add(audit)
    db.commit()
    
    return UserLoginResponse(
        access_token=token,
        role=user.role,
        username=user.username
    )


@router.post("/predict", response_model=PredictionResponse, tags=["Predictions"])
async def predict_single(bug_report: BugReportRequest, cross_check: bool = True, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Predicts bug priority, executing model cross-checks and flags review statuses"""
    import time as _time
    start_time = _time.time()
    # Use nanosecond timestamp + 8-char hex to guarantee uniqueness across batch calls
    bug_id = f"BUG-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}-{uuid4().hex[:8].upper()}"
    
    try:
        bug_data = bug_report.dict()
        
        # 1. Local Model inference
        local_res, features_df = bug_classifier.predict_priority(bug_data)
        local_priority = local_res['priority']
        local_conf = local_res['confidence']
        
        # 2. Gemini verification (if enabled/available and cross_check requested)
        gemini_priority = None
        gemini_conf = 0.0
        explanation_text = ""
        rec_action = ""
        est_fix = "1 day"
        modules = []
        
        if cross_check and gemini_service.enabled:
            try:
                gemini_res = gemini_service.analyze_bug(
                    title=bug_report.title,
                    description=bug_report.description,
                    severity=bug_report.severity,
                    component=bug_report.component
                )
                gemini_priority = gemini_res.get('priority')
                gemini_conf = gemini_res.get('confidence', 0.8)
                explanation_text = gemini_res.get('explanation', '')
                rec_action = gemini_res.get('recommended_action', '')
                est_fix = gemini_res.get('estimated_fix_time', '1 day')
                modules = gemini_res.get('affected_modules', [])
            except Exception as e:
                logger.warning(f"Gemini check skipped: {e}")
                
        # 3. Decision Engine: Compare priority outputs & confidence bounds
        final_priority = local_priority
        final_confidence = local_conf
        decision_status = "Auto-Approved"
        
        if gemini_priority:
            # If priorities differ, or confidence difference is greater than 20%
            conf_diff = abs(local_conf - gemini_conf)
            if local_priority != gemini_priority or conf_diff > 0.20:
                decision_status = "Needs Human Review"
                # Keep local prediction but flag for review
                final_priority = local_priority
            else:
                # Weighted consensus if they align
                final_priority = local_priority
                final_confidence = max(local_conf, gemini_conf)
                
        # Heuristic recommendations if Gemini is missing
        if not rec_action:
            if final_priority == 'Critical':
                rec_action = "CRITICAL: Assign to Senior On-Call Engineer immediately. Open live hotfix bridge."
                explanation_text = "System critical path or severe security breach reported. High business impact."
                modules = [f"{bug_report.component}_core"]
            elif final_priority == 'High':
                rec_action = "High Priority: Include in active sprint backlog. Assign to feature lead."
                explanation_text = "Severe functional exception affecting multiple clients."
                modules = [f"{bug_report.component}_api"]
            elif final_priority == 'Medium':
                rec_action = "Medium Priority: Enqueue in next sprint planning cycle. Assign to developer."
                explanation_text = "General validation or layout error; system remains functional."
                modules = [f"{bug_report.component}_helper"]
            else:
                rec_action = "Low Priority: Enqueue in standard backlog. Address during routine maintenance."
                explanation_text = "Aesthetic issue or minor typo with minimal customer visibility."
                modules = [f"{bug_report.component}_ui"]
                est_fix = "3 days"
                
        # Generate SHAP features list
        shap_list = bug_classifier.get_shap_explanation(bug_data, local_res, features_df)
        
        # Save to DB
        pred_record = Prediction(
            bug_id=bug_id,
            title=bug_report.title,
            severity=bug_report.severity,
            component=bug_report.component,
            predicted_priority=final_priority,
            confidence=final_confidence,
            local_model_priority=local_priority,
            gemini_verified_priority=gemini_priority,
            decision_status=decision_status,
            explanation=explanation_text,
            recommendation=rec_action
        )
        db.add(pred_record)
        db.commit()
        
        # Prepare response
        response = PredictionResponse(
            bug_id=bug_id,
            prediction=PriorityPrediction(
                priority=final_priority,
                priority_score=local_res.get('priority_score', 1.0),
                confidence=final_confidence,
                probabilities=local_res.get('probabilities', {'Low': 0.1, 'Medium': 0.8, 'High': 0.1, 'Critical': 0.0})
            ),
            local_model_priority=local_priority,
            gemini_verified_priority=gemini_priority,
            decision_status=decision_status,
            recommendation=rec_action,
            explanation=PredictionExplanation(
                reasoning=explanation_text,
                shap_impacts=[SHAPFeatureImpact(feature=item['feature'], impact=item['impact']) for item in shap_list]
            ),
            estimated_fix_time=est_fix,
            affected_modules=modules,
            timestamp=datetime.utcnow()
        )
        
        latency = (time.time() - start_time) * 1000
        logger.info(f"Bug predicted: {bug_id} in {latency:.1f}ms status: {decision_status}")
        return response
        
    except Exception as e:
        db.rollback()  # Reset session so subsequent batch items can still commit
        logger.error(f"Prediction flow failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )


@router.post("/predict-file", response_model=BatchPredictionResponse, tags=["Predictions"])
async def predict_file(file: UploadFile = File(...), cross_check: bool = Form(True), current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Processes CSV, XLSX, JSON, LOG, TXT files, predicts priorities, and returns a prioritized list (Critical -> Low)"""
    file_id = uuid4().hex[:12]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    # Save file
    try:
        with open(saved_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")
        
    # Log Upload in DB
    uploaded_record = UploadedFile(
        file_name=file.filename,
        file_type=os.path.splitext(file.filename)[1].replace(".", ""),
        file_size=os.path.getsize(saved_path),
        upload_status="processing",
        uploaded_by=current_user.get("sub", "system")
    )
    db.add(uploaded_record)
    db.commit()
    
    try:
        parsed_bugs = file_processor.process_file(saved_path, file.filename)
        
        predictions = []
        for bug_data in parsed_bugs:
            # Reconstruct Pydantic schema
            report = BugReportRequest(
                title=bug_data['title'],
                description=bug_data['description'],
                severity=bug_data['severity'],
                component=bug_data['component'],
                affected_users=bug_data.get('affected_users', 1),
                is_reproducible=bug_data.get('is_reproducible', True),
                reported_by=bug_data.get('reported_by', 'system'),
                environment=bug_data.get('environment', 'Production'),
                module=bug_data.get('module', 'General')
            )
            pred = await predict_single(report, cross_check, current_user, db)
            predictions.append(pred)
            
        # Priority mapping for sorting
        priority_weights = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
        predictions.sort(key=lambda x: priority_weights.get(x.prediction.priority, 0), reverse=True)
        
        # Update file upload record
        uploaded_record.upload_status = "completed"
        uploaded_record.prediction_count = len(predictions)
        db.commit()
        
        return BatchPredictionResponse(
            total=len(parsed_bugs),
            processed=len(predictions),
            failed=0,
            predictions=predictions
        )
    except Exception as e:
        uploaded_record.upload_status = "failed"
        db.commit()
        logger.error(f"Batch file predictions failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process and predict file: {str(e)}"
        )


@router.post("/batch-predict", response_model=BatchPredictionResponse, tags=["Predictions"])
async def batch_predict(payload: BatchPredictionRequest, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Predicts priority levels for up to 1000 bugs in batch via JSON"""
    bugs = payload.bugs
    predictions = []
    
    for item in bugs:
        try:
            pred = await predict_single(item, current_user, db)
            predictions.append(pred)
        except Exception as e:
            logger.warning(f"Failed to process batch item '{item.title}': {e}")
            
    # Sort by priority
    priority_weights = {"Critical": 4, "High": 3, "Medium": 2, "Low": 1}
    predictions.sort(key=lambda x: priority_weights.get(x.prediction.priority, 0), reverse=True)
    
    return BatchPredictionResponse(
        total=len(bugs),
        processed=len(predictions),
        failed=len(bugs) - len(predictions),
        predictions=predictions
    )


@router.post("/predict-image", response_model=PredictionResponse, tags=["Predictions"])
async def predict_image(file: UploadFile = File(...), current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Accepts bug screenshots, extracts OCR traces, and returns cross-checked priorities"""
    file_id = uuid4().hex[:12]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    try:
        with open(saved_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save image file: {e}")
        
    try:
        # Run OCR pre-processing
        ocr_result = image_analyzer.analyze_image(saved_path)
        
        # Compile a synthetic bug report from OCR text
        title = f"UI Screenshot Trace ({file.filename})"
        description = ocr_result["ocr_text"]
        
        # Determine component
        component = "UI Frontend"
        if ocr_result.get("stack_traces"):
            component = "Backend Exception"
            
        severity = "medium"
        if ocr_result.get("visual_defects") or len(ocr_result.get("detected_errors")) > 1:
            severity = "high"
            
        report = BugReportRequest(
            title=title,
            description=description,
            severity=severity,
            component=component,
            affected_users=10, # assume impact for screenshot reporting
            is_reproducible=True,
            reported_by=current_user.get("sub", "developer"),
            environment="Production",
            module="Visual Capture"
        )
        
        prediction_res = await predict_single(report, current_user, db)
        return prediction_res
        
    except Exception as e:
        logger.error(f"Image analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to analyze screenshot: {str(e)}"
        )


@router.get("/prediction-history", tags=["Predictions"])
async def get_prediction_history(limit: int = 50, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Returns recent predictions saved in database"""
    records = db.query(Prediction).order_by(Prediction.timestamp.desc()).limit(limit).all()
    
    history_records = []
    for r in records:
        history_records.append({
            "id": r.id,
            "bug_id": r.bug_id,
            "title": r.title,
            "severity": r.severity,
            "component": r.component,
            "predicted_priority": r.predicted_priority,
            "confidence": r.confidence,
            "recommendation": r.recommendation,
            "timestamp": r.timestamp.isoformat()
        })
        
    return {
        "total": len(history_records),
        "history": history_records
    }


@router.get("/human-review", response_model=List[PredictionResponse], tags=["Predictions"])
async def list_needs_review(current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Gets all predictions marked as Needs Human Review"""
    records = db.query(Prediction).filter(Prediction.decision_status == "Needs Human Review").all()
    
    response_list = []
    for r in records:
        response_list.append(
            PredictionResponse(
                bug_id=r.bug_id,
                prediction=PriorityPrediction(
                    priority=r.predicted_priority,
                    priority_score=3.0 if r.predicted_priority == 'Critical' else 2.0 if r.predicted_priority == 'High' else 1.0 if r.predicted_priority == 'Medium' else 0.0,
                    confidence=r.confidence,
                    probabilities={'Low': 0.0, 'Medium': 0.0, 'High': 0.0, 'Critical': 0.0}
                ),
                local_model_priority=r.local_model_priority,
                gemini_verified_priority=r.gemini_verified_priority,
                decision_status=r.decision_status,
                recommendation=r.recommendation,
                explanation=PredictionExplanation(
                    reasoning=r.explanation,
                    shap_impacts=[]
                ),
                timestamp=r.timestamp
            )
        )
    return response_list


@router.post("/human-review/{bug_id}", response_model=PredictionResponse, tags=["Predictions"])
async def resolve_human_review(bug_id: str, action: PredictionReviewAction, current_user: dict = Depends(get_current_user), db: Session = Depends(get_db)):
    """Allows an administrator or developer to override or approve predictions"""
    record = db.query(Prediction).filter(Prediction.bug_id == bug_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Prediction record not found")
        
    # Check roles (optional block for enterprise)
    # if current_user.get("role") != "admin":
    #     raise HTTPException(status_code=403, detail="Admin permissions required")
        
    old_priority = record.predicted_priority
    record.predicted_priority = action.approved_priority
    record.decision_status = "Overridden" if old_priority != action.approved_priority else "Approved"
    record.recommendation = f"{record.recommendation} [HUMAN RESOLUTION: {action.reason}]"
    
    # Audit log
    user_id = db.query(User.id).filter(User.username == current_user.get("sub")).scalar()
    audit = AuditLog(
        action="BUG_REVIEW_RESOLVED",
        user_id=user_id,
        description=f"Bug {bug_id} priority changed from {old_priority} to {action.approved_priority}. Reason: {action.reason}"
    )
    db.add(audit)
    db.commit()
    db.refresh(record)
    
    return PredictionResponse(
        bug_id=record.bug_id,
        prediction=PriorityPrediction(
            priority=record.predicted_priority,
            priority_score=3.0,
            confidence=record.confidence,
            probabilities={}
        ),
        local_model_priority=record.local_model_priority,
        gemini_verified_priority=record.gemini_verified_priority,
        decision_status=record.decision_status,
        recommendation=record.recommendation,
        explanation=PredictionExplanation(
            reasoning=record.explanation,
            shap_impacts=[]
        ),
        timestamp=record.timestamp
    )
