# Use a official lightweight Python image
FROM python:3.10-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000

# Set working directory inside the container
WORKDIR /workspace

# Install system dependencies (libgomp1 is required by LightGBM)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Copy backend requirements first to leverage Docker cache
COPY backend/requirements.txt /workspace/backend/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir -r backend/requirements.txt

# Copy the entire project layout (needed because backend imports ml_pipeline for retrains)
COPY . /workspace

# Expose port
EXPOSE 8000

# Set Python path to find modules properly
ENV PYTHONPATH=/workspace

# Start command
CMD ["python", "backend/app/main.py"]
