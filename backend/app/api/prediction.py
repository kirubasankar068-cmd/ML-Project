import os
import shutil
import time
import json
from datetime import datetime
from uuid import uuid4
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from backend.app.database.database import get_db
from backend.app.database.models import Prediction, UploadedFile, User, AuditLog
from backend.app.schemas.prediction import (
    BugReportRequest, PredictionResponse, PriorityPrediction,
    PredictionExplanation, SHAPFeatureImpact, UserLoginRequest, UserLoginResponse,
    PredictionReviewAction, BatchPredictionResponse, BatchPredictionRequest,
    UserRegisterRequest, GoogleLoginRequest, HealthResponse, ModelInfoResponse,
    FlatPredictionItem
)
from backend.app.services.bug_classifier import bug_classifier
from backend.app.services.gemini_service import gemini_service
from backend.app.services.image_analyzer import image_analyzer
from backend.app.services.file_processor import file_processor
from backend.app.middleware.auth import get_current_user, get_optional_user, create_access_token
from backend.app.utils.logger import setup_logger
from backend.app.config.settings import settings
from google.oauth2 import id_token
from google.auth.transport import requests as google_requests
from backend.app.database.mongodb import mongo_client

logger = setup_logger("api_prediction")
router = APIRouter()

# Temporary upload storage path
UPLOAD_DIR = "backend/data/uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)


def log_audit(action: str, user_id: Optional[int], username: Optional[str], description: str, db: Session, ip_address: Optional[str] = None):
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


@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check(db: Session = Depends(get_db)):
    """Checks the health of the API and if models are loaded"""
    from backend.app.services.model_loader import model_loader
    from sqlalchemy import text
    is_loaded = model_loader.model is not None
    api_status = "ok" if mongo_client.is_active else "error"
    
    # Check DB operation
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False
        
    return HealthResponse(
        status=api_status,
        database="connected" if mongo_client.is_active else "disconnected",
        model_loaded=is_loaded,
        db_operational=db_ok,
        mongodb_operational=mongo_client.is_active,
        api_version="1.0.0",
        timestamp=datetime.utcnow()
    )


@router.get("/model-info", response_model=ModelInfoResponse, tags=["Model Info"])
async def get_model_info(current_user: dict = Depends(get_current_user)) -> ModelInfoResponse:
    """Returns metadata about the active ML model"""
    from backend.app.services.model_loader import model_loader
    model = model_loader.model
    fe = model_loader.feature_engineer
    
    model_type = type(model).__name__ if model else "None Loaded"
    feature_names = fe.get_feature_names() if fe else []
    
    return ModelInfoResponse(
        app_name="Smart Bug Priority Predictor",
        version="1.0.0",
        model_type=model_type,
        feature_names=feature_names
    )


class MongoUserMock:
    def __init__(self, id, username, password_hash, role):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.role = role


@router.post("/login", response_model=UserLoginResponse, tags=["Authentication"])
async def login(payload: UserLoginRequest, db: Session = Depends(get_db)):
    """Authenticates users and issues JWT token"""
    username = payload.username
    password = payload.password
    
    user = None
    # Check if user exists in MongoDB first (if active)
    if mongo_client.is_active:
        try:
            mongo_user = mongo_client.users.find_one({"username": username})
            if mongo_user:
                user = MongoUserMock(
                    id=str(mongo_user["_id"]),
                    username=mongo_user["username"],
                    password_hash=mongo_user["password_hash"],
                    role=mongo_user["role"]
                )
        except Exception as e:
            logger.error(f"Failed to query user in MongoDB: {e}")

    # Fall back to SQLite
    if not user:
        user = db.query(User).filter(User.username == username).first()
    
    # Simple default admin/dev bootstrap if DB is empty
    if not user:
        if username in ["admin", "developer"] and password in ["admin123", "dev123"]:
            # Auto register user in SQLite
            role = "admin" if username == "admin" else "developer"
            user = User(username=username, password_hash=password, role=role)
            db.add(user)
            db.commit()
            db.refresh(user)
            
            # Sync user to MongoDB if active
            if mongo_client.is_active:
                try:
                    mongo_client.users.update_one(
                        {"username": username},
                        {"$set": {
                            "username": username,
                            "password_hash": password,
                            "role": role,
                            "created_at": datetime.utcnow()
                        }},
                        upsert=True
                    )
                except Exception as e:
                    logger.error(f"Failed to sync bootstrapped user to MongoDB: {e}")
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
    
    # Audit log using helper
    user_id_val = user.id if isinstance(user.id, int) else None
    log_audit("USER_LOGIN", user_id_val, user.username, f"User {user.username} logged in.", db)
    
    return UserLoginResponse(
        access_token=token,
        role=user.role,
        username=user.username
    )


@router.post("/register", response_model=UserLoginResponse, tags=["Authentication"])
async def register(payload: UserRegisterRequest, db: Session = Depends(get_db)):
    """Registers a new user with username and password"""
    username = payload.username
    role_val = payload.role or "developer"

    # Check if user already exists
    existing_user = db.query(User).filter(User.username == username).first()
    if not existing_user and mongo_client.is_active:
        try:
            if mongo_client.users.find_one({"username": username}):
                existing_user = True
        except Exception:
            pass

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered"
        )
        
    # Create new user in SQLite
    new_user = User(
        username=username,
        password_hash=payload.password, # Store raw or hashed; standard prediction.py stores raw
        role=role_val
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # Sync new user to MongoDB if active
    if mongo_client.is_active:
        try:
            mongo_client.users.insert_one({
                "username": username,
                "password_hash": payload.password,
                "role": role_val,
                "created_at": datetime.utcnow()
            })
        except Exception as e:
            logger.error(f"Failed to register user in MongoDB: {e}")

    # Audit log using helper
    log_audit("USER_REGISTER", new_user.id, username, f"User {username} registered with password.", db)
    
    # Auto-login after registration
    token = create_access_token(data={"sub": username, "role": role_val})
    return UserLoginResponse(
        access_token=token,
        role=role_val,
        username=username
    )


@router.post("/google-login", response_model=UserLoginResponse, tags=["Authentication"])
async def google_login(payload: GoogleLoginRequest, db: Session = Depends(get_db)):
    """Authenticates or registers users with Google ID Token (Gmail JWT)"""
    token = payload.credential
    client_id = payload.client_id or settings.GOOGLE_CLIENT_ID
    
    email = None
    name = None
    
    # Developer/Mock mode check:
    if token.startswith("mock-google-jwt-"):
        # Format: mock-google-jwt-[email]
        email = token.replace("mock-google-jwt-", "")
        name = email.split("@")[0].capitalize()
    else:
        try:
            # Verify Google token
            # Note: client_id is optional but recommended. If not set, verify_oauth2_token can still verify.
            # We pass requests.Request() to fetch Google's public certificates.
            idinfo = id_token.verify_oauth2_token(token, google_requests.Request(), client_id if client_id else None)
            
            # ID token is valid. Extract user info.
            email = idinfo.get("email")
            name = idinfo.get("name", email.split("@")[0] if email else "Google User")
        except Exception as e:
            logger.error(f"Google JWT verification failed: {e}")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=f"Google JWT verification failed: {str(e)}"
            )
            
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not retrieve email from Google JWT."
        )
        
    user = None
    # Check if user exists in MongoDB first (if active)
    if mongo_client.is_active:
        try:
            mongo_user = mongo_client.users.find_one({"username": email})
            if mongo_user:
                user = MongoUserMock(
                    id=str(mongo_user["_id"]),
                    username=mongo_user["username"],
                    password_hash=mongo_user["password_hash"],
                    role=mongo_user["role"]
                )
        except Exception as e:
            logger.error(f"Failed to query google user in MongoDB: {e}")

    # Fall back to SQLite
    if not user:
        user = db.query(User).filter(User.username == email).first()
    
    if not user:
        # Register user on their first login with Google
        # For password_hash, we store a placeholder so the column constraint is satisfied
        placeholder_pass = f"google_oauth_{uuid4().hex[:12]}"
        user = User(
            username=email,
            password_hash=placeholder_pass,
            role="developer"
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Sync user to MongoDB if active
        if mongo_client.is_active:
            try:
                mongo_client.users.insert_one({
                    "username": email,
                    "password_hash": placeholder_pass,
                    "role": "developer",
                    "created_at": datetime.utcnow()
                })
            except Exception as e:
                logger.error(f"Failed to register google user in MongoDB: {e}")
                
        # Log audit for registration using helper
        log_audit("USER_REGISTER", user.id, email, f"User {email} registered via Gmail JWT.", db)
        
    token_str = create_access_token(data={"sub": user.username, "role": user.role})
    
    # Audit log using helper
    user_id_val = user.id if isinstance(user.id, int) else None
    log_audit("USER_LOGIN", user_id_val, user.username, f"User {user.username} logged in via Google Auth.", db)
    
    return UserLoginResponse(
        access_token=token_str,
        role=user.role,
        username=user.username
    )


def generate_bug_details(title: str, description: str, severity: str, component: str) -> dict:
    text = (str(title) + " " + str(description)).lower()
    
    # Defaults
    priority = "Medium"
    confidence = 75.0
    category = "Functional"
    root_cause = "Code logic error or unhandled edge case in component runtime."
    impact = "Minor functional disruption for affected users."
    solution = "Review the implementation logic, trace exception path, and add boundary checks."
    prevention = [
        "Write unit tests for edge cases",
        "Perform code review of component logic",
        "Add static code analysis checks"
    ]
    recommendations = [
        "Assign to component owner for active sprint",
        "Verify fixes in staging environment before merge",
        "Add integration tests for regression tracking"
    ]
    
    # Rule classification based on keywords
    if any(kw in text for kw in ["sql injection", "sqli", "xss", "cross site", "vulnerability", "security", "exploit", "unauthorized", "privilege", "bypass", "cve", "auth bypass"]):
        category = "Security"
        priority = "Critical"
        confidence = 98.5
        root_cause = "Unsanitized user input in query parameter or insecure authorization controls."
        impact = "Potential database compromise, unauthorized data access, or system takeover."
        solution = "Use parameterized queries / prepared statements and implement strict role-based access checks."
        prevention = [
            "Input validation & sanitization",
            "ORM prepared statements",
            "Security penetration testing",
            "Static application security testing (SAST)"
        ]
        recommendations = [
            "Enable Web Application Firewall (WAF)",
            "Sanitize all input parameters immediately",
            "Audit access logs for malicious activity"
        ]
    elif any(kw in text for kw in ["exhausted", "pool", "oom", "memory leak", "out of memory", "leak", "high memory", "heap", "garbage collector"]):
        category = "Performance"
        priority = "Critical"
        confidence = 95.0
        root_cause = "Connection pool limit exceeded or unreleased resource handles in memory."
        impact = "Server crashes, system freeze, or complete application downtime under load."
        solution = "Increase connection pool size, implement connection recycling, and ensure all database connections/WebSocket listeners are explicitly closed."
        prevention = [
            "Connection pooling validation",
            "Resource leak checking in CI/CD",
            "Load testing with memory profiling",
            "Set resource limits in container config"
        ]
        recommendations = [
            "Monitor active database connections",
            "Add connection timeout limits",
            "Optimize long running queries"
        ]
    elif any(kw in text for kw in ["token", "jwt", "logout", "auth", "session", "login", "password", "expired", "totp", "2fa"]):
        category = "Authentication"
        priority = "High"
        confidence = 88.0
        root_cause = "Insecure session lifecycle management or missing token invalidation logic."
        impact = "Session hijacking or replay attacks allowing access to active user accounts."
        solution = "Implement server-side session invalidation or maintain a Redis-backed token blacklist."
        prevention = [
            "Enforce HTTPS for all session cookies",
            "Rotate JWT tokens on login/logout",
            "Use short-lived access tokens with secure refresh flows"
        ]
        recommendations = [
            "Verify token status in middleware",
            "Enforce absolute session timeouts",
            "Audit authentication flow logs"
        ]
    elif any(kw in text for kw in ["503", "payment", "stripe", "checkout", "billing", "invoice", "transaction", "purchase"]):
        category = "Billing & Payments"
        priority = "Critical"
        confidence = 94.5
        root_cause = "Third-party payment gateway downtime or unhandled response code from API."
        impact = "Inability for customers to complete purchases, resulting in direct revenue loss."
        solution = "Implement circuit breaker pattern, retry mechanism with exponential backoff, and add a secondary payment gateway."
        prevention = [
            "Integrate multiple payment providers",
            "Configure webhook alerts for transaction failures",
            "Write integration tests with payment sandbox"
        ]
        recommendations = [
            "Set up automated billing retry alerts",
            "Notify customer service on 503 errors",
            "Verify webhooks signature validation"
        ]
    elif any(kw in text for kw in ["slow", "timeout", "delay", "lag", "latency", "hang", "freeze", "performance"]):
        category = "Performance"
        priority = "High"
        confidence = 85.0
        root_cause = "Unoptimized database query, blocking synchronous execution, or resource contention."
        impact = "High response latency leading to bad user experience and potential transaction dropouts."
        solution = "Identify slow database queries, add indexes, and run heavy calculations asynchronously in background workers."
        prevention = [
            "Establish API response SLA monitoring",
            "Run regular load tests",
            "Optimize database indexing"
        ]
        recommendations = [
            "Optimize queries using EXPLAIN ANALYZE",
            "Introduce caching layer (e.g. Redis)",
            "Run long tasks in background queues"
        ]
    elif any(kw in text for kw in ["crash", "dump", "nullpointer", "stacktrace", "panic", "critical error", "runtime"]):
        category = "Stability"
        priority = "High"
        confidence = 89.0
        root_cause = "Null pointer reference, unhandled exception in core routines, or panic statement triggered."
        impact = "Unexpected application crash, loss of state, or disrupted user flows."
        solution = "Implement proper exception catch block with safety fallbacks and guard checks before dereferencing."
        prevention = [
            "Add global exception handlers",
            "Implement defensive programming standards",
            "Automate server restart on crash"
        ]
        recommendations = [
            "Add telemetry tracking for uncaught exceptions",
            "Inspect crash dumps and call stacks",
            "Write unit tests reproducing the crash state"
        ]
    elif any(kw in text for kw in ["css", "style", "color", "dark mode", "safari", "layout", "firefox", "ui", "padding", "alignment", "typo", "visual"]):
        category = "UI/UX"
        priority = "Low"
        confidence = 68.0
        root_cause = "CSS specification mismatch, cross-browser styling rendering issues, or minor typographical mistakes."
        impact = "Aesthetic issue or minor layout inconsistency with minimal functional impact."
        solution = "Fix CSS variables, apply layout overrides for browser compatibility, and update text templates."
        prevention = [
            "Implement visual regression tests",
            "Cross-browser testing during development",
            "Review CSS variable hierarchy"
        ]
        recommendations = [
            "Review UI on different viewports",
            "Address during routine maintenance cycles",
            "Update local style guide constants"
        ]
    elif any(kw in text for kw in ["api", "integration", "webhook", "endpoints", "500", "bad gateway"]):
        category = "Integration"
        priority = "Medium"
        confidence = 78.5
        root_cause = "Malformed API payload, expired API key, or missing validation schema."
        impact = "API integration breaks, leading to failure in external communication flows."
        solution = "Validate input schemas using strict validation models, rotate API keys, and update endpoint contracts."
        prevention = [
            "Write API contract/integration tests",
            "Implement API response validation",
            "Add detailed error messages in integration logs"
        ]
        recommendations = [
            "Verify connection to external endpoints",
            "Validate payload schema mappings",
            "Log request/response details on error"
        ]
        
    # Override priority and confidence based on severity parameter if provided
    severity_lower = str(severity).lower()
    if severity_lower == "critical":
        priority = "Critical"
        confidence = max(confidence, 92.0)
    elif severity_lower == "high":
        if priority not in ["Critical"]:
            priority = "High"
        confidence = max(confidence, 82.0)
    elif severity_lower == "medium":
        if priority not in ["Critical", "High"]:
            priority = "Medium"
        confidence = max(confidence, 72.0)
    elif severity_lower == "low":
        if priority not in ["Critical", "High", "Medium"]:
            priority = "Low"
        confidence = min(confidence, 69.5)
        
    return {
        "priority": priority,
        "confidence": confidence,
        "category": category,
        "rootCause": root_cause,
        "impact": impact,
        "solution": solution,
        "prevention": prevention,
        "recommendation": recommendations
    }


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
                
        # Map final priority from final confidence range:
        pct = final_confidence * 100
        if pct >= 90:
            final_priority = "Critical"
        elif pct >= 80:
            final_priority = "High"
        elif pct >= 70:
            final_priority = "Medium"
        else:
            final_priority = "Low"

        # Compute final priority score
        priority_scores_map = {'Low': 0.0, 'Medium': 1.0, 'High': 2.0, 'Critical': 3.0}
        final_priority_score = priority_scores_map.get(final_priority, 1.0)

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
        
        # Generate detailed bug analysis fields using keyword rules
        import json
        details = generate_bug_details(
            title=bug_report.title,
            description=bug_report.description,
            severity=bug_report.severity,
            component=bug_report.component
        )
        
        # Override with final priority and confidence bounds
        details["priority"] = final_priority
        details["confidence"] = final_confidence
        
        # Convert recommendations and prevention lists to JSON string
        recs_json = json.dumps(details["recommendation"])
        prevs_json = json.dumps(details["prevention"])

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
            recommendation=rec_action,
            file_id=None,
            category=details["category"],
            root_cause=details["rootCause"],
            impact=details["impact"],
            solution=details["solution"],
            recommendations_json=recs_json,
            prevention_json=prevs_json
        )
        db.add(pred_record)
        db.commit()

        # Save to MongoDB if active
        if mongo_client.is_active:
            try:
                mongo_client.predictions.insert_one({
                    "bug_id": bug_id,
                    "title": bug_report.title,
                    "severity": bug_report.severity,
                    "component": bug_report.component,
                    "predicted_priority": final_priority,
                    "confidence": final_confidence,
                    "local_model_priority": local_priority,
                    "gemini_verified_priority": gemini_priority,
                    "decision_status": decision_status,
                    "explanation": explanation_text,
                    "recommendation": rec_action,
                    "file_id": None,
                    "category": details["category"],
                    "root_cause": details["rootCause"],
                    "impact": details["impact"],
                    "solution": details["solution"],
                    "recommendations_json": recs_json,
                    "prevention_json": prevs_json,
                    "timestamp": datetime.utcnow()
                })
            except Exception as e:
                logger.error(f"Failed to log prediction to MongoDB: {e}")
        
        # Prepare response
        response = PredictionResponse(
            bug_id=bug_id,
            prediction=PriorityPrediction(
                priority=final_priority,
                priority_score=final_priority_score,
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
            timestamp=datetime.utcnow(),
            
            # Detailed analysis fields
            category=details["category"],
            rootCause=details["rootCause"],
            impact=details["impact"],
            solution=details["solution"],
            recommendation_list=details["recommendation"],
            prevention=details["prevention"]
        )
        
        latency = (_time.time() - start_time) * 1000
        logger.info(f"Bug predicted: {bug_id} in {latency:.1f}ms status: {decision_status}")
        return response

        
    except Exception as e:
        db.rollback()  # Reset session so subsequent batch items can still commit
        logger.error(f"Prediction flow failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Prediction failed: {str(e)}"
        )


@router.post("/predict/bulk", tags=["Predictions"])
async def predict_bulk(
    file: UploadFile = File(...),
    cross_check: bool = Form(True),
    current_user: dict = Depends(get_optional_user),
    db: Session = Depends(get_db)
):
    """Processes CSV, XLSX files, runs predictions, saves to DB, and returns structured JSON response."""
    file_id = uuid4().hex[:12]
    saved_path = os.path.join(UPLOAD_DIR, f"{file_id}_{file.filename}")
    
    # Save file
    try:
        with open(saved_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save uploaded file: {e}")
        
    logger.info("File uploaded")
    
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

    if mongo_client.is_active:
        try:
            mongo_client.uploaded_files.update_one(
                {"file_id": file_id},
                {"$set": {
                    "file_id": file_id,
                    "file_name": file.filename,
                    "file_type": os.path.splitext(file.filename)[1].replace(".", ""),
                    "file_size": os.path.getsize(saved_path),
                    "upload_status": "processing",
                    "uploaded_by": current_user.get("sub", "system"),
                    "prediction_count": 0,
                    "created_at": datetime.utcnow()
                }},
                upsert=True
            )
        except Exception as e:
            logger.error(f"Failed to save file upload to MongoDB: {e}")
    
    try:
        parsed_bugs = file_processor.process_file(saved_path, file.filename)
        
        predictions_to_save = []
        processed = 0
        failed = 0
        for idx, bug_data in enumerate(parsed_bugs):
            try:
                title = bug_data.get('title', f"Bug #{idx + 1}")
                if not title:
                    title = f"Bug Report #{idx + 1}"
                description = bug_data.get('description', '')
                severity = bug_data.get('severity', 'medium')
                component = bug_data.get('component', 'General')
                
                # Predict using our fast heuristic rules
                details = generate_bug_details(title, description, severity, component)
                
                # Use model to verify if loaded & requested
                local_priority = details["priority"]
                local_conf = details["confidence"]
                
                # Apply LightGBM locally if model exists
                try:
                    from backend.app.services.bug_classifier import bug_classifier
                    local_res, _ = bug_classifier.predict_priority(bug_data)
                    local_priority = local_res['priority']
                    local_conf = local_res['confidence']
                    
                    # Boost confidence percentage to float 0.0 - 100.0 scale if it is < 1.0
                    if local_conf <= 1.0:
                        local_conf = local_conf * 100
                    details["priority"] = local_priority
                    details["confidence"] = local_conf
                except Exception:
                    pass
                    
                bug_id = f"BUG-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}-{uuid4().hex[:6].upper()}-{idx}"
                
                recs_json = json.dumps(details["recommendation"])
                prevs_json = json.dumps(details["prevention"])
                
                pred_record = Prediction(
                    bug_id=bug_id,
                    title=title,
                    severity=severity,
                    component=component,
                    predicted_priority=details["priority"],
                    confidence=details["confidence"],
                    local_model_priority=local_priority,
                    gemini_verified_priority=None,
                    decision_status="Auto-Approved",
                    explanation=details["rootCause"],
                    recommendation=details["solution"],
                    file_id=file_id,
                    category=details["category"],
                    root_cause=details["rootCause"],
                    impact=details["impact"],
                    solution=details["solution"],
                    recommendations_json=recs_json,
                    prevention_json=prevs_json
                )
                predictions_to_save.append(pred_record)
                processed += 1
            except Exception as row_err:
                logger.error(f"Row {idx} prediction failed: {row_err}")
                bug_id = f"BUG-FAIL-{uuid4().hex[:6].upper()}-{idx}"
                pred_record = Prediction(
                    bug_id=bug_id,
                    title=bug_data.get('title', f"Failed Bug #{idx + 1}") if isinstance(bug_data, dict) else f"Failed Bug #{idx + 1}",
                    severity=bug_data.get('severity', 'medium') if isinstance(bug_data, dict) else 'medium',
                    component=bug_data.get('component', 'General') if isinstance(bug_data, dict) else 'General',
                    predicted_priority="Low",
                    confidence=0.0,
                    local_model_priority=None,
                    gemini_verified_priority=None,
                    decision_status="Auto-Approved",
                    explanation="Prediction unavailable",
                    recommendation="Manual review required",
                    file_id=file_id,
                    category="Error",
                    root_cause="Prediction unavailable",
                    impact="Prediction unavailable",
                    solution="Prediction unavailable",
                    recommendations_json=json.dumps(["Prediction unavailable"]),
                    prevention_json=json.dumps(["Prediction unavailable"])
                )
                predictions_to_save.append(pred_record)
                failed += 1
                
        logger.info("Rows processed")
        
        # Bulk save all predictions in a single transaction
        if predictions_to_save:
            for pred in predictions_to_save:
                db.add(pred)
            db.commit()
            for pred in predictions_to_save:
                db.refresh(pred)
                
        # Update file upload record
        uploaded_record.upload_status = "completed"
        uploaded_record.prediction_count = len(predictions_to_save)
        db.commit()
        
        logger.info("Prediction completed")
        
        # Format results to the exact expected format
        results = []
        for r in predictions_to_save:
            try:
                recs = json.loads(r.recommendations_json) if r.recommendations_json else []
            except Exception:
                recs = [r.recommendation] if r.recommendation else []
                
            try:
                prevs = json.loads(r.prevention_json) if r.prevention_json else []
            except Exception:
                prevs = []
                
            conf_val = r.confidence
            if conf_val <= 1.0:
                conf_val = conf_val * 100
                
            results.append({
                "id": r.id,
                "bug_id": r.bug_id,
                "title": r.title,
                "priority": r.predicted_priority,
                "confidence": conf_val,
                "category": r.category or "General",
                "rootCause": r.root_cause or "Prediction unavailable",
                "solution": r.solution or "Prediction unavailable",
                "recommendation": recs,
                "prevention": prevs,
                "severity": r.severity,
                "component": r.component,
                "timestamp": r.timestamp.isoformat()
            })
            
        return {
            "success": True,
            "total": len(parsed_bugs),
            "file_id": file_id,
            "results": results
        }
    except Exception as e:
        uploaded_record.upload_status = "failed"
        db.commit()
        logger.error(f"Bulk predictions failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process and predict file: {str(e)}"
        )


@router.post("/predict-file", response_model=BatchPredictionResponse, tags=["Predictions"])
async def predict_file(file: UploadFile = File(...), cross_check: bool = Form(True), current_user: dict = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Processes CSV, XLSX, JSON, LOG, TXT files, predicts priorities, saves predictions under a unique file_id, and returns progress metadata along with the predictions"""
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
        
        predictions_to_save = []
        processed = 0
        failed = 0
        for idx, bug_data in enumerate(parsed_bugs):
            try:
                title = bug_data.get('title', f"Bug #{idx + 1}")
                if not title:
                    title = f"Bug Report #{idx + 1}"
                description = bug_data.get('description', '')
                severity = bug_data.get('severity', 'medium')
                component = bug_data.get('component', 'General')
                
                # Predict using our fast heuristic rules
                details = generate_bug_details(title, description, severity, component)
                
                # Use model to verify if loaded & requested
                local_priority = details["priority"]
                local_conf = details["confidence"]
                
                # Apply LightGBM locally if model exists
                try:
                    from backend.app.services.bug_classifier import bug_classifier
                    local_res, _ = bug_classifier.predict_priority(bug_data)
                    local_priority = local_res['priority']
                    local_conf = local_res['confidence']
                    
                    # Boost confidence percentage to float 0.0 - 100.0 scale if it is < 1.0
                    if local_conf <= 1.0:
                        local_conf = local_conf * 100
                    details["priority"] = local_priority
                    details["confidence"] = local_conf
                except Exception:
                    pass
                    
                bug_id = f"BUG-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}-{uuid4().hex[:6].upper()}-{idx}"
                
                recs_json = json.dumps(details["recommendation"])
                prevs_json = json.dumps(details["prevention"])
                
                pred_record = Prediction(
                    bug_id=bug_id,
                    title=title,
                    severity=severity,
                    component=component,
                    predicted_priority=details["priority"],
                    confidence=details["confidence"],
                    local_model_priority=local_priority,
                    gemini_verified_priority=None,
                    decision_status="Auto-Approved",
                    explanation=details["rootCause"],
                    recommendation=details["solution"],
                    file_id=file_id,
                    category=details["category"],
                    root_cause=details["rootCause"],
                    impact=details["impact"],
                    solution=details["solution"],
                    recommendations_json=recs_json,
                    prevention_json=prevs_json
                )
                predictions_to_save.append(pred_record)
                processed += 1
            except Exception as row_err:
                logger.error(f"Row {idx} prediction failed: {row_err}")
                bug_id = f"BUG-FAIL-{uuid4().hex[:6].upper()}-{idx}"
                pred_record = Prediction(
                    bug_id=bug_id,
                    title=bug_data.get('title', f"Failed Bug #{idx + 1}") if isinstance(bug_data, dict) else f"Failed Bug #{idx + 1}",
                    severity=bug_data.get('severity', 'medium') if isinstance(bug_data, dict) else 'medium',
                    component=bug_data.get('component', 'General') if isinstance(bug_data, dict) else 'General',
                    predicted_priority="Low",
                    confidence=0.0,
                    local_model_priority=None,
                    gemini_verified_priority=None,
                    decision_status="Auto-Approved",
                    explanation="Prediction unavailable",
                    recommendation="Manual review required",
                    file_id=file_id,
                    category="Error",
                    root_cause="Prediction unavailable",
                    impact="Prediction unavailable",
                    solution="Prediction unavailable",
                    recommendations_json=json.dumps(["Prediction unavailable"]),
                    prevention_json=json.dumps(["Prediction unavailable"])
                )
                predictions_to_save.append(pred_record)
                failed += 1
            
        # Bulk save all predictions in a single transaction
        if predictions_to_save:
            for pred in predictions_to_save:
                db.add(pred)
            db.commit()
            
        # Update file upload record
        uploaded_record.upload_status = "completed"
        uploaded_record.prediction_count = len(predictions_to_save)
        db.commit()
        
        # Format predictions into FlatPredictionItem schema objects
        flat_preds = []
        for r in predictions_to_save:
            try:
                recs = json.loads(r.recommendations_json) if r.recommendations_json else []
            except Exception:
                recs = [r.recommendation] if r.recommendation else []
                
            try:
                prevs = json.loads(r.prevention_json) if r.prevention_json else []
            except Exception:
                prevs = []
                
            conf_val = r.confidence
            if conf_val <= 1.0:
                conf_val = conf_val * 100
                
            flat_preds.append(FlatPredictionItem(
                id=r.id,
                bug_id=r.bug_id,
                title=r.title,
                priority=r.predicted_priority,
                confidence=conf_val,
                category=r.category or "General",
                rootCause=r.root_cause or "Prediction unavailable",
                impact=r.impact or "Prediction unavailable",
                solution=r.solution or "Prediction unavailable",
                recommendation=recs,
                prevention=prevs,
                severity=r.severity,
                component=r.component,
                timestamp=r.timestamp
            ))
            
        logger.info(f"predict-file: Completed {len(predictions_to_save)} predictions under file_id: {file_id}")
        
        return BatchPredictionResponse(
            total=len(parsed_bugs),
            processed=processed,
            failed=failed,
            file_id=file_id,
            predictions=flat_preds
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
async def batch_predict(payload: BatchPredictionRequest, current_user: dict = Depends(get_optional_user), db: Session = Depends(get_db)):
    """Predicts priority levels for up to 1000 bugs in batch via JSON, saves them under a generated file_id and returns predictions list"""
    bugs = payload.bugs
    file_id = uuid4().hex[:12]
    
    predictions_to_save = []
    processed = 0
    failed = 0
    
    for idx, item in enumerate(bugs):
        try:
            details = generate_bug_details(item.title, item.description, item.severity, item.component)
            
            local_priority = details["priority"]
            local_conf = details["confidence"]
            try:
                from backend.app.services.bug_classifier import bug_classifier
                local_res, _ = bug_classifier.predict_priority(item.dict())
                local_priority = local_res['priority']
                local_conf = local_res['confidence']
                if local_conf <= 1.0:
                    local_conf = local_conf * 100
                details["priority"] = local_priority
                details["confidence"] = local_conf
            except Exception:
                pass
                
            bug_id = f"BUG-{datetime.utcnow().strftime('%Y%m%d%H%M%S%f')}-{uuid4().hex[:6].upper()}-{idx}"
            recs_json = json.dumps(details["recommendation"])
            prevs_json = json.dumps(details["prevention"])
            
            pred_record = Prediction(
                bug_id=bug_id,
                title=item.title,
                severity=item.severity,
                component=item.component,
                predicted_priority=details["priority"],
                confidence=details["confidence"],
                local_model_priority=local_priority,
                gemini_verified_priority=None,
                decision_status="Auto-Approved",
                explanation=details["rootCause"],
                recommendation=details["solution"],
                file_id=file_id,
                category=details["category"],
                root_cause=details["rootCause"],
                impact=details["impact"],
                solution=details["solution"],
                recommendations_json=recs_json,
                prevention_json=prevs_json
            )
            predictions_to_save.append(pred_record)
            processed += 1
        except Exception as e:
            logger.warning(f"Failed to process batch item '{item.title}': {e}")
            bug_id = f"BUG-FAIL-{uuid4().hex[:6].upper()}-{idx}"
            pred_record = Prediction(
                bug_id=bug_id,
                title=item.title or f"Failed Bug #{idx + 1}",
                severity=item.severity or "medium",
                component=item.component or "General",
                predicted_priority="Low",
                confidence=0.0,
                local_model_priority=None,
                gemini_verified_priority=None,
                decision_status="Auto-Approved",
                explanation="Prediction unavailable",
                recommendation="Manual review required",
                file_id=file_id,
                category="Error",
                root_cause="Prediction unavailable",
                impact="Prediction unavailable",
                solution="Prediction unavailable",
                recommendations_json=json.dumps(["Prediction unavailable"]),
                prevention_json=json.dumps(["Prediction unavailable"])
            )
            predictions_to_save.append(pred_record)
            failed += 1
            
    if predictions_to_save:
        for pred in predictions_to_save:
            db.add(pred)
        db.commit()
        
    flat_preds = []
    for r in predictions_to_save:
        try:
            recs = json.loads(r.recommendations_json) if r.recommendations_json else []
        except Exception:
            recs = [r.recommendation] if r.recommendation else []
            
        try:
            prevs = json.loads(r.prevention_json) if r.prevention_json else []
        except Exception:
            prevs = []
            
        conf_val = r.confidence
        if conf_val <= 1.0:
            conf_val = conf_val * 100
            
        flat_preds.append(FlatPredictionItem(
            id=r.id,
            bug_id=r.bug_id,
            title=r.title,
            priority=r.predicted_priority,
            confidence=conf_val,
            category=r.category or "General",
            rootCause=r.root_cause or "Prediction unavailable",
            impact=r.impact or "Prediction unavailable",
            solution=r.solution or "Prediction unavailable",
            recommendation=recs,
            prevention=prevs,
            severity=r.severity,
            component=r.component,
            timestamp=r.timestamp
        ))
        
    logger.info(f"batch-predict: Completed {processed} predictions under file_id: {file_id}")
    
    return BatchPredictionResponse(
        total=len(bugs),
        processed=processed,
        failed=failed,
        file_id=file_id,
        predictions=flat_preds
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
        
        prediction_res = await predict_single(report, True, current_user, db)
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
    if mongo_client.is_active:
        try:
            records = list(mongo_client.predictions.find().sort("timestamp", -1).limit(limit))
            history_records = []
            for r in records:
                ts = r.get("timestamp")
                ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
                history_records.append({
                    "id": str(r["_id"]),
                    "bug_id": r["bug_id"],
                    "title": r["title"],
                    "severity": r["severity"],
                    "component": r["component"],
                    "predicted_priority": r["predicted_priority"],
                    "confidence": r["confidence"],
                    "recommendation": r["recommendation"],
                    "timestamp": ts_str
                })
            return {
                "total": len(history_records),
                "history": history_records
            }
        except Exception as e:
            logger.error(f"Failed to query predictions history in MongoDB: {e}")

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
    if mongo_client.is_active:
        try:
            records = list(mongo_client.predictions.find({"decision_status": "Needs Human Review"}))
            response_list = []
            for r in records:
                response_list.append(
                    PredictionResponse(
                        bug_id=r["bug_id"],
                        prediction=PriorityPrediction(
                            priority=r["predicted_priority"],
                            priority_score=3.0 if r["predicted_priority"] == 'Critical' else 2.0 if r["predicted_priority"] == 'High' else 1.0 if r["predicted_priority"] == 'Medium' else 0.0,
                            confidence=r["confidence"],
                            probabilities={'Low': 0.0, 'Medium': 0.0, 'High': 0.0, 'Critical': 0.0}
                        ),
                        local_model_priority=r.get("local_model_priority"),
                        gemini_verified_priority=r.get("gemini_verified_priority"),
                        decision_status=r["decision_status"],
                        recommendation=r["recommendation"],
                        explanation=PredictionExplanation(
                            reasoning=r.get("explanation", ""),
                            shap_impacts=[]
                        ),
                        timestamp=r.get("timestamp", datetime.utcnow())
                    )
                )
            return response_list
        except Exception as e:
            logger.error(f"Failed to query human review predictions in MongoDB: {e}")

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
    if mongo_client.is_active:
        try:
            record = mongo_client.predictions.find_one({"bug_id": bug_id})
            if record:
                old_priority = record["predicted_priority"]
                new_priority = action.approved_priority
                decision_status = "Overridden" if old_priority != new_priority else "Approved"
                recommendation = f"{record.get('recommendation', '')} [HUMAN RESOLUTION: {action.reason}]"
                
                mongo_client.predictions.update_one(
                    {"bug_id": bug_id},
                    {"$set": {
                        "predicted_priority": new_priority,
                        "decision_status": decision_status,
                        "recommendation": recommendation
                    }}
                )
                
                mongo_client.audit_logs.insert_one({
                    "action": "BUG_REVIEW_RESOLVED",
                    "username": current_user.get("sub"),
                    "description": f"Bug {bug_id} priority changed from {old_priority} to {new_priority}. Reason: {action.reason}",
                    "timestamp": datetime.utcnow()
                })
                
                # Sync back to SQLite record if it exists there too
                sqlite_record = db.query(Prediction).filter(Prediction.bug_id == bug_id).first()
                if sqlite_record:
                    sqlite_record.predicted_priority = new_priority
                    sqlite_record.decision_status = decision_status
                    sqlite_record.recommendation = recommendation
                    db.commit()

                return {
                    "bug_id": bug_id,
                    "prediction": {
                        "priority": new_priority,
                        "priority_score": 3.0,
                        "confidence": record["confidence"],
                        "probabilities": {}
                    },
                    "local_model_priority": record.get("local_model_priority"),
                    "gemini_verified_priority": record.get("gemini_verified_priority"),
                    "decision_status": decision_status,
                    "recommendation": recommendation,
                    "explanation": {
                        "reasoning": record.get("explanation", ""),
                        "shap_impacts": []
                    },
                    "timestamp": record.get("timestamp", datetime.utcnow())
                }
        except Exception as e:
            logger.error(f"Failed to resolve review in MongoDB: {e}")

    record = db.query(Prediction).filter(Prediction.bug_id == bug_id).first()
    if not record:
        raise HTTPException(status_code=404, detail="Prediction record not found")
        
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
    
    return {
        "bug_id": record.bug_id,
        "prediction": {
            "priority": record.predicted_priority,
            "priority_score": 3.0,
            "confidence": record.confidence,
            "probabilities": {}
        },
        "local_model_priority": record.local_model_priority,
        "gemini_verified_priority": record.gemini_verified_priority,
        "decision_status": record.decision_status,
        "recommendation": record.recommendation,
        "explanation": {
            "reasoning": record.explanation,
            "shap_impacts": []
        },
        "timestamp": record.timestamp
    }


@router.get("/predictions", tags=["Predictions"])
async def get_predictions(
    file_id: Optional[str] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db)
):
    """Returns a paginated, filterable, and searchable list of bug predictions"""
    if mongo_client.is_active:
        try:
            filter_query = {}
            if file_id:
                filter_query["file_id"] = file_id
            if priority:
                filter_query["predicted_priority"] = priority
            if category:
                filter_query["category"] = category
            if search:
                filter_query["$or"] = [
                    {"title": {"$regex": search, "$options": "i"}},
                    {"explanation": {"$regex": search, "$options": "i"}},
                    {"root_cause": {"$regex": search, "$options": "i"}}
                ]
            
            all_records = list(mongo_client.predictions.find(filter_query))
            
            def get_priority_weight(priority_name):
                weights = {'Critical': 1, 'High': 2, 'Medium': 3, 'Low': 4}
                return weights.get(priority_name, 5)
            
            all_records.sort(key=lambda x: (get_priority_weight(x.get("predicted_priority")), -x.get("confidence", 0)))
            
            total = len(all_records)
            offset = (page - 1) * limit
            paginated_records = all_records[offset:offset+limit]
            
            items = []
            for r in paginated_records:
                try:
                    recs = json.loads(r["recommendations_json"]) if r.get("recommendations_json") else []
                except Exception:
                    recs = [r["recommendation"]] if r.get("recommendation") else []
                    
                try:
                    prevs = json.loads(r["prevention_json"]) if r.get("prevention_json") else []
                except Exception:
                    prevs = []
                
                ts = r.get("timestamp")
                ts_str = ts.isoformat() if isinstance(ts, datetime) else str(ts)
                
                items.append({
                    "id": str(r["_id"]),
                    "bug_id": r["bug_id"],
                    "title": r["title"],
                    "priority": r["predicted_priority"],
                    "confidence": r["confidence"],
                    "category": r.get("category", "General"),
                    "rootCause": r.get("root_cause", "Analysis pending."),
                    "impact": r.get("impact", "System stability check required."),
                    "solution": r.get("solution") or r.get("recommendation") or "Review code changes.",
                    "recommendation": recs,
                    "prevention": prevs,
                    "severity": r["severity"],
                    "component": r["component"],
                    "timestamp": ts_str
                })
            return {
                "total": total,
                "page": page,
                "limit": limit,
                "items": items
            }
        except Exception as e:
            logger.error(f"Failed to query predictions list in MongoDB: {e}")

    query = db.query(Prediction)
    if file_id:
        query = query.filter(Prediction.file_id == file_id)
    if priority:
        query = query.filter(Prediction.predicted_priority == priority)
    if category:
        query = query.filter(Prediction.category == category)
    if search:
        search_lower = f"%{search.lower()}%"
        query = query.filter(
            (func.lower(Prediction.title).like(search_lower)) | 
            (func.lower(Prediction.explanation).like(search_lower)) |
            (func.lower(Prediction.root_cause).like(search_lower))
        )
        
    total = query.count()
    
    # Order by priority weight and confidence
    from sqlalchemy import case, func
    priority_order = case(
        (Prediction.predicted_priority == 'Critical', 1),
        (Prediction.predicted_priority == 'High', 2),
        (Prediction.predicted_priority == 'Medium', 3),
        (Prediction.predicted_priority == 'Low', 4),
        else_=5
    )
    
    records = query.order_by(priority_order, Prediction.confidence.desc()).offset((page - 1) * limit).limit(limit).all()
    
    items = []
    for r in records:
        try:
            recs = json.loads(r.recommendations_json) if r.recommendations_json else []
        except Exception:
            recs = [r.recommendation] if r.recommendation else []
            
        try:
            prevs = json.loads(r.prevention_json) if r.prevention_json else []
        except Exception:
            prevs = []
            
        items.append({
            "id": r.id,
            "bug_id": r.bug_id,
            "title": r.title,
            "priority": r.predicted_priority,
            "confidence": r.confidence,
            "category": r.category or "General",
            "rootCause": r.root_cause or "Analysis pending.",
            "impact": r.impact or "System stability check required.",
            "solution": r.solution or r.recommendation or "Review code changes.",
            "recommendation": recs,
            "prevention": prevs,
            "severity": r.severity,
            "component": r.component,
            "timestamp": r.timestamp.isoformat()
        })
        
    return {
        "total": total,
        "page": page,
        "limit": limit,
        "items": items
    }


@router.get("/predictions/stats", tags=["Predictions"])
async def get_prediction_stats(
    file_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """Calculates bug summary counts and Recharts-ready data distributions (Priority, Category, Confidence)"""
    if mongo_client.is_active:
        try:
            filter_query = {}
            if file_id:
                filter_query["file_id"] = file_id
            all_preds = list(mongo_client.predictions.find(filter_query))
            total = len(all_preds)
            
            critical_count = sum(1 for r in all_preds if r.get("predicted_priority") == 'Critical')
            high_count = sum(1 for r in all_preds if r.get("predicted_priority") == 'High')
            medium_count = sum(1 for r in all_preds if r.get("predicted_priority") == 'Medium')
            low_count = sum(1 for r in all_preds if r.get("predicted_priority") == 'Low')
            
            categories = {}
            for r in all_preds:
                cat = r.get("category") or "General"
                categories[cat] = categories.get(cat, 0) + 1
                
            confidence_dist = {
                "60-70": 0,
                "70-80": 0,
                "80-90": 0,
                "90-100": 0
            }
            for r in all_preds:
                conf = r.get("confidence", 0)
                if conf <= 1.0:
                    conf = conf * 100
                if 60 <= conf < 70:
                    confidence_dist["60-70"] += 1
                elif 70 <= conf < 80:
                    confidence_dist["70-80"] += 1
                elif 80 <= conf < 90:
                    confidence_dist["80-90"] += 1
                elif 90 <= conf <= 100:
                    confidence_dist["90-100"] += 1
                    
            return {
                "total": total,
                "critical": critical_count,
                "high": high_count,
                "medium": medium_count,
                "low": low_count,
                "category_distribution": [{"category": k, "count": v} for k, v in categories.items()],
                "confidence_distribution": [{"range": k, "count": v} for k, v in confidence_dist.items()]
            }
        except Exception as e:
            logger.error(f"Failed to query predictions stats in MongoDB: {e}")

    query = db.query(Prediction)
    if file_id:
        query = query.filter(Prediction.file_id == file_id)
        
    all_preds = query.all()
    total = len(all_preds)
    
    critical_count = sum(1 for r in all_preds if r.predicted_priority == 'Critical')
    high_count = sum(1 for r in all_preds if r.predicted_priority == 'High')
    medium_count = sum(1 for r in all_preds if r.predicted_priority == 'Medium')
    low_count = sum(1 for r in all_preds if r.predicted_priority == 'Low')
    
    # Category distribution
    categories = {}
    for r in all_preds:
        cat = r.category or "General"
        categories[cat] = categories.get(cat, 0) + 1
        
    # Confidence distribution: group into 60-70, 70-80, 80-90, 90-100
    confidence_dist = {
        "60-70": 0,
        "70-80": 0,
        "80-90": 0,
        "90-100": 0
    }
    for r in all_preds:
        conf = r.confidence
        # Convert to percentage
        if conf <= 1.0:
            conf = conf * 100
        if 60 <= conf < 70:
            confidence_dist["60-70"] += 1
        elif 70 <= conf < 80:
            confidence_dist["70-80"] += 1
        elif 80 <= conf < 90:
            confidence_dist["80-90"] += 1
        elif 90 <= conf <= 100:
            confidence_dist["90-100"] += 1
            
    return {
        "total": total,
        "critical": critical_count,
        "high": high_count,
        "medium": medium_count,
        "low": low_count,
        "category_distribution": [{"category": k, "count": v} for k, v in categories.items()],
        "confidence_distribution": [{"range": k, "count": v} for k, v in confidence_dist.items()]
    }

