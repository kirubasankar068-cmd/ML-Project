import os
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, Column, Integer, String, Text, DateTime, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

# Import the core hybrid ML pipeline
from ml_pipeline import SmartBugMLPipeline

# Setup Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("SmartBugAPI")

# Database Configuration
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/bugdb")
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Initialize ML Pipeline Singleton
pipeline = SmartBugMLPipeline()

# Define SQLAlchemy Model supporting Vector Embeddings
class BugReport(Base):
    __tablename__ = "bug_reports"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    steps_to_reproduce = Column(Text, nullable=True)
    component = Column(String(100), nullable=False)
    user_role = Column(String(100), nullable=False)
    predicted_priority = Column(String(50), nullable=False)
    override_applied = Column(String(100), nullable=True)
    embedding = Column(text("vector(384)"), nullable=True)  # MiniLM outputs 384 dimensions
    created_at = Column(DateTime, default=datetime.utcnow)

# Database dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic schemas for request/response validation
class BugRequest(BaseModel):
    title: str = Field(..., min_length=5, examples=["Database connection timeout during auth"])
    description: str = Field(..., min_length=10, examples=["When submitting the login button, database connection pool exhausted."])
    steps_to_reproduce: Optional[str] = Field(None, examples=["1. Go to login page\n2. Spam click login\n3. View logs"])
    component: str = Field(..., examples=["Authentication"])
    user_role: str = Field(..., examples=["Enterprise Client"])

class DuplicateBugResponse(BaseModel):
    id: int
    title: str
    similarity: float
    predicted_priority: str

class SHAPExplanation(BaseModel):
    attributions: Dict[str, float]
    reasoning: str

class PredictResponse(BaseModel):
    priority: str
    probabilities: Dict[str, float]
    override_applied: Optional[str]
    explainability: SHAPExplanation
    similar_duplicates: List[DuplicateBugResponse]

# Create database tables and install pgvector extension
def init_db():
    logger.info("Initializing database schemas...")
    try:
        with engine.connect() as conn:
            conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            conn.commit()
        Base.metadata.create_all(bind=engine)
        logger.info("Database schemas and pgvector extension created successfully.")
        
        # Cold start: seed model with dummy data if needed
        bootstrap_ml_pipeline()
    except Exception as e:
        logger.error(f"Failed to initialize database: {e}")

def bootstrap_ml_pipeline():
    """
    Seeds the ML pipeline with initial bootstrap reports so that SHAP and XGBoost can initialize.
    """
    bootstrap_data = [
        {"title": "minor text typo on checkout", "description": "checkout button says submt instead of submit", "steps_to_reproduce": "go to cart page", "component": "UI Frontend", "user_role": "Standard User", "priority": "Low"},
        {"title": "page padding offset in footer layout", "description": "footer overlaps on lower resolution viewport resolutions", "steps_to_reproduce": "resize window", "component": "UI Frontend", "user_role": "Standard User", "priority": "Low"},
        {"title": "search filter clears on page refresh", "description": "user search settings are not cached locally", "steps_to_reproduce": "refresh search results page", "component": "Search API", "user_role": "Standard User", "priority": "Medium"},
        {"title": "payment failure warning banner is missing", "description": "missing error alerts on processing invalid credentials", "steps_to_reproduce": "enter fake details", "component": "Billing Gateway", "user_role": "Support Rep", "priority": "Medium"},
        {"title": "unable to upload images to project board", "description": "file upload server blocks images larger than 1MB with generic errors", "steps_to_reproduce": "upload large attachment", "component": "File Storage", "user_role": "Standard User", "priority": "High"},
        {"title": "api gateway returning rate limiting exceptions for all auth requests", "description": "gateway token authentication limits set too low causing massive 429 exceptions", "steps_to_reproduce": "access /api", "component": "API Gateway", "user_role": "Enterprise Client", "priority": "High"},
        {"title": "data loss vulnerability in data export module", "description": "exporting project details deletes entries from raw database tables entirely", "steps_to_reproduce": "click export all projects button", "component": "Export Module", "user_role": "Enterprise Client", "priority": "Critical"},
        {"title": "auth server crash on token refresh vulnerability", "description": "buffer overflow payload crashes the authentication docker instances", "steps_to_reproduce": "send large buffer refresh payload", "component": "Authentication", "user_role": "Enterprise Client", "priority": "Critical"},
    ]
    logger.info("Bootstrapping/Training Classifier Pipeline on initial profiles...")
    pipeline.train(bootstrap_data)
    logger.info("ML Pipeline bootstrap training completed.")

# Initialize FastAPI App
app = FastAPI(
    title="Smart Bug Priority Predictor API",
    description="Enterprise-grade AI engine for bug report priority classification, semantic deduplication, and SHAP explainability.",
    version="1.0.0"
)

@app.on_event("startup")
async def startup_event():
    init_db()

@app.post("/predict-priority", response_model=PredictResponse, tags=["Inference"])
async def predict_priority(bug: BugRequest, db: Session = Depends(get_db)):
    """
    Validates the incoming bug payload, runs override rules, processes ML priority, 
    computes SHAP explainability attributions, and checks for historical vector duplicates.
    """
    try:
        # 1. Generate text embedding for incoming bug
        full_text = f"{bug.title} {bug.description} {bug.steps_to_reproduce or ''}"
        embedding_array = pipeline.get_text_embedding(full_text)
        embedding_list = embedding_array.tolist()

        # 2. Strict Business Logic Override Engine
        override_applied = None
        forced_priority = None
        
        # Rule: If Enterprise Client AND matching critical security/data-loss keywords
        is_enterprise = bug.user_role.lower() == "enterprise client"
        keywords = ["data loss", "security breach", "corruption", "vulnerability", "leak"]
        has_critical_keywords = any(kw in full_text.lower() for kw in keywords)

        if is_enterprise and has_critical_keywords:
            forced_priority = "Critical"
            override_applied = "Enterprise Client & Security/Data-Loss keywords matched."
            logger.info(f"Business logic override triggered: {override_applied}")

        # 3. Model Inference & SHAP Explainability (if not overridden)
        probabilities = {"Low": 0.0, "Medium": 0.0, "High": 0.0, "Critical": 1.0}
        attributions = {"Business Override Module": 1.0}
        reasoning = "Override forced Priority to Critical due to Enterprise client contract logic."
        
        if forced_priority:
            predicted_priority = forced_priority
        else:
            # Predict using the XGBoost/HuggingFace Pipeline
            bug_dict = bug.dict()
            predicted_priority, probabilities, attributions = pipeline.predict(bug_dict)
            
            # Formulate detailed explanation reasoning
            top_feature = list(attributions.keys())[0] if attributions else "NLP vectors"
            top_val = attributions[top_feature] if attributions else 0.0
            direction = "increased" if top_val >= 0 else "decreased"
            reasoning = f"The feature '{top_feature}' {direction} the relative score for class '{predicted_priority}' by {abs(top_val):.1%}."

        # 4. Semantic Similarity Deduplication (pgvector Cosine Similarity Query)
        similar_bugs = []
        try:
            # Query db matching close vector embeddings using cosine distance (<=> operator in pgvector)
            # Cosine similarity is defined as 1 - Cosine Distance
            query_text = text("""
                SELECT id, title, predicted_priority, 1 - (embedding <=> :emb_vector) AS similarity 
                FROM bug_reports 
                ORDER BY embedding <=> :emb_vector 
                LIMIT 3
            """)
            results = db.execute(query_text, {"emb_vector": str(embedding_list)}).fetchall()
            
            for row in results:
                # Filter results that have a reasonable semantic similarity (e.g. > 0.6)
                if row.similarity > 0.6:
                    similar_bugs.append(DuplicateBugResponse(
                        id=row.id,
                        title=row.title,
                        similarity=float(row.similarity),
                        predicted_priority=row.predicted_priority
                    ))
        except Exception as vec_err:
            logger.warning(f"pgvector query mapping failed: {vec_err}. Ensure pgvector is active.")

        # 5. Log and store report with embedding to database
        db_report = BugReport(
            title=bug.title,
            description=bug.description,
            steps_to_reproduce=bug.steps_to_reproduce,
            component=bug.component,
            user_role=bug.user_role,
            predicted_priority=predicted_priority,
            override_applied=override_applied,
            embedding=embedding_list
        )
        db.add(db_report)
        db.commit()

        # Assemble and return response payload
        return PredictResponse(
            priority=predicted_priority,
            probabilities=probabilities,
            override_applied=override_applied,
            explainability=SHAPExplanation(
                attributions=attributions,
                reasoning=reasoning
            ),
            similar_duplicates=similar_bugs
        )

    except Exception as e:
        logger.error(f"Prediction route processing exception: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Inference error: {str(e)}"
        )
