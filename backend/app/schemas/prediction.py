from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any
from datetime import datetime

class BugReportRequest(BaseModel):
    """Bug report input request schema"""
    title: str = Field(..., min_length=5, max_length=500, description="Bug title")
    description: str = Field(..., min_length=10, max_length=5000, description="Bug description")
    component: str = Field(..., min_length=1, max_length=100, description="Affected component")
    severity: str = Field(..., pattern="^(low|medium|high|critical)$", description="Severity level")
    affected_users: int = Field(default=1, ge=1, le=1000000, description="Number of affected users")
    is_reproducible: bool = Field(default=True, description="Is the bug reproducible?")
    reported_by: Optional[str] = Field(default="guest", max_length=100, description="Reporter name")
    environment: Optional[str] = Field(default="Production", max_length=100, description="Reporting environment")
    module: Optional[str] = Field(default="General", max_length=100, description="Specific code module")

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Login button not responding on homepage",
                "description": "Clicking the login button does nothing, homepage hangs. No errors in network tab.",
                "component": "Authentication",
                "severity": "critical",
                "affected_users": 240,
                "is_reproducible": True,
                "reported_by": "developer@enterprise.com",
                "environment": "Production",
                "module": "Frontend-Auth"
            }
        }


class PriorityPrediction(BaseModel):
    """Local model prediction schema"""
    priority: str
    priority_score: float
    confidence: float
    probabilities: Dict[str, float]


class SHAPFeatureImpact(BaseModel):
    """Feature impact explanation"""
    feature: str
    impact: float


class PredictionExplanation(BaseModel):
    """Explainability text and SHAP details"""
    reasoning: str
    shap_impacts: List[SHAPFeatureImpact]


class PredictionResponse(BaseModel):
    """Structured response for bug prediction"""
    bug_id: str
    prediction: PriorityPrediction
    local_model_priority: Optional[str] = None
    gemini_verified_priority: Optional[str] = None
    decision_status: str # Auto-Approved, Needs Human Review
    recommendation: str
    explanation: PredictionExplanation
    estimated_fix_time: Optional[str] = "1 day"
    affected_modules: List[str] = []
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    
    # Detailed analysis fields
    category: Optional[str] = None
    rootCause: Optional[str] = None
    impact: Optional[str] = None
    solution: Optional[str] = None
    recommendation_list: List[str] = []
    prevention: List[str] = []



class FlatPredictionItem(BaseModel):
    id: Optional[int] = None
    bug_id: str
    title: str
    priority: str
    confidence: float
    category: str
    rootCause: str
    impact: str
    solution: str
    recommendation: List[str]
    prevention: List[str]
    severity: str
    component: str
    timestamp: datetime


class BatchPredictionRequest(BaseModel):
    bugs: List[BugReportRequest]


class BatchPredictionResponse(BaseModel):
    total: int
    processed: int
    failed: int
    predictions: Optional[List[FlatPredictionItem]] = None
    file_id: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)



class PredictionReviewAction(BaseModel):
    """Payload to override or approve a prediction needing human review"""
    approved_priority: str = Field(..., pattern="^(Low|Medium|High|Critical)$")
    reason: str = Field(..., min_length=5, description="Reason for overriding or approving this priority")


class ModelMetrics(BaseModel):
    accuracy: float
    f1_score: float
    precision: float
    recall: float
    support: Optional[int] = None


class ModelInfoResponse(BaseModel):
    app_name: str
    version: str
    model_type: str
    feature_names: List[str]


class HealthResponse(BaseModel):
    status: str
    database: Optional[str] = None
    model_loaded: Optional[bool] = True
    db_operational: Optional[bool] = True
    mongodb_operational: Optional[bool] = None
    api_version: Optional[str] = "1.0.0"
    timestamp: Optional[datetime] = Field(default_factory=datetime.utcnow)


class UserLoginRequest(BaseModel):
    username: str
    password: str


class UserLoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str


class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=6, max_length=100)
    role: Optional[str] = "developer"


class GoogleLoginRequest(BaseModel):
    credential: str
    client_id: Optional[str] = None


class DashboardStatsResponse(BaseModel):
    total_predictions: int
    critical_bugs: int
    high_bugs: int
    medium_bugs: int
    low_bugs: int
    avg_confidence: float
    needs_review_count: int
    accuracy_trend: List[Dict[str, Any]] = []


class PredictionHistoryRecord(BaseModel):
    id: Optional[int] = None
    bug_id: Optional[str] = None
    title: Optional[str] = None
    severity: Optional[str] = None
    component: Optional[str] = None
    predicted_priority: Optional[str] = None
    confidence: Optional[float] = None
    recommendation: Optional[str] = None
    timestamp: Optional[str] = None


class PredictionHistoryResponse(BaseModel):
    total: int
    history: List[PredictionHistoryRecord] = []
