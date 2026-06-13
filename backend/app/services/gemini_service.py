import os
import json
import logging
import re
from typing import Dict, Any

try:
    from google import genai
    from google.genai import types as genai_types
    HAS_GEMINI = True
except ImportError:
    HAS_GEMINI = False

from backend.app.config.settings import settings

logger = logging.getLogger(__name__)

class GeminiService:
    """Intelligent service wrapper utilizing Gemini API for bug analysis and cross-check validation"""
    
    def __init__(self):
        self.api_key = settings.GEMINI_API_KEY or settings.GOOGLE_API_KEY
        self.model_name = settings.GEMINI_MODEL or "gemini-1.5-flash"
        self.enabled = False
        self._client = None
        
        if HAS_GEMINI and self.api_key:
            try:
                self._client = genai.Client(api_key=self.api_key)
                self.enabled = True
                logger.info(f"Gemini API configured successfully with model {self.model_name}")
            except Exception as e:
                logger.error(f"Failed to configure Gemini API: {e}")
        else:
            if not HAS_GEMINI:
                logger.warning("google-genai is not installed in Python environment.")
            if not self.api_key:
                logger.warning("No GOOGLE_API_KEY or GEMINI_API_KEY environment variable detected.")
            logger.info("Gemini Service will operate in offline heuristic mode.")
            
    def analyze_bug(self, title: str, description: str, severity: str, component: str) -> Dict[str, Any]:
        """
        Performs priority prediction, root cause analysis, and recommendation generation
        
        Returns:
            Dict containing predicted priority, confidence, explanation, recommended actions,
            estimated fix time, and affected modules.
        """
        if not self.enabled:
            return self._run_heuristic_fallback(title, description, severity, component)
            
        prompt = f"""
        You are a Senior MLOps Engineer, Software Architect, and AI triage bot.
        Analyze this bug report and output a JSON response prioritizing it.
        
        Bug Title: {title}
        Bug Description: {description}
        Reported Severity: {severity}
        Affected Component: {component}
        
        Requirements:
        1. Classify the priority into exactly one of: "Critical", "High", "Medium", "Low".
        2. Set a confidence level between 0.0 and 1.0.
        3. Formulate a root cause analysis explanation.
        4. Recommend a remediation action.
        5. Estimate fix time (e.g. "2 hours", "1 day").
        6. List likely affected code modules.
        
        Return ONLY a valid JSON object matching this structure (no Markdown block fences, no ```json prefixes):
        {{
            "priority": "Critical" | "High" | "Medium" | "Low",
            "confidence": 0.95,
            "explanation": "Brief explanation detailing root cause",
            "recommended_action": "Fix action recommendation",
            "estimated_fix_time": "Estimated fixing timeline",
            "affected_modules": ["auth_module", "api_gateway"]
        }}
        """
        
        try:
            response = self._client.models.generate_content(model=self.model_name, contents=prompt)
            raw_text = response.text.strip()
            
            # Clean up markdown formatting if the model still generated it
            if raw_text.startswith("```"):
                # strip out prefix and suffix code blocks
                raw_text = re.sub(r"^```(?:json)?\n", "", raw_text)
                raw_text = re.sub(r"\n```$", "", raw_text)
                raw_text = raw_text.strip()
                
            data = json.loads(raw_text)
            
            # Normalize fields
            data["priority"] = data.get("priority", "Medium").strip().capitalize()
            if data["priority"] not in ["Critical", "High", "Medium", "Low"]:
                data["priority"] = "Medium"
                
            data["confidence"] = float(data.get("confidence", 0.75))
            return data
            
        except Exception as e:
            logger.error(f"Gemini API generation failed: {e}. Falling back to heuristics.")
            return self._run_heuristic_fallback(title, description, severity, component)
            
    def verify_image(self, extracted_text: str, image_metadata: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Uses OCR text to perform structured analysis on user-uploaded screenshot
        """
        return self.analyze_bug(
            title="Image OCR Analysis",
            description=extracted_text,
            severity="high" if "exception" in extracted_text.lower() or "error" in extracted_text.lower() else "medium",
            component="Frontend/UI"
        )
        
    def analyze_image(self, image_path: str) -> Dict[str, Any]:
        """Analyze the uploaded image using Gemini multimodal model and return structured response."""
        if not self.enabled:
            logger.warning("Gemini multimodal disabled; falling back to heuristic analysis.")
            return {}
        try:
            with open(image_path, "rb") as f:
                image_bytes = f.read()
            image_part = genai_types.Part.from_bytes(data=image_bytes, mime_type="image/png")
            response = self._client.models.generate_content(
                model=self.model_name,
                contents=[image_part]
            )
            raw_text = response.text.strip()
            if raw_text.startswith("```"):
                raw_text = re.sub(r"^```(?:json)?\n", "", raw_text)
                raw_text = re.sub(r"\n```$", "", raw_text)
                raw_text = raw_text.strip()
            data = json.loads(raw_text)
            return data
        except Exception as e:
            logger.error(f"Gemini image analysis failed: {e}")
            return {}
    
    def _run_heuristic_fallback(self, title: str, description: str, severity: str, component: str) -> Dict[str, Any]:
        """Offline rule-based fallback generating mock structural JSON predictions"""
        text = (title + " " + description).lower()
        severity = severity.lower()
        
        # Rule classification
        if "crash" in text or "db down" in text or "outage" in text or "leak" in text or severity == "critical":
            priority = "Critical"
            confidence = 0.92
            explanation = "Critical runtime exception, potential data loss, or server blockage detected."
            action = "URGENT: Dispatch hotfix immediately. Re-route DNS and check telemetry."
            fix_time = "2 hours"
            modules = [f"{component.lower()}_core", "database_engine"]
        elif "nullpointer" in text or "unauthorized" in text or severity == "high":
            priority = "High"
            confidence = 0.84
            explanation = "High priority vulnerability or validation boundary exception."
            action = "High Priority: Include in current active sprint. Add regression testing parameters."
            fix_time = "1 day"
            modules = [f"{component.lower()}_api"]
        elif "slow" in text or "delay" in text or severity == "medium":
            priority = "Medium"
            confidence = 0.76
            explanation = "Performance bottleneck or minor functional disruption under load."
            action = "Medium Priority: Refactor latency loops and clean memory caches during next sprint."
            fix_time = "3 days"
            modules = [f"{component.lower()}_perf"]
        else:
            priority = "Low"
            confidence = 0.68
            explanation = "Minor visual bug, typo, or aesthetic inconsistency."
            action = "Low Priority: Enqueue into standard backlog backlog for future styling cycles."
            fix_time = "1 week"
            modules = [f"{component.lower()}_ui"]
            
        return {
            "priority": priority,
            "confidence": confidence,
            "explanation": f"[OFFLINE HEURISTIC] {explanation}",
            "recommended_action": action,
            "estimated_fix_time": fix_time,
            "affected_modules": modules
        }

gemini_service = GeminiService()
