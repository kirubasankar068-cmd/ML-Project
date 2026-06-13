import os
import joblib
import logging
from typing import Dict, Any, Tuple, List

logger = logging.getLogger("api")

class ModelLoader:
    _instance = None

    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ModelLoader, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return
        
        self.model = None
        self.encoders = None
        self.scaler = None
        self.tfidf = None
        self.is_mock = True
        self._initialized = True
        
        # Paths to artifacts
        self.artifacts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "model_artifacts")
        self.model_path = os.path.join(self.artifacts_dir, "model.pkl")
        self.encoders_path = os.path.join(self.artifacts_dir, "encoders.pkl")
        self.scaler_path = os.path.join(self.artifacts_dir, "scaler.pkl")
        self.tfidf_path = os.path.join(self.artifacts_dir, "tfidf.pkl")
        
        self.load_artifacts()

    def load_artifacts(self):
        try:
            if all(os.path.exists(p) for p in [self.model_path, self.encoders_path]):
                logger.info(f"Loading model from {self.model_path}...")
                self.model = joblib.load(self.model_path)
                self.encoders = joblib.load(self.encoders_path)
                
                if os.path.exists(self.scaler_path):
                    self.scaler = joblib.load(self.scaler_path)
                if os.path.exists(self.tfidf_path):
                    self.tfidf = joblib.load(self.tfidf_path)
                
                self.is_mock = False
                logger.info("Successfully loaded ML model and encoders.")
            else:
                logger.warning("ML model artifacts not found. Starting backend in rule-based fallback mock mode.")
                self.is_mock = True
        except Exception as e:
            logger.error(f"Error loading model artifacts: {e}. Falling back to mock prediction.")
            self.is_mock = True

    def predict(self, features: Dict[str, Any]) -> Tuple[str, float, List[str]]:
        """
        Executes prediction. Returns (predicted_priority, confidence_score, top_3_features).
        If model is mock, uses heuristic rules.
        """
        if self.is_mock:
            # Rule-based priority heuristic
            severity = str(features.get("severity", "normal")).lower()
            affected = int(features.get("affected_users", 0))
            env = str(features.get("environment", "development")).lower()
            freq = float(features.get("error_frequency", 0.0))

            # Base priority determination
            score = 0.50
            if severity in ["blocker", "critical"] or env == "production" or affected > 100:
                if severity == "blocker" and env == "production":
                    priority = "Critical"
                    score = 0.92 + (freq * 0.07)
                else:
                    priority = "High"
                    score = 0.82 + (freq * 0.10)
            elif severity in ["major", "normal"] or affected > 10:
                priority = "Medium"
                score = 0.70 + (freq * 0.15)
            else:
                priority = "Low"
                score = 0.60 + (freq * 0.20)

            score = min(0.99, max(0.40, score))
            
            # Key feature drivers (mock)
            top_features = ["affected_users", "severity", "environment"]
            
            return priority, round(score, 2), top_features
            
        else:
            # Placeholder for actual model inference (to be trained in Prompt 2)
            try:
                # Actual inference logic
                # We will detail this further once the model structure is generated in Prompt 2.
                # For now, if the file exists but we need to run it:
                # We can perform full TF-IDF and Scaling, then model.predict()
                return "Medium", 0.85, ["severity", "affected_users", "has_crash_log"]
            except Exception as e:
                logger.error(f"Inference error: {e}")
                return "Medium", 0.85, ["severity", "affected_users", "has_crash_log"]

# Singleton instance
model_loader = ModelLoader()
