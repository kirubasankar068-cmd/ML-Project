# Smart Bug Analyzer

An enterprise-grade, production-ready MLOps application for intelligent bug classification, multi-modal root cause analysis, exact step-by-step solutions, and AI voice summary narration.

---

## 🚀 What's New in Smart Bug Analyzer

1. **Multi-Modal File & Photo Input**:
   - Supports document formats: `.txt`, `.log`, `.json`, `.csv`, `.pdf` (via `pypdf`/`PyPDF2`), and `.docx` (via `python-docx`).
   - Supports images & screenshots: `.png`, `.jpg`, `.jpeg` with OCR (Tesseract / EasyOCR / OpenCV) and Vision model analysis.
2. **Comprehensive Bug Identification & Classification**:
   - Classifies Category: `Syntax`, `Runtime`, `Logic`, `Performance`, `Security`, `UI/UX`, `Database`, `Network`, `Configuration`, `Dependency`.
   - Classifies Severity: `Critical`, `High`, `Medium`, `Low`.
   - Assigns Priority: `P1`, `P2`, `P3`, `P4` with concise rationale and confidence score (0–100%).
3. **Exact & Alternative Solution Engine**:
   - **Exact Solution**: Step-by-step fix guide + copyable code/config fix blocks.
   - **Alternative Solutions**: At least 2 alternative valid technical approaches with pros & cons.
   - **Prevention Tips**: Actionable best practices to prevent defect recurrence.
4. **Accuracy & Strict Confidence Guardrails**:
   - Never guesses: If confidence is below 70% or input is unreadable/ambiguous, flags priority as `P4` / `Review Required` and specifies missing context (logs, version, stack trace).
   - Solutions are strictly based on visible evidence without inventing non-existent files or functions.
5. **Integrated Solution Dashboard Page (`/solution-dashboard`)**:
   - Drag-and-drop intake dropzone for files, photos, and text.
   - Summary cards with category, severity badges, priority score, and confidence meter.
   - Interactive alternative solutions tabs.
   - Integrated Web Speech API Voice Player with Play, Pause, Stop, speed rate (0.75x - 1.5x), and language selector.
   - History of analyzed bugs with category, severity, and date search/filters.
   - Visual analytics charts (Bugs by Category & Severity via Recharts).
   - Printable / Downloadable PDF Report exporter.
   - Responsive Light/Dark theme toggle.

---

## 🏗️ Architecture Design

```
+--------------------------------+      REST API      +---------------------------------+
|  React + Vite Frontend         | <================> |  FastAPI Backend (Port 8000)    |
|  - Solution Dashboard          |                    |  - Unified AI Bug Analyzer      |
|  - Drag-and-Drop Intake        |                    |  - Tesseract / EasyOCR Engine   |
|  - Web Speech TTS Player       |                    |  - LightGBM Local ML Model      |
|  - Recharts Visual Analytics   |                    |  - PDF / DOCX Document Extract  |
+--------------------------------+                    +----------------+----------------+
                                                                       |
                                                                       v
                                                      +----------------+----------------+
                                                      |  MongoDB Atlas / SQLite DB      |
                                                      +---------------------------------+
```

---

## 🛠️ Required Deliverables & Implementation Summary

### 1. System Prompt Used by AI Analyzer

```text
You are a Senior Full-Stack AI Software Engineer, Security Auditor, and Lead MLOps Engineer.
Analyze the provided bug report, error log, stack trace, screenshot text, or code snippet and return ONLY a valid JSON response adhering strictly to the schema below.

### ACCURACY & COMPLIANCE RULES:
1. NEVER GUESS. If the input is unreadable, ambiguous, or lacks sufficient details (stack trace, error message, code), set confidence below 70%, set priority to "P4", state that information is insufficient, and specify what missing information is required.
2. BASE SOLUTIONS ONLY ON VISIBLE INPUT. Do not invent file names, function names, database schemas, or errors that do not exist in the input.
3. VERIFY ROOT CAUSE. Ensure the exact solution code fix directly addresses the identified root cause.
4. STATE ASSUMPTIONS. Always explicitly state programming language, framework, and version assumptions in the root cause and steps.

### REQUIRED JSON SCHEMA:
{
  "bug_title": "Descriptive, concise title summarizing the bug",
  "category": "Syntax | Runtime | Logic | Performance | Security | UI/UX | Database | Network | Configuration | Dependency",
  "severity": "Critical | High | Medium | Low",
  "priority": "P1 | P2 | P3 | P4",
  "priority_reason": "Short, clear rationale explaining why this priority level was assigned",
  "confidence": 85,
  "root_cause": "In-depth technical explanation of the identified root cause and assumptions",
  "exact_solution": {
    "steps": ["Step 1...", "Step 2..."],
    "code_fix": "// Corrected code snippet or configuration change"
  },
  "alternative_solutions": [
    { "approach": "Approach 1", "pros": "Pros...", "cons": "Cons..." },
    { "approach": "Approach 2", "pros": "Pros...", "cons": "Cons..." }
  ],
  "prevention_tips": ["Tip 1...", "Tip 2..."],
  "voice_summary": "Short, plain-language spoken explanation suitable for audio playback."
}
```

---

## ⚙️ Setup & Run Instructions

### 1. Backend Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
pip install -r requirements.txt

# (Optional) Set environment variables in .env
# GOOGLE_API_KEY=your_gemini_key_here
# TESSERACT_CMD=C:\Program Files\Tesseract-OCR\tesseract.exe

# Run FastAPI Server
python app/main.py
```
The FastAPI server will run on `http://localhost:8000`. Swagger API docs are available at `http://localhost:8000/docs`.

### 2. Frontend Setup

```bash
# Navigate to frontend directory
cd frontend

# Install dependencies
npm install

# Start Vite Development Server
npm run dev
```
Access the client web app at `http://localhost:5173`. Open `/solution-dashboard` or click **Solution Dashboard** in the navigation bar.

---

## 🧪 Sample Test Inputs and Expected Outputs

### Sample Test Input #1 (Runtime NullPointer Trace)
```text
Exception in thread "main" java.lang.NullPointerException: Cannot invoke "com.example.service.User.getName()" because "user" is null
    at com.example.controller.UserController.getProfile(UserController.java:42)
    at com.example.App.main(App.java:18)
```
**Expected JSON Output**:
```json
{
  "bug_title": "Java NullPointerException in UserController.getProfile",
  "category": "Runtime",
  "severity": "High",
  "priority": "P2",
  "priority_reason": "Unhandled null reference causing controller method crash on profile lookup.",
  "confidence": 92,
  "root_cause": "The user object retrieved in UserController.java:42 is null prior to calling getName(). Assumes Java 17+ and Spring Boot framework.",
  "exact_solution": {
    "steps": [
      "Add a defensive null guard check before invoking user.getName().",
      "Return HTTP 404 Not Found if user is missing."
    ],
    "code_fix": "if (user == null) {\n  throw new ResponseStatusException(HttpStatus.NOT_FOUND, \"User not found\");\n}\nString name = user.getName();"
  },
  "alternative_solutions": [
    {
      "approach": "Use java.util.Optional wrapper",
      "pros": "Enforces null-safe handling at type level",
      "cons": "Requires updating repository method signature"
    },
    {
      "approach": "Global ControllerAdvice exception handler",
      "pros": "Centralizes error payload formatting across API endpoints",
      "cons": "Does not prevent internal null invocation"
    }
  ],
  "prevention_tips": [
    "Enable @NonNull annotations across service layer.",
    "Add unit tests covering missing database user lookups."
  ],
  "voice_summary": "Detected a High severity Runtime bug in UserController line 42 due to a null user object. Add a defensive check before calling getName."
}
```

### Sample Test Input #2 (Ambiguous / Insufficient Input)
```text
It is broken
```
**Expected JSON Output**:
```json
{
  "bug_title": "Unreadable or Empty Input",
  "category": "Configuration",
  "severity": "Low",
  "priority": "P4",
  "priority_reason": "Insufficient information provided in bug input. Additional logs/context required.",
  "confidence": 40,
  "root_cause": "Insufficient input context to analyze root cause. Missing: Raw error log file, stack trace output, code snippet, or framework version.",
  "exact_solution": {
    "steps": [
      "Provide additional details: stack trace or error log.",
      "Paste raw error log file or attach screenshot.",
      "Resubmit bug report for automated AI triage."
    ],
    "code_fix": "// Insufficient data provided.\n// Please attach complete error log or code snippet."
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
    "Configure central log aggregation.",
    "Ensure stack traces are captured in application error handlers."
  ],
  "voice_summary": "Input information is insufficient to analyze this bug. Please attach full error logs or stack traces."
}
```

---

## 📁 List of New and Modified Files

### NEW Files:
1. `backend/app/services/ai_bug_analyzer.py`: Unified AI Bug Analyzer service with LLM synthesis, confidence guardrails, and structured output JSON formatting.
2. `backend/app/api/ai_analyzer.py`: FastAPI REST router for `/api/v1/analyze` and `/api/v1/analyzer-history`.
3. `frontend/src/pages/SolutionDashboard.tsx`: Interactive Solution Dashboard page with intake dropzone, copyable code fixes, alternative solutions tabs, voice TTS player, search/filter history, charts, and PDF exporter.
4. `backend/scripts/train_extended_classifier.py`: Extended model retraining script for LightGBM classifier.
5. `backend/tests/test_ai_analyzer.py`: Automated pytest suite testing file/OCR inputs, confidence rules, and JSON schema compliance.
6. `.env.example`: Configuration template for AI Analyzer & OCR settings.

### MODIFIED Files:
1. `backend/app/main.py`: Registered `ai_analyzer_router` under `/api`.
2. `backend/app/services/file_processor.py`: Added PDF (`pypdf`) and Word DOCX (`python-docx`) text parsing support + `extract_raw_text`.
3. `backend/app/services/image_analyzer.py`: Added Tesseract OCR (`pytesseract`) + EasyOCR fallback & vision model support.
4. `backend/requirements.txt`: Added `pytesseract`, `python-docx`, `pypdf`, `gTTS`.
5. `frontend/src/lib/api.ts`: Added `analyzeBugWithAI` and `getAnalyzerHistory` API client methods.
6. `frontend/src/components/Layout.tsx`: Added **Solution Dashboard** navigation button link (`/solution-dashboard`).
7. `frontend/src/App.jsx`: Registered route `/solution-dashboard`.
