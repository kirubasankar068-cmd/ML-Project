import datetime
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import relationship

from backend.app.database.database import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="developer") # admin, developer, guest
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    
    audit_logs = relationship("AuditLog", back_populates="user")


class Prediction(Base):
    __tablename__ = "predictions"
    
    id = Column(Integer, primary_key=True, index=True)
    bug_id = Column(String, unique=True, index=True, nullable=False)
    title = Column(String, nullable=False)
    severity = Column(String, nullable=False)
    component = Column(String, nullable=False)
    
    # Prediction details
    predicted_priority = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    
    # Multi-model metrics
    local_model_priority = Column(String, nullable=True)
    gemini_verified_priority = Column(String, nullable=True)
    decision_status = Column(String, default="Auto-Approved") # Auto-Approved, Needs Human Review, Overridden
    
    explanation = Column(Text, nullable=True)
    recommendation = Column(Text, nullable=True)
    
    # Detailed bulk prediction fields
    file_id = Column(String, index=True, nullable=True)
    category = Column(String, nullable=True)
    root_cause = Column(Text, nullable=True)
    impact = Column(Text, nullable=True)
    solution = Column(Text, nullable=True)
    recommendations_json = Column(Text, nullable=True)
    prevention_json = Column(Text, nullable=True)
    
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)



class UploadedFile(Base):
    __tablename__ = "uploaded_files"
    
    id = Column(Integer, primary_key=True, index=True)
    file_name = Column(String, nullable=False)
    file_type = Column(String, nullable=False) # csv, xlsx, log, png, etc.
    file_size = Column(Integer, nullable=False)
    upload_status = Column(String, default="completed") # processing, completed, failed
    prediction_count = Column(Integer, default=0)
    uploaded_by = Column(String, default="system")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class ModelMetric(Base):
    __tablename__ = "model_metrics"
    
    id = Column(Integer, primary_key=True, index=True)
    model_name = Column(String, nullable=False)
    accuracy = Column(Float, nullable=False)
    f1_score = Column(Float, nullable=False)
    precision = Column(Float, nullable=False)
    recall = Column(Float, nullable=False)
    training_date = Column(DateTime, default=datetime.datetime.utcnow)
    active = Column(Boolean, default=True)


class PredictionHistory(Base):
    __tablename__ = "prediction_history"
    
    id = Column(Integer, primary_key=True, index=True)
    bug_id = Column(String, index=True, nullable=False)
    priority = Column(String, nullable=False)
    confidence = Column(Float, nullable=False)
    details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class AuditLog(Base):
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    description = Column(Text, nullable=True)
    ip_address = Column(String, nullable=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    
    user = relationship("User", back_populates="audit_logs")
