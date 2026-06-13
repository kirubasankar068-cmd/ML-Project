import logging
from typing import Dict, List, Tuple, Any
import numpy as np
import pandas as pd
import spacy
import torch
from transformers import AutoTokenizer, AutoModel
from sklearn.preprocessing import LabelEncoder
from sklearn.compose import ColumnTransformer
from sklearn.preprocessing import OneHotEncoder
from imblearn.over_sampling import SMOTE
import xgboost as xgb
import shap

# Configure Logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("MLPipeline")

class SmartBugMLPipeline:
    def __init__(self, transformer_model_name: str = "sentence-transformers/all-MiniLM-L6-v2"):
        """
        Initializes the Hybrid ML pipeline.
        Loads spaCy, Hugging Face Tokenizers, models, and sets up scaling/encoding systems.
        """
        logger.info("Initializing spaCy NLP model (en_core_web_sm)...")
        try:
            self.nlp = spacy.load("en_core_web_sm")
        except OSError:
            logger.warning("spaCy 'en_core_web_sm' model not found. Downloading...")
            spacy.cli.download("en_core_web_sm")
            self.nlp = spacy.load("en_core_web_sm")

        logger.info(f"Loading Hugging Face Transformer: {transformer_model_name}")
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.tokenizer = AutoTokenizer.from_pretrained(transformer_model_name)
        self.transformer = AutoModel.from_pretrained(transformer_model_name).to(self.device)
        
        # Priority mapping
        self.priority_levels = ["Low", "Medium", "High", "Critical"]
        self.label_encoder = LabelEncoder()
        self.label_encoder.fit(self.priority_levels)

        # Tabular preprocessing
        self.categorical_features = ["component", "user_role"]
        self.column_transformer = ColumnTransformer(
            transformers=[
                ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), self.categorical_features)
            ],
            remainder="passthrough"
        )
        
        self.model = None
        self.shap_explainer = None
        self.is_trained = False

    def clean_text(self, text: str) -> str:
        """
        Cleans and tokenizes text using spaCy. Removes stopwords and punctuation.
        """
        if not text or not isinstance(text, str):
            return ""
        doc = self.nlp(text.lower().strip())
        tokens = [token.lemma_ for token in doc if not token.is_stop and not token.is_punct]
        return " ".join(tokens)

    def get_text_embedding(self, text: str) -> np.ndarray:
        """
        Generates mean-pooled sentence embeddings using the Transformer model.
        """
        cleaned = self.clean_text(text)
        inputs = self.tokenizer(cleaned, return_tensors="pt", padding=True, truncation=True, max_length=512).to(self.device)
        
        with torch.no_grad():
            outputs = self.transformer(**inputs)
            
        # Perform Mean Pooling
        token_embeddings = outputs[0]  # First element of model outputs contains hidden states
        input_mask_expanded = inputs['attention_mask'].unsqueeze(-1).expand(token_embeddings.size()).float()
        sum_embeddings = torch.sum(token_embeddings * input_mask_expanded, 1)
        sum_mask = torch.clamp(input_mask_expanded.sum(1), min=1e-9)
        embedding = (sum_embeddings / sum_mask).cpu().numpy()[0]
        return embedding

    def build_features(self, df: pd.DataFrame, is_training: bool = False) -> Tuple[np.ndarray, List[str]]:
        """
        Combines textual embeddings and encoded categorical features.
        """
        logger.info("Extracting BERT text embeddings for Title + Description + Steps...")
        combined_text = df["title"] + " " + df["description"] + " " + df.get("steps_to_reproduce", "")
        embeddings = np.array([self.get_text_embedding(t) for t in combined_text])

        logger.info("Encoding categorical attributes...")
        categorical_data = df[self.categorical_features]
        if is_training:
            encoded_cats = self.column_transformer.fit_transform(categorical_data)
        else:
            encoded_cats = self.column_transformer.transform(categorical_data)

        # Retrieve feature names for tracking and SHAP calculations
        cat_feature_names = list(self.column_transformer.named_transformers_["cat"].get_feature_names_out(self.categorical_features))
        embedding_feature_names = [f"emb_{i}" for i in range(embeddings.shape[1])]
        all_feature_names = cat_feature_names + embedding_feature_names

        X = np.hstack((encoded_cats, embeddings))
        return X, all_feature_names

    def train(self, data_list: List[Dict[str, Any]]):
        """
        Trains the XGBoost classifier. Uses SMOTE to balance the dataset targets.
        """
        logger.info(f"Beginning pipeline training. Sample size: {len(data_list)}")
        df = pd.DataFrame(data_list)
        
        # Extract features and targets
        X, feature_names = self.build_features(df, is_training=True)
        y = self.label_encoder.transform(df["priority"])

        # Handle class imbalance using SMOTE
        logger.info("Applying SMOTE oversampling for minority classes...")
        # Reduce k_neighbors if target counts are very low (e.g. cold start)
        min_class_count = pd.Series(y).value_counts().min()
        k_neighbors = min(5, max(1, min_class_count - 1)) if min_class_count > 1 else 1
        
        try:
            smote = SMOTE(k_neighbors=k_neighbors, random_state=42)
            X_resampled, y_resampled = smote.fit_resample(X, y)
            logger.info(f"Oversampled features matrix shape from {X.shape} to {X_resampled.shape}")
        except Exception as e:
            logger.warning(f"SMOTE skipped due to insufficient class instances: {e}. Training with original features.")
            X_resampled, y_resampled = X, y

        # Train XGBoost Classifier
        logger.info("Fitting XGBoost Classifier...")
        self.model = xgb.XGBClassifier(
            objective="multi:softprob",
            num_class=len(self.priority_levels),
            eval_metric="mlogloss",
            random_state=42,
            n_estimators=100
        )
        self.model.fit(X_resampled, y_resampled)
        self.is_trained = True

        # Initialize SHAP explainer
        logger.info("Initializing Tree SHAP explainer on trained model...")
        self.shap_explainer = shap.TreeExplainer(self.model)
        self.feature_names = feature_names

    def predict(self, bug_report: Dict[str, Any]) -> Tuple[str, Dict[str, float], Dict[str, float]]:
        """
        Runs priority predictions on a single report and returns SHAP attribution scores.
        """
        if not self.is_trained:
            raise ValueError("ML Pipeline has not been trained. Fit the model before running predictions.")

        df = pd.DataFrame([bug_report])
        X, _ = self.build_features(df, is_training=False)

        # Run model inference
        probabilities = self.model.predict_proba(X)[0]
        prediction_idx = np.argmax(probabilities)
        predicted_priority = self.label_encoder.inverse_transform([prediction_idx])[0]

        prob_dict = {
            self.priority_levels[i]: float(probabilities[i]) for i in range(len(self.priority_levels))
        }

        # Calculate SHAP explainability attributions
        logger.info("Generating SHAP feature contributions...")
        shap_values = self.shap_explainer.shap_values(X)
        
        # shap_values layout for multiclass: list of arrays matching target classes
        class_shap = shap_values[prediction_idx][0] if isinstance(shap_values, list) else shap_values[0, :, prediction_idx]
        
        # Map top attribution contributors
        attributions = {}
        for feature, val in zip(self.feature_names, class_shap):
            # Focus on tabular contributors or key aggregate text vectors
            if not feature.startswith("emb_") or abs(val) > 0.05:
                attributions[feature] = float(val)

        # Sort contributions by absolute magnitude
        sorted_attributions = dict(sorted(attributions.items(), key=lambda item: abs(item[1]), reverse=True)[:5])

        return predicted_priority, prob_dict, sorted_attributions
