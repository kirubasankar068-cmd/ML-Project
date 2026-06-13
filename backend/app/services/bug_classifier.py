import logging
import numpy as np
import pandas as pd
from typing import Dict, Any, Tuple, List

from backend.app.services.model_loader import model_loader
from backend.app.services.feature_engineering import FeatureEngineer

logger = logging.getLogger(__name__)

class BugClassifierService:
    """Service utilizing the local trained LightGBM model to predict bug priority"""
    
    def __init__(self):
        self.priority_map = {0: 'Low', 1: 'Medium', 2: 'High', 3: 'Critical'}
        self.priority_values = {v: k for k, v in self.priority_map.items()}
        
    def predict_priority(self, bug_data: Dict[str, Any]) -> Tuple[Dict[str, Any], pd.DataFrame]:
        """
        Executes local LightGBM prediction on bug metadata
        
        Returns:
            Tuple of (prediction_result, features_df)
        """
        model = model_loader.model
        fe = model_loader.feature_engineer
        
        # Heuristic default check if model is not loaded
        if model is None:
            logger.warning("ML Model is not loaded. Utilizing heuristic prediction model.")
            return self._run_heuristic_prediction(bug_data)
            
        df = pd.DataFrame([bug_data])
        
        try:
            # Transform text & categorical variables
            if fe is not None and fe.is_fitted:
                features = fe.transform(df)
            else:
                features = self._fallback_manual_features(bug_data)
                
            # Align features with expected model structure
            if hasattr(model, 'feature_name_'):
                expected_cols = model.feature_name_
                for col in expected_cols:
                    if col not in features.columns:
                        features[col] = 0
                features = features[expected_cols]
                
            prediction = model.predict(features)[0]
            probabilities = model.predict_proba(features)[0]
            confidence = float(np.max(probabilities))
            
            # Map priority based on confidence score
            pct = confidence * 100
            if pct >= 90:
                priority = 'Critical'
                pred_score = 3.0
            elif pct >= 80:
                priority = 'High'
                pred_score = 2.0
            elif pct >= 70:
                priority = 'Medium'
                pred_score = 1.0
            else:
                priority = 'Low'
                pred_score = 0.0

            prob_dict = {
                self.priority_map[i]: float(prob)
                for i, prob in enumerate(probabilities)
            }
            
            result = {
                'priority': priority,
                'priority_score': pred_score,
                'confidence': confidence,
                'probabilities': prob_dict
            }
            return result, features
            
        except Exception as e:
            logger.error(f"Local LightGBM prediction pipeline failed: {e}. Falling back to heuristics.")
            return self._run_heuristic_prediction(bug_data)
            
    def get_shap_explanation(self, bug_data: Dict[str, Any], prediction_result: Dict[str, Any], features_df: pd.DataFrame) -> List[Dict[str, Any]]:
        """Generates SHAP explainability metrics for feature importances"""
        priority = prediction_result['priority']
        predicted_idx = self.priority_values[priority]
        model = model_loader.model
        
        if model is None:
            return self._generate_fallback_shap(features_df, predicted_idx)
            
        try:
            import shap
            # Fast TreeExplainer for boosting trees
            explainer = shap.TreeExplainer(model)
            shap_values = explainer.shap_values(features_df)
            
            if isinstance(shap_values, list):
                class_shap = shap_values[predicted_idx][0]
            elif isinstance(shap_values, np.ndarray) and len(shap_values.shape) == 3:
                class_shap = shap_values[0, :, predicted_idx]
            else:
                class_shap = shap_values[0] if len(shap_values.shape) == 2 else shap_values
                
            feature_names = features_df.columns.tolist()
            shap_impacts = []
            
            for col, val in zip(feature_names, class_shap):
                if abs(val) > 1e-4:
                    clean_name = col.replace('_scaled', '').replace('_encoded', '').replace('tfidf_', 'keyword: ')
                    clean_name = clean_name.replace('desc_', 'description_').replace('_', ' ').title()
                    shap_impacts.append({
                        'feature': clean_name,
                        'impact': float(val)
                    })
            # Sort descending and return top 10
            shap_impacts = sorted(shap_impacts, key=lambda x: abs(x['impact']), reverse=True)
            return shap_impacts[:10]
            
        except Exception as e:
            logger.warning(f"SHAP calculation failed: {e}. Generating fallback feature importances.")
            return self._generate_fallback_shap(features_df, predicted_idx)
            
    def _fallback_manual_features(self, bug_data: Dict[str, Any]) -> pd.DataFrame:
        """Manually constructs basic numerical and categorical dataframe columns"""
        features = pd.DataFrame()
        features['title_length'] = [len(bug_data.get('title', ''))]
        features['title_word_count'] = [len(bug_data.get('title', '').split())]
        features['desc_length'] = [len(bug_data.get('description', ''))]
        features['desc_word_count'] = [len(bug_data.get('description', '').split())]
        features['affected_users'] = [bug_data.get('affected_users', 1)]
        features['is_reproducible'] = [int(bug_data.get('is_reproducible', True))]
        features['report_day_of_week'] = [pd.Timestamp.now().dayofweek]
        features['report_month'] = [pd.Timestamp.now().month]
        
        severity_map = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
        features['severity_encoded'] = [severity_map.get(bug_data.get('severity', 'medium').lower(), 2)]
        return features
        
    def _run_heuristic_prediction(self, bug_data: Dict[str, Any]) -> Tuple[Dict[str, Any], pd.DataFrame]:
        """Simple rule-based fallback when model is missing"""
        severity = bug_data.get('severity', 'medium').lower()
        users = bug_data.get('affected_users', 1)
        
        if severity == 'critical' or users > 500:
            confidence = 0.93  # range 90-100 -> Critical
            priority = 'Critical'
            score = 3.0
        elif severity == 'high' or users > 100:
            confidence = 0.85  # range 80-90 -> High
            priority = 'High'
            score = 2.0
        elif severity == 'medium' or users > 10:
            confidence = 0.75  # range 70-80 -> Medium
            priority = 'Medium'
            score = 1.0
        else:
            confidence = 0.65  # range 60-70 -> Low
            priority = 'Low'
            score = 0.0
            
        probs = {'Low': 0.0, 'Medium': 0.0, 'High': 0.0, 'Critical': 0.0}
        probs[priority] = confidence
        rem = 1.0 - confidence
        others = [k for k in probs.keys() if k != priority]
        for o in others:
            probs[o] = float(f"{rem / len(others):.4f}")
            
        result = {
            'priority': priority,
            'priority_score': score,
            'confidence': confidence,
            'probabilities': probs
        }
        features_df = self._fallback_manual_features(bug_data)
        return result, features_df
        
    def _generate_fallback_shap(self, features_df: pd.DataFrame, predicted_idx: int) -> List[Dict[str, Any]]:
        """Mock SHAP values based on expected correlation coefficients"""
        fallback = []
        direction = 1.0 if predicted_idx >= 2 else -1.0
        
        for name in features_df.columns:
            clean_name = name.replace('_scaled', '').replace('_encoded', '').replace('tfidf_', 'keyword: ')
            clean_name = clean_name.replace('desc_', 'description_').replace('_', ' ').title()
            
            # Map impact size based on correlation
            weight = 0.05
            if "severity" in name.lower() or "user" in name.lower():
                weight = 0.25
            elif "reproducible" in name.lower():
                weight = 0.15
                
            fallback.append({
                'feature': clean_name,
                'impact': float(weight * direction)
            })
        fallback = sorted(fallback, key=lambda x: abs(x['impact']), reverse=True)
        return fallback[:6]

bug_classifier = BugClassifierService()
