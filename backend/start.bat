@echo off
echo ============================================================
echo   Smart Bug Priority Predictor - Startup Script
echo ============================================================
echo.

:: Resolve project root (parent of this script's directory)
set ROOT=%~dp0..

:: Detect Python - try py launcher first, then python
where py >nul 2>&1 && set PYTHON=py || set PYTHON=python

:: Verify Python is available
%PYTHON% --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Please install Python 3.10+ and add it to PATH.
    pause
    exit /b 1
)

echo [1/2] Starting Backend API server on http://localhost:8000
echo       Running from project root: %ROOT%
start "Bug Predictor Backend" cmd /k "cd /d %ROOT% && %PYTHON% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"

ping 127.0.0.1 -n 4 >nul

echo [2/2] Starting Frontend Dev server on http://localhost:3000
start "Bug Predictor Frontend" cmd /k "cd /d %ROOT%\frontend && npm run dev"

echo.
echo ============================================================
echo   Both servers starting up!
echo   Frontend: http://localhost:3000
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ============================================================
echo.
echo Login credentials: admin / admin123  (or developer / dev123)
