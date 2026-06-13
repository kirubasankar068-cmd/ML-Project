from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class BugInput(BaseModel):
    title: str = Field(..., min_length=10, description="Bug title (min 10 characters)")
    department: str = Field(..., description="Department responsible")
    module: str = Field(..., description="Affected module/component")
    severity: str = Field(..., description="Severity level")
    reporter_seniority: str = Field(..., description="Seniority level of reporter")
    environment: str = Field(..., description="Deployment environment")
    affected_users: int = Field(..., ge=1, description="Number of affected users")
    stack_trace_depth: int = Field(..., ge=0, description="Stack trace depth")
    error_frequency: float = Field(..., ge=0.0001, le=1.0, description="Error frequency rate")
    days_since_last_occurrence: int = Field(..., ge=0, description="Days since last occurred")
    has_crash_log: bool = Field(..., description="Whether crash log exists")
    linked_issues_count: int = Field(..., ge=0, description="Number of linked issues")
    comment_count: int = Field(..., ge=0, description="Number of comments")
    votes: int = Field(..., ge=0, description="Number of votes/stars")
    time_to_resolve_hours: int = Field(..., ge=0, description="Time to resolve in hours")

    class Config:
        json_schema_extra = {
            "example": {
                "title": "Database connection timeout in production",
                "department": "Engineering",
                "module": "database",
                "severity": "critical",
                "reporter_seniority": "senior-engineer",
                "environment": "production",
                "affected_users": 150,
                "stack_trace_depth": 12,
                "error_frequency": 0.45,
                "days_since_last_occurrence": 1,
                "has_crash_log": True,
                "linked_issues_count": 3,
                "comment_count": 5,
                "votes": 10,
                "time_to_resolve_hours": 4
            }
        }

class PredictionOutput(BaseModel):
    priority_label: str
    confidence_score: float
    top_3_features: List[str]
    model_version: str
    prediction_id: str

class StatsResponse(BaseModel):
    total_predictions: int
    critical: int
    high: int
    medium: int
    low: int
    avg_confidence: float
    service_status: str

class HistoryResponse(BaseModel):
    timestamps: List[str]
    confidences: List[float]
    labels: List[str]
