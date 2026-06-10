@echo off
echo ============================================================
echo   Smart Bug Priority Predictor - Startup Script
echo ============================================================
echo.

set PYTHON=C:\Users\Admin\AppData\Local\Programs\Python\Python314\python.exe
set ROOT=%~dp0

echo [1/2] Starting Backend API server on http://localhost:8000
start "Bug Predictor Backend" cmd /k "%PYTHON% -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload"

timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Dev server on http://localhost:3000
start "Bug Predictor Frontend" cmd /k "cd /d %ROOT%frontend && npm run dev"

echo.
echo ============================================================
echo   Both servers starting up!
echo   Frontend: http://localhost:3000
echo   Backend API: http://localhost:8000
echo   API Docs: http://localhost:8000/docs
echo ============================================================
echo.
echo Login credentials: admin / admin123  (or developer / dev123)
pause
