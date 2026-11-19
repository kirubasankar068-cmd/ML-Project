import os
import re
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone

from backend.app.config.settings import settings
from backend.app.services.gemini_service import gemini_service
from backend.app.services.image_analyzer import image_analyzer
from backend.app.services.file_processor import file_processor
from backend.app.services.bug_classifier import bug_classifier
from backend.app.services.solution_engine import solution_engine

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a Senior Full-Stack AI Software Engineer, Security Auditor, and Lead MLOps Engineer.
Analyze the provided bug report, error log, stack trace, screenshot text, or code snippet and return ONLY a valid JSON response adhering strictly to the schema below.

### ACCURACY & COMPLIANCE RULES:
1. NEVER GUESS. If the input is unreadable, ambiguous, or lacks sufficient details (stack trace, error message, code), set confidence below 70%, set priority to "P4", state that information is insufficient, and specify what missing information is required (e.g. error log, framework version, full code block).
2. BASE SOLUTIONS ONLY ON VISIBLE INPUT. Do not invent file names, function names, database schemas, or errors that do not exist in the input.
3. VERIFY ROOT CAUSE. Ensure the exact solution code fix directly addresses the identified root cause.
4. STATE ASSUMPTIONS. Always explicitly state programming language, framework, and version assumptions in the root cause and steps.

### SEVERITY & PRIORITY MAPPING:
- Critical / P1: Complete service outage, data corruption, critical security flaw, crash on core path.
- High / P2: Major feature disruption, high memory leak, core API error with workaround.
- Medium / P3: Partial functionality glitch, UI rendering issue, non-blocking warning.
- Low / P4: Minor cosmetic issue, typo, low impact notice, or insufficient information to classify.

### REQUIRED JSON SCHEMA (Return ONLY valid raw JSON, no markdown code block fences):
{
  "bug_title": "Descriptive, concise title summarizing the bug",
  "category": "Syntax | Runtime | Logic | Performance | Security | UI/UX | Database | Network | Configuration | Dependency",
  "severity": "Critical | High | Medium | Low",
  "priority": "P1 | P2 | P3 | P4",
  "priority_reason": "Short, clear rationale explaining why this priority level was assigned",
  "confidence": 85,
  "root_cause": "In-depth technical explanation of the identified root cause and assumptions",
  "exact_solution": {
    "steps": [
      "Step 1: Inspect affected module...",
      "Step 2: Update configuration..."
    ],
    "code_fix": "// Corrected code snippet, configuration change, or shell command"
  },
  "alternative_solutions": [
    {
      "approach": "Primary Alternative Approach",
      "pros": "Advantages of this approach",
      "cons": "Tradeoffs, risks, or overhead"
    },
    {
      "approach": "Secondary Alternative Approach",
      "pros": "Advantages of this approach",
      "cons": "Tradeoffs, risks, or overhead"
    }
  ],
  "prevention_tips": [
    "Tip 1: Implement defensive validation...",
    "Tip 2: Add automated unit tests..."
  ],
  "voice_summary": "Short, plain-language spoken explanation of the bug, severity, and step-by-step fix suitable for audio playback."
}
"""

class AIBugAnalyzerService:
    """
    Unified AI Bug Analyzer Service combining file text extraction, OCR,
    local ML classification, and Gemini LLM synthesis.
    """

    def __init__(self):
        self.system_prompt = SYSTEM_PROMPT

    def analyze(
        self,
        text_input: Optional[str] = None,
        file_path: Optional[str] = None,
        filename: Optional[str] = None,
        image_path: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Executes end-to-end bug analysis from text, files (.txt, .log, .json, .csv, .pdf, .docx),
        or images (.png, .jpg) and returns structured JSON output.
        """
        raw_text_parts = []
        detected_ocr_text = ""
        extracted_file_text = ""
        ui_errors = []
        stack_traces = []

        # 1. Handle Direct Text Input
        if text_input and text_input.strip():
            raw_text_parts.append(text_input.strip())

        # 2. Handle File Input (.txt, .log, .json, .csv, .pdf, .docx)
        if file_path and filename:
            try:
                extracted_file_text = file_processor.extract_raw_text(file_path, filename)
                if extracted_file_text.strip():
                    raw_text_parts.append(f"--- ATTACHED FILE ({filename}) CONTENT ---\n{extracted_file_text[:8000]}")
            except Exception as e:
                logger.error(f"Error extracting text from file {filename}: {e}")

        # 3. Handle Image Input (.png, .jpg) with Tesseract/EasyOCR/OpenCV
        if image_path:
            try:
                img_res = image_analyzer.analyze_image(image_path)
                detected_ocr_text = img_res.get("ocr_text", "")
                ui_errors = img_res.get("ui_errors", [])
                stack_traces = img_res.get("stack_traces", [])

                if detected_ocr_text.strip():
                    raw_text_parts.append(f"--- SCREENSHOT OCR DETECTED TEXT ---\n{detected_ocr_text[:6000]}")
                if ui_errors:
                    raw_text_parts.append(f"--- DETECTED UI ERRORS ---\n" + "\n".join(ui_errors))
            except Exception as e:
                logger.error(f"Error processing screenshot image {image_path}: {e}")

        combined_input = "\n\n".join(raw_text_parts).strip()

        # Handle empty/unreadable input guard
        if not combined_input:
            return self._build_low_confidence_response(
                bug_title="Unreadable or Empty Input",
                reason="No text could be extracted from the uploaded input. Please provide a clear error message, log file, or screenshot.",
                missing_info="Raw error log file, stack trace output, code snippet, or framework version."
            )

        # 4. Invoke LLM Synthesis if Gemini service is enabled
        if gemini_service.enabled and gemini_service._client:
            try:
                prompt = f"{self.system_prompt}\n\nINPUT BUG DATA TO ANALYZE:\n{combined_input[:10000]}"
                response = gemini_service._client.models.generate_content(
                    model=gemini_service.model_name,
                    contents=prompt
                )
                raw_response = response.text.strip()

                # Clean markdown code blocks if present
                if raw_response.startswith("```"):
                    raw_response = re.sub(r"^```(?:json)?\n", "", raw_response)
                    raw_response = re.sub(r"\n```$", "", raw_response).strip()

                parsed = json.loads(raw_response)

                # Validate and normalize structured fields
                normalized = self._normalize_json_output(parsed, combined_input)
                return normalized

            except Exception as e:
                logger.error(f"Gemini LLM analysis failed: {e}. Falling back to local ML & rule engine.")

        # 5. Offline Fallback: Combine local LightGBM Classifier + Rule-Based Solution Engine
        return self._run_offline_fallback(combined_input, filename)

    def _normalize_json_output(self, data: Dict[str, Any], raw_input: str) -> Dict[str, Any]:
        """Validates and enforces strict schema compliance and confidence thresholds."""
        categories = ["Syntax", "Runtime", "Logic", "Performance", "Security", "UI/UX", "Database", "Network", "Configuration", "Dependency"]
        category = str(data.get("category", "Runtime")).strip()
        if category not in categories:
            category = "Runtime"

        severities = ["Critical", "High", "Medium", "Low"]
        severity = str(data.get("severity", "Medium")).strip().capitalize()
        if severity not in severities:
            severity = "Medium"

        priorities = ["P1", "P2", "P3", "P4"]
        priority = str(data.get("priority", "P3")).strip().upper()
        if priority not in priorities:
            priority = "P3"

        try:
            confidence = int(float(data.get("confidence", 85)))
        except (ValueError, TypeError):
            confidence = 80
        confidence = max(0, min(100, confidence))

        # Enforce accuracy rule: if confidence < 70, flag insufficient information
        if confidence < 70 or len(raw_input) < 15:
            confidence = min(confidence, 65)
            priority = "P4"
            data["priority_reason"] = "Insufficient information provided in bug input. Additional logs/context required."

        exact_sol = data.get("exact_solution", {})
        if not isinstance(exact_sol, dict):
            exact_sol = {}
        steps = exact_sol.get("steps", [])
        if not isinstance(steps, list) or not steps:
            steps = ["Inspect the error location in your codebase.", "Verify input parameters and library versions."]
        code_fix = str(exact_sol.get("code_fix", "")).strip()

        alts = data.get("alternative_solutions", [])
        if not isinstance(alts, list) or len(alts) < 2:
            alts = [
                {
                    "approach": "Refactor logic with defensive validation guard checks",
                    "pros": "Prevents runtime failures cleanly before invoking sub-modules",
                    "cons": "Requires updating unit test assertion coverage"
                },
                {
                    "approach": "Wrap module execution in try-except block with fallback response",
                    "pros": "Ensures system graceful degradation under unexpected failures",
                    "cons": "May mask underlying root causes if logging is omitted"
                }
            ]

        tips = data.get("prevention_tips", [])
        if not isinstance(tips, list) or not tips:
            tips = [
                "Implement automated CI/CD static code analysis & linting.",
                "Maintain comprehensive unit tests covering edge cases and null inputs."
            ]

        voice = str(data.get("voice_summary", "")).strip()
        if not voice:
            voice = f"Identified a {severity} severity {category} bug prioritized as {priority}. Follow the step-by-step fix in the exact solution panel."

        return {
            "bug_title": str(data.get("bug_title", "Unclassified Bug Report")).strip()[:150],
            "category": category,
            "severity": severity,
            "priority": priority,
            "priority_reason": str(data.get("priority_reason", f"Assigned {priority} based on {severity} severity impact.")).strip(),
            "confidence": confidence,
            "root_cause": str(data.get("root_cause", "Root cause identified from provided trace and error indicators.")).strip(),
            "exact_solution": {
                "steps": steps,
                "code_fix": code_fix
            },
            "alternative_solutions": alts[:3],
            "prevention_tips": tips[:4],
            "voice_summary": voice[:400]
        }

    def _run_offline_fallback(self, combined_input: str, filename: Optional[str] = None) -> Dict[str, Any]:
        """Offline classification using LightGBM model and rule-based solution engine."""
        bug_data = {
            "title": combined_input[:100] if len(combined_input) > 0 else "Bug Report",
            "description": combined_input[:2000],
            "severity": "high" if any(w in combined_input.lower() for w in ["fatal", "critical", "outage"]) else "medium",
            "component": "System"
        }

        # Run local classifier
        pred_res, _ = bug_classifier.predict_priority(bug_data)
        raw_prio = pred_res.get("priority", "Medium")
        confidence = int(pred_res.get("confidence", 0.85) * 100)

        p_map = {"Critical": "P1", "High": "P2", "Medium": "P3", "Low": "P4"}
        priority = p_map.get(raw_prio, "P3")
        severity = raw_prio

        # Comprehensive Error Category Detection Rules
        category = "Runtime"
        lower_input = combined_input.lower()

        if any(w in lower_input for w in ["syntaxerror", "unexpected token", "invalid syntax", "parseerror", "indentationerror", "compilation error", "expected '"]):
            category = "Syntax"
        elif any(w in lower_input for w in ["modulenotfounderror", "importerror", "package not found", "npm err", "classnotfoundexception", "unresolved import", "version conflict"]):
            category = "Dependency"
        elif any(w in lower_input for w in ["environment variable", "missing key", "config file", "yaml error", "json.decoder", "settings not loaded", "env var"]):
            category = "Configuration"
        elif any(w in lower_input for w in ["unauthorized", "forbidden", "jwt", "token expired", "xss", "csrf", "sql injection", "access denied", "permission denied", "authentication failed"]):
            category = "Security"
        elif any(w in lower_input for w in ["sql", "database", "mongodb", "psycopg2", "sqlalchemy", "deadlock", "unique constraint", "foreign key", "table not found", "column not found"]):
            category = "Database"
        elif any(w in lower_input for w in ["connection refused", "econnrefused", "socket timeout", "dns resolution", "502 bad gateway", "503 service unavailable", "504 gateway timeout", "network error"]):
            category = "Network"
        elif any(w in lower_input for w in ["out of memory", "outofmemoryerror", "high cpu", "slow query", "memory leak", "heap space", "thread starvation", "latency"]):
            category = "Performance"
        elif any(w in lower_input for w in ["render error", "hydration error", "layout overflow", "z-index", "flexbox", "grid", "clipping", "white screen", "black screen", "ui defect"]):
            category = "UI/UX"
        elif any(w in lower_input for w in ["assertionerror", "infinite loop", "unexpected result", "invariant violation", "state mismatch", "incorrect logic"]):
            category = "Logic"
        elif any(w in lower_input for w in ["nullpointerexception", "attributeerror", "typeerror", "indexerror", "keyerror", "zerodivisionerror", "uncaught exception", "sigsegv"]):
            category = "Runtime"

        # Comprehensive Error Level (Severity & Priority) Mapping
        severity = raw_prio
        if any(w in lower_input for w in ["fatal", "outage", "data loss", "kernel panic", "segfault", "sigsegv", "blocker"]):
            severity = "Critical"
            priority = "P1"
        elif any(w in lower_input for w in ["uncaught exception", "nullpointerexception", "unauthorized", "connection refused", "out of memory"]):
            severity = "High" if severity not in ["Critical"] else severity
            priority = "P2" if priority not in ["P1"] else priority

        return self._normalize_json_output({
            "bug_title": f"Reported Issue: {filename or 'Input Trace'}",
            "category": category,
            "severity": severity,
            "priority": priority,
            "priority_reason": f"Heuristic prediction based on statistical feature match ({confidence}% confidence).",
            "confidence": confidence,
            "root_cause": f"Potential {category} failure detected from log indicators: {combined_input[:300]}",
            "exact_solution": {
                "steps": [
                    "Locate line of code associated with error in trace.",
                    "Verify variable nullability and method invocation bounds.",
                    "Re-test module execution locally before deployment."
                ],
                "code_fix": f"// Heuristic Fix Recommendation for {category} Bug\n" +
                            "try {\n" +
                            "  // Execute target operation\n" +
                            "} catch (err) {\n" +
                            "  logger.error('Execution failed:', err);\n" +
                            "}"
            },
            "alternative_solutions": [
                {
                    "approach": "Enforce input sanitization and schema boundary checks",
                    "pros": "Filters invalid parameters prior to core execution",
                    "cons": "Slight processing overhead on request ingestion"
                },
                {
                    "approach": "Implement retry mechanism with exponential backoff",
                    "pros": "Handles transient infrastructure network/DB hiccups seamlessly",
                    "cons": "Does not address hard logic defects"
                }
            ],
            "prevention_tips": [
                "Include automated unit and integration tests.",
                "Monitor error telemetry and alert thresholds."
            ],
            "voice_summary": f"Detected a {severity} severity {category} bug assigned priority {priority} with {confidence}% confidence."
        }, combined_input)

    def _build_low_confidence_response(self, bug_title: str, reason: str, missing_info: str) -> Dict[str, Any]:
        """Returns structured JSON response when input is insufficient or unreadable."""
        return {
            "bug_title": bug_title,
            "category": "Configuration",
            "severity": "Low",
            "priority": "P4",
            "priority_reason": reason,
            "confidence": 40,
            "root_cause": f"Insufficient input context to analyze root cause. Missing: {missing_info}",
            "exact_solution": {
                "steps": [
                    f"Provide additional details: {missing_info}",
                    "Paste raw error log file or attach clear screenshot of stack trace.",
                    "Resubmit bug report for automated AI triage."
                ],
                "code_fix": f"// Insufficient data provided.\n// Please attach complete error log or code snippet."
            },
            "alternative_solutions": [
                {
                    "approach": "Enable verbose debug logging in application environment",
                    "pros": "Captures detailed stack traces and runtime variable state",
                    "cons": "Generates larger log storage volume"
                },
                {
                    "approach": "Inspect server/browser console logs during reproduction",
                    "pros": "Directly isolates unhandled exception line numbers",
                    "cons": "Requires manual reproduction steps"
                }
            ],
            "prevention_tips": [
                "Configure central log aggregation (e.g. Sentry, Datadog).",
                "Ensure stack traces are captured in application error handlers."
            ],
            "voice_summary": "Input information is insufficient to analyze this bug. Please attach full error logs or stack traces."
        }

ai_bug_analyzer = AIBugAnalyzerService()
