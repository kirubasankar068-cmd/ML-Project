"""
Feature Engineering Pipeline
"""

import logging
import pickle
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any
from sklearn.preprocessing import StandardScaler, LabelEncoder
from sklearn.feature_extraction.text import TfidfVectorizer
from datetime import datetime

logger = logging.getLogger(__name__)


class FeatureEngineer:
    """Feature engineering pipeline for bug reports"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize feature engineer
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or {}
        self.scaler = StandardScaler()
        self.label_encoders = {}
        self.tfidf_vectorizer = TfidfVectorizer(
            max_features=100,
            stop_words='english',
            min_df=2,
            max_df=0.8
        )
        self.numeric_features = []
        self.categorical_features = []
        self.is_fitted = False
    
    def fit(self, df: pd.DataFrame) -> 'FeatureEngineer':
        """Fits the feature engineering pipeline"""
        logger.info("Fitting feature engineering pipeline...")
        
        # Identify feature types
        self.numeric_features = df.select_dtypes(include=['int64', 'float64']).columns.tolist()
        self.categorical_features = df.select_dtypes(include=['object']).columns.tolist()
        
        # Remove target, free-text, and manually handled features from label encoding
        for col_to_remove in ['priority', 'title', 'description', 'severity', 'reported_by', 'reported_date', 'environment', 'module']:
            if col_to_remove in self.categorical_features:
                self.categorical_features.remove(col_to_remove)
        
        # Remove non-feature columns from numeric scaling list
        for col_to_remove in ['id', 'priority']:
            if col_to_remove in self.numeric_features:
                self.numeric_features.remove(col_to_remove)
        
        # Fit scalers and encoders
        if self.numeric_features:
            self.scaler.fit(df[self.numeric_features])
        
        # Fit label encoders for categorical features
        for col in self.categorical_features:
            le = LabelEncoder()
            le.fit(df[col].astype(str))
            self.label_encoders[col] = le
        
        # Fit TF-IDF if description exists
        if 'description' in df.columns:
            try:
                self.tfidf_vectorizer.fit(df['description'].astype(str))
            except ValueError as e:
                if "max_df corresponds to < documents than min_df" in str(e):
                    logger.warning("Small dataset detected for TF-IDF. Falling back to min_df=1, max_df=1.0.")
                    self.tfidf_vectorizer.min_df = 1
                    self.tfidf_vectorizer.max_df = 1.0
                    self.tfidf_vectorizer.fit(df['description'].astype(str))
                else:
                    raise e
        
        self.feature_cols = self.get_feature_names()
        self.is_fitted = True
        logger.info("Feature engineering pipeline fitted successfully")
        
        return self
    
    def transform(self, df: pd.DataFrame) -> pd.DataFrame:
        """Transform raw data into features"""
        if not self.is_fitted:
            raise ValueError("Fit the pipeline first using fit()")
        
        df_copy = df.copy()
        
        # Extract basic features
        features = self._extract_basic_features(df_copy)
        
        # Extract text features
        if 'description' in df_copy.columns:
            text_features = self._extract_text_features(df_copy)
            features = pd.concat([features, text_features], axis=1)
        
        # Encode categorical variables
        for col in self.categorical_features:
            if col in df_copy.columns:
                le = self.label_encoders[col]
                # Safe mapping for unseen classes to avoid ValueError
                valid_classes = set(le.classes_)
                safe_series = df_copy[col].astype(str).map(lambda s: s if s in valid_classes else le.classes_[0])
                features[f'{col}_encoded'] = le.transform(safe_series)
        
        # Scale numeric features
        if self.numeric_features:
            scaled_values = self.scaler.transform(df_copy[self.numeric_features])
            for i, col in enumerate(self.numeric_features):
                features[f'{col}_scaled'] = scaled_values[:, i]
        
        # Align features with expected features from training
        if hasattr(self, 'feature_cols'):
            for col in self.feature_cols:
                if col not in features.columns:
                    features[col] = 0
            features = features[self.feature_cols]
        
        return features
    
    def fit_transform(self, df: pd.DataFrame) -> pd.DataFrame:
        return self.fit(df).transform(df)
    
    def _extract_basic_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract basic features from bug data"""
        features = pd.DataFrame()
        
        # Title length and word count
        if 'title' in df.columns:
            features['title_length'] = df['title'].str.len()
            features['title_word_count'] = df['title'].str.split().str.len()
        
        # Description length and word count
        if 'description' in df.columns:
            features['desc_length'] = df['description'].str.len()
            features['desc_word_count'] = df['description'].str.split().str.len()
        
        # Number of affected users
        if 'affected_users' in df.columns:
            features['affected_users'] = df['affected_users']
        
        # Reproducibility flag
        if 'is_reproducible' in df.columns:
            features['is_reproducible'] = df['is_reproducible'].astype(int)
        
        # Time-based features
        if 'reported_date' in df.columns:
            df['reported_date'] = pd.to_datetime(df['reported_date'])
            features['report_day_of_week'] = df['reported_date'].dt.dayofweek
            features['report_month'] = df['reported_date'].dt.month
        else:
            current_date = datetime.now()
            features['report_day_of_week'] = current_date.weekday()
            features['report_month'] = current_date.month
        
        # Severity mapping
        if 'severity' in df.columns:
            severity_map = {'low': 1, 'medium': 2, 'high': 3, 'critical': 4}
            features['severity_encoded'] = df['severity'].map(severity_map)
        
        return features
    
    def _extract_text_features(self, df: pd.DataFrame) -> pd.DataFrame:
        """Extract TF-IDF features from text"""
        if 'description' not in df.columns:
            return pd.DataFrame()
        
        # Get TF-IDF matrix
        tfidf_matrix = self.tfidf_vectorizer.transform(df['description'].astype(str))
        
        # Convert to dense array and create dataframe
        feature_names = self.tfidf_vectorizer.get_feature_names_out()
        tfidf_df = pd.DataFrame(
            tfidf_matrix.toarray(),
            columns=[f'tfidf_{name}' for name in feature_names]
        )
        
        # Add aggregate text statistics
        tfidf_df['tfidf_max'] = tfidf_matrix.max(axis=1).toarray().flatten()
        tfidf_df['tfidf_mean'] = tfidf_matrix.mean(axis=1).A1
        tfidf_df['tfidf_sum'] = tfidf_matrix.sum(axis=1).A1
        
        return tfidf_df
    
    def get_feature_names(self) -> list:
        """Get list of all generated feature names"""
        features = []
        
        # Basic features
        features.extend([
            'title_length', 'title_word_count',
            'desc_length', 'desc_word_count',
            'affected_users', 'is_reproducible',
            'report_day_of_week', 'report_month',
            'severity_encoded'
        ])
        
        # Scaled numeric features
        features.extend([f'{col}_scaled' for col in self.numeric_features])
        
        # Encoded categorical features
        features.extend([f'{col}_encoded' for col in self.categorical_features])
        
        # TF-IDF features
        feature_names = self.tfidf_vectorizer.get_feature_names_out()
        features.extend([f'tfidf_{name}' for name in feature_names])
        features.extend(['tfidf_max', 'tfidf_mean', 'tfidf_sum'])
        
        return features
    
    def save(self, filepath: str):
        with open(filepath, 'wb') as f:
            pickle.dump(self, f)
        logger.info(f"Feature pipeline saved to {filepath}")
    
    @staticmethod
    def load(filepath: str) -> 'FeatureEngineer':
        with open(filepath, 'rb') as f:
            pipeline = pickle.load(f)
        logger.info(f"Feature pipeline loaded from {filepath}")
        return pipeline
