import os
import shutil
import tempfile
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status, Depends
from pydantic import BaseModel

from backend.app.services.ai_bug_analyzer import ai_bug_analyzer
from backend.app.database.mongodb import mongo_client
from backend.app.middleware.auth import get_optional_user
from backend.app.utils.severity_mapper import map_severity_score

logger = logging.getLogger(__name__)
router = APIRouter(tags=["AI Bug Analyzer"])

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB

class ExactSolutionSchema(BaseModel):
    steps: List[str]
    code_fix: Optional[str] = ""

class AlternativeSolutionSchema(BaseModel):
    approach: str
    pros: str
    cons: str

class SeverityInfoSchema(BaseModel):
    score: int
    level: str
    color: str
    formatted: str
    bg_class: str
    badge_style: Dict[str, str]

class RecommendedSolutionPanelSchema(BaseModel):
    problem_summary: str
    root_cause: str
    recommended_solution: str
    steps: List[str]
    code_fix: Optional[str] = ""
    verification_checklist: List[str]

class AIBugAnalyzerResponse(BaseModel):
    id: str
    bug_title: str
    category: str
    severity: str
    severity_score: int
    severity_info: SeverityInfoSchema
    priority: str
    priority_reason: str
    confidence: int
    root_cause: str
    exact_solution: ExactSolutionSchema
    alternative_solutions: List[AlternativeSolutionSchema]
    prevention_tips: List[str]
    voice_summary: str
    created_at: str
    recommended_solution_panel: Optional[RecommendedSolutionPanelSchema] = None

# In-memory history buffer fallback if database is offline
IN_MEMORY_HISTORY: List[Dict[str, Any]] = []

def _enrich_result(result: Dict[str, Any]) -> Dict[str, Any]:
    """Enriches AI analysis result with severity percentage score mapping and notesheet panel."""
    # Determine numeric severity score 0-100
    sev_str = str(result.get("severity", "Medium")).strip().capitalize()
    conf = int(result.get("confidence", 80))

    if "severity_score" in result and isinstance(result["severity_score"], (int, float)):
        score = float(result["severity_score"])
    elif sev_str == "Critical":
        score = min(100.0, max(86.0, float(conf)))
    elif sev_str == "High":
        score = 80.0
    elif sev_str == "Medium":
        score = 72.0
    elif sev_str == "Low":
        score = 64.0
    else:
        score = 45.0

    sev_info = map_severity_score(score)

    exact_sol = result.get("exact_solution", {})
    steps = exact_sol.get("steps", []) if isinstance(exact_sol, dict) else []
    code_fix = exact_sol.get("code_fix", "") if isinstance(exact_sol, dict) else ""

    panel = {
        "problem_summary": result.get("bug_title", "Detected Application Bug"),
        "root_cause": result.get("root_cause", "Runtime execution error in application component logic."),
        "recommended_solution": result.get("priority_reason", "Review method inputs, exception trace location, and boundary conditions."),
        "steps": steps if steps else ["1. Inspect exception stack trace for exact line number.", "2. Validate input parameters passed to failing function.", "3. Add exception handling boundary check."],
        "code_fix": code_fix,
        "verification_checklist": result.get("prevention_tips", ["Execute unit test suite covering modified code path.", "Verify edge cases with null/unexpected input payloads."])
    }

    result["severity_score"] = sev_info["score"]
    result["severity_info"] = sev_info
    result["recommended_solution_panel"] = panel
    return result


@router.post("/analyze", response_model=AIBugAnalyzerResponse)
async def analyze_bug_endpoint(
    text_input: Optional[str] = Form(None),
    file: Optional[UploadFile] = File(None),
    image: Optional[UploadFile] = File(None),
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """
    Analyzes uploaded text, files (.txt, .log, .json, .csv, .pdf, .docx), or photos (.png, .jpg)
    and returns a structured JSON bug analysis response with severity percentage & notesheet panel.
    """
    temp_file_path = None
    temp_image_path = None
    filename = None

    try:
        # Save temporary document file if provided with validation
        if file and file.filename:
            filename = file.filename
            ext = os.path.splitext(filename)[1].lower()
            allowed_exts = [".txt", ".log", ".json", ".csv", ".pdf", ".docx", ".xlsx", ".xls", ".png", ".jpg", ".jpeg"]
            if ext not in allowed_exts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported file format '{ext}'. Allowed: .txt, .log, .json, .csv, .pdf, .docx, .png, .jpg"
                )

            # Validate file size
            file.file.seek(0, os.SEEK_END)
            file_size = file.file.tell()
            file.file.seek(0)
            if file_size > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File '{filename}' exceeds maximum allowed size of 10 MB ({round(file_size / (1024*1024), 2)} MB)."
                )

            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
                shutil.copyfileobj(file.file, tmp)
                temp_file_path = tmp.name

        # Save temporary image file if provided with validation
        if image and image.filename:
            img_filename = image.filename
            img_ext = os.path.splitext(img_filename)[1].lower()
            if img_ext not in [".png", ".jpg", ".jpeg", ".webp"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Unsupported image format '{img_ext}'. Allowed: .png, .jpg, .jpeg, .webp"
                )

            image.file.seek(0, os.SEEK_END)
            img_size = image.file.tell()
            image.file.seek(0)
            if img_size > MAX_FILE_SIZE_BYTES:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Screenshot image '{img_filename}' exceeds maximum allowed size of 10 MB."
                )

            with tempfile.NamedTemporaryFile(delete=False, suffix=img_ext) as tmp_img:
                shutil.copyfileobj(image.file, tmp_img)
                temp_image_path = tmp_img.name

        # Execute unified AI analysis
        result = ai_bug_analyzer.analyze(
            text_input=text_input,
            file_path=temp_file_path,
            filename=filename,
            image_path=temp_image_path
        )

        result = _enrich_result(result)

        record_id = f"ANALYSIS-{uuid4().hex[:8].upper()}"
        timestamp = datetime.now(timezone.utc).isoformat()

        response_payload = {
            "id": record_id,
            "created_at": timestamp,
            **result
        }

        # Store record in MongoDB Atlas if available
        if mongo_client.is_active and mongo_client.db is not None:
            try:
                mongo_client.db["ai_analyzer_history"].insert_one(response_payload.copy())
            except Exception as e:
                logger.warning(f"Failed to persist analysis to MongoDB: {e}")

        IN_MEMORY_HISTORY.insert(0, response_payload)
        if len(IN_MEMORY_HISTORY) > 100:
            IN_MEMORY_HISTORY.pop()

        return response_payload

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI Bug Analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Analysis engine failed: {str(e)}"
        )
    finally:
        # Cleanup temporary files
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        if temp_image_path and os.path.exists(temp_image_path):
            try:
                os.remove(temp_image_path)
            except Exception:
                pass

@router.get("/analyzer-history", response_model=List[AIBugAnalyzerResponse])
async def get_analyzer_history(
    limit: int = 50,
    current_user: Optional[dict] = Depends(get_optional_user)
):
    """Retrieves history of analyzed bugs with category, severity percentage info, and timestamps."""
    if mongo_client.is_active and mongo_client.db is not None:
        try:
            records = list(
                mongo_client.db["ai_analyzer_history"]
                .find({}, {"_id": 0})
                .sort("created_at", -1)
                .limit(limit)
            )
            if records:
                return [_enrich_result(r) for r in records]
        except Exception as e:
            logger.warning(f"Error reading analyzer history from MongoDB: {e}")

    return [_enrich_result(r) for r in IN_MEMORY_HISTORY[:limit]]
