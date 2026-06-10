# Smart Bug Priority Predictor

An enterprise-grade, production-ready MLOps application that automates bug report priority classification. Using a LightGBM classifier, real-time SHAP explainability, and text-based token distributions, the application predicts bug priorities, tracks metric trends, and monitors performance drift.

---

## Architecture Design

```
+------------------+      REST API      +-----------------------+
|  React + Vite    | <================> |  FastAPI Backend      |
|  Frontend Client |                    |  Singleton Inference  |
|  (Port 3000)     |                    |  (Port 8000)          |
+------------------+                    +-----------+-----------+
                                                    |
                                                    v
                                        +-----------+-----------+
                                        |  SQLite DB / History  |
                                        +-----------------------+
```

### Components Summary

1. **Frontend (`frontend/`)**: React client styled with CSS and Tailwind CSS. Implements interactive stats, prediction dashboards, CSV batch queries, and Recharts SHAP impact visualization.
2. **Backend (`backend/`)**: FastAPI server that encapsulates Pydantic validation, structured logging, JWT token security, rate-limiting middlewares, and inference endpoints.
3. **ML Training & Validation (`ml_pipeline/`)**: Pipelines using Great Expectations validation schemas, preprocessing, and LightGBM fits.
4. **DAG Scheduler (`airflow/`)**: Weekly retraining execution flow pipelines (Validation -> Fit -> Log to MLflow).
5. **Observability (`monitoring/`)**: Prometheus scrapers exposing inference latencies, class distributions, and Grafana tracking dashboards.

---

## Directory Structure

```
smart-bug-priority-predictor/
├── frontend/             # React Client Webapp
├── backend/              # FastAPI REST Server
│   ├── app/
│   │   ├── api/          # Endpoints
│   │   ├── services/     # Preprocessing, Model Load, Predictor, SHAP
│   │   ├── schemas/      # Pydantic Request/Response models
│   │   ├── middleware/   # JWT security & Rate-limiting
│   │   ├── config/       # Settings configurations
│   │   ├── utils/        # Loggers & SQLite controllers
│   │   └── main.py       # FastAPI Entrypoint
│   └── tests/            # Test suite
├── ml_pipeline/          # ML Training, Validation, and Data
│   ├── training/         # Train, Evaluate, and Validate scripts
│   └── data/             # raw/ and processed/ datasets
├── airflow/              # DAG Orchestration
├── monitoring/           # Prometheus configs & Grafana dashboards
├── .github/workflows/    # CI/CD Workflows
└── docker-compose.yml    # Docker services config
```

---

## Getting Started

### Prerequisites

Ensure you have the following installed locally:
- Python 3.10+
- Node.js 18+ & npm
- Docker & Docker Compose

### 1. Local Development Setup

#### Backend Configuration
1. Navigate to the backend directory and install dependencies:
   ```bash
   cd backend
   pip install -r requirements.txt
   ```
2. Run the FastAPI application:
   ```bash
   python app/main.py
   ```
   The API will start on `http://localhost:8000`. You can inspect the Swagger docs at `http://localhost:8000/docs`.

#### Frontend Configuration
1. Navigate to the frontend directory and install dependencies:
   ```bash
   cd ../frontend
   npm install --legacy-peer-deps
   ```
2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The client will open on `http://localhost:3000` with hot module reloading.

---

### 2. Multi-Container Orchestration (Docker Compose)

To build and spin up the complete production layout, execute the following from the root workspace:

```bash
docker-compose up --build
```

This starts the following services:
- **Client App**: `http://localhost:3000`
- **FastAPI API**: `http://localhost:8000`
- **MLflow Registry**: `http://localhost:5000`
- **Prometheus Scraper**: `http://localhost:9090`
- **Grafana Panel**: `http://localhost:3001` (Default credentials: `admin` / `admin`)

---

## Model Retraining

You can trigger model retraining in two ways:
1. **Airflow DAG**: The weekly retraining DAG runs automatically on Sundays.
2. **API Endpoint**: Trigger retraining manually by calling the protected endpoint:
   ```bash
   curl -X POST http://localhost:8000/api/retrain -H "Authorization: Bearer <your_token>"
   ```
   This dispatches a background task that processes raw files, fits a new LightGBM classifier, registers it to MLflow, and hot-swaps the active classifier in memory without requiring a server restart.
