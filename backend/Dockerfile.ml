FROM python:3.11-slim

WORKDIR /app

# Install system dependencies required for compilation of XGBoost and SHAP
RUN apt-get update && apt-get install -y \
    build-essential \
    libpq-dev \
    curl \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy package dependencies
COPY requirements_ml.txt .

# Install dependencies including PyTorch, Hugging Face, spaCy, and imbalanced-learn
RUN pip install --no-cache-dir -r requirements_ml.txt

# Pre-download standard spaCy model and Hugging Face weights to cache inside docker image
RUN python -m spacy download en_core_web_sm
RUN python -c "from transformers import AutoTokenizer, AutoModel; AutoTokenizer.from_pretrained('sentence-transformers/all-MiniLM-L6-v2'); AutoModel.from_pretrained('sentence-transformers/all-MiniLM-L6-v2')"

# Copy application code
COPY ml_pipeline.py .
COPY main.py .

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
