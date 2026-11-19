"""
FastAPI Main Application Entrypoint
"""

# Apply platform mock to prevent hanging WMI queries on Windows
import platform
platform.system = lambda: "Windows"
platform.uname = lambda: platform.uname_result("Windows", "localhost", "10", "10.0", "AMD64")

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from datetime import datetime

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger
from backend.app.middleware.rate_limiter import rate_limit_middleware
from backend.app.services.model_loader import model_loader
from backend.app.database.database import engine, Base
from backend.app.database.mongodb import mongo_client

# Import REST routes
from backend.app.api.prediction import router as prediction_router
from backend.app.api.analytics import router as analytics_router
from backend.app.api.monitoring import router as monitoring_router
from backend.app.services.user_service import router as users_router
from backend.app.api.retrain import router as retrain_router
from backend.app.api.prediction_history import router as history_router
from backend.app.api.ai_analyzer import router as ai_analyzer_router

logger = setup_logger("main")


# Initialize database schema tables on module load
try:
    logger.info("Binding database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database binding completed.")
except Exception as e:
    logger.error(f"Failed to bind database tables: {e}", exc_info=True)

# Initialize FastAPI application
app = FastAPI(
    title=settings.PROJECT_NAME,
    description="ML-powered API for intelligent bug priority classification and explainability.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Configuration — explicit origins required for multipart/form-data preflight requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:8000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# Apply IP Rate Limiting Middleware
@app.middleware("http")
async def apply_rate_limit(request: Request, call_next):
    return await rate_limit_middleware(request, call_next)

app.include_router(users_router, prefix="/api")
app.include_router(retrain_router, prefix="/api")
app.include_router(history_router, prefix="/api")
app.include_router(prediction_router, prefix="/api")
app.include_router(ai_analyzer_router, prefix="/api")
app.include_router(analytics_router, prefix="/api/analytics")
app.include_router(monitoring_router, prefix="/api/monitoring")


@app.on_event("startup")
async def startup_event():
    """Server startup tasks"""
    logger.info(f"Starting {settings.PROJECT_NAME} version 1.0.0...")

    # Initialize the model loader singleton to pre-load model into memory
    model_loader.load()
    if model_loader.model:
        logger.info("ML Predictor is ready for inference requests.")
    else:
        logger.warning("ML Predictor initialized without a loaded model. Calls will run in heuristic mode.")

    # Report MongoDB Atlas connection status
    if mongo_client.is_active:
        logger.info(f"MongoDB Atlas connected — database: '{settings.MONGO_DB_NAME}'")
    else:
        logger.warning("MongoDB Atlas is NOT connected. Predictions will fall back to SQLite only.")


@app.on_event("shutdown")
async def shutdown_event():
    """Server shutdown tasks"""
    logger.info(f"Shutting down {settings.PROJECT_NAME}...")


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Global catch-all exception handler"""
    logger.error(f"Unhandled error occurred: {exc}", exc_info=True)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "error": "Internal server error occurred.",
            "details": str(exc) if settings.DEBUG else "Please check server logs.",
            "timestamp": datetime.utcnow().isoformat()
        }
    )


@app.get("/", tags=["Health"])
async def root():
    """Root endpoint returning service status"""
    return {
        "service": settings.PROJECT_NAME,
        "version": "1.0.0",
        "status": "operational",
        "docs": "/docs"
    }


@app.get("/health", tags=["Health"])
async def health_root():
    """Root level health check"""
    from backend.app.services.model_loader import model_loader
    mongo_ok = mongo_client.is_active
    return {
        "status": "healthy" if model_loader.model is not None else "degraded",
        "model_loaded": model_loader.model is not None,
        "db_operational": True,
        "mongo_connected": mongo_ok,
        "mongo_database": settings.MONGO_DB_NAME if mongo_ok else None,
        "api_version": "1.0.0",
        "timestamp": datetime.utcnow().isoformat()
    }


if __name__ == "__main__":
    import uvicorn
    logger.info(f"Running FastAPI via uvicorn on {settings.HOST}:{settings.PORT}")
    uvicorn.run(
        "backend.app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
