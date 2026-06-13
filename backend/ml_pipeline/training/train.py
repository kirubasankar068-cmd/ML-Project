"""
LightGBM Model Training Module
"""

import logging
import pickle
import numpy as np
import pandas as pd
from typing import Tuple, Dict, Any
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, classification_report, roc_auc_score
)
import lightgbm as lgb

try:
    import mlflow
    import mlflow.lightgbm
except ImportError:
    import sys
    class MockMLflow:
        def __getattr__(self, name):
            def mock_func(*args, **kwargs):
                class MockRun:
                    def __enter__(self): return self
                    def __exit__(self, *args): pass
                if name == 'start_run':
                    return MockRun()
                return None
            return mock_func
    mock_mlflow = MockMLflow()
    sys.modules['mlflow'] = mock_mlflow
    sys.modules['mlflow.lightgbm'] = mock_mlflow
    import mlflow
    import mlflow.lightgbm

logger = logging.getLogger(__name__)


class ModelTrainer:
    """Trains and evaluates LightGBM models"""
    
    def __init__(self, config: Dict[str, Any] = None):
        """
        Initialize model trainer
        
        Args:
            config: Configuration dictionary
        """
        self.config = config or self._default_config()
        self.model = None
        self.metrics = {}
        self.feature_importance = None
    
    @staticmethod
    def _default_config() -> Dict[str, Any]:
        """Default LightGBM configuration"""
        return {
            'objective': 'multiclass',
            'num_class': 4,
            'max_depth': 6,
            'learning_rate': 0.1,
            'n_estimators': 100,
            'random_state': 42,
            'class_weight': 'balanced',
            'verbosity': -1
        }
    
    def train(self, X: pd.DataFrame, y: pd.Series, test_size: float = 0.2) -> Dict[str, Any]:
        """
        Train the model
        
        Args:
            X: Features
            y: Target labels
            test_size: Test set size
        
        Returns:
            Training results
        """
        logger.info("Starting LightGBM model training...")
        
        # Split data
        X_train, X_test, y_train, y_test = train_test_split(
            X, y, test_size=test_size, random_state=self.config['random_state'],
            stratify=y
        )
        
        logger.info(f"Training set: {len(X_train)}, Test set: {len(X_test)}")
        
        # MLflow tracking
        mlflow.start_run()
        
        try:
            # Log parameters
            for key, value in self.config.items():
                if key != 'random_state':
                    mlflow.log_param(key, value)
            
            # Train model
            self.model = lgb.LGBMClassifier(**self.config)
            
            self.model.fit(
                X_train, y_train,
                eval_set=[(X_test, y_test)],
                callbacks=[lgb.early_stopping(stopping_rounds=10, verbose=False)]
            )
            
            # Evaluate
            results = self._evaluate(X_test, y_test)
            
            # Log metrics
            for metric_name, metric_value in results['metrics'].items():
                mlflow.log_metric(metric_name, metric_value)
            
            # Log model
            mlflow.lightgbm.log_model(self.model, 'model')
            
            self.metrics = results['metrics']
            self.feature_importance = self._get_feature_importance(X.columns)
            
            logger.info(f"Training complete. Accuracy: {results['metrics']['accuracy']:.4f}")
            
            return {
                'success': True,
                'train_set_size': len(X_train),
                'test_set_size': len(X_test),
                'metrics': results['metrics'],
                'classification_report': results['classification_report']
            }
        
        except Exception as e:
            logger.error(f"Training failed: {str(e)}")
            mlflow.end_run()
            raise
        
        finally:
            mlflow.end_run()
    
    def hyperparameter_tuning(self, X: pd.DataFrame, y: pd.Series) -> Dict[str, Any]:
        """
        Perform hyperparameter tuning using GridSearchCV
        
        Args:
            X: Features
            y: Target labels
        
        Returns:
            Tuning results
        """
        logger.info("Starting hyperparameter tuning...")
        
        param_grid = {
            'max_depth': [4, 6, 8],
            'learning_rate': [0.01, 0.1, 0.3],
            'n_estimators': [50, 100, 200]
        }
        
        mlflow.start_run()
        
        try:
            base_model = lgb.LGBMClassifier(
                objective='multiclass',
                num_class=4,
                random_state=42,
                verbosity=-1
            )
            
            grid_search = GridSearchCV(
                base_model,
                param_grid,
                cv=5,
                scoring='accuracy',
                n_jobs=-1,
                verbose=0
            )
            
            grid_search.fit(X, y)
            
            self.model = grid_search.best_estimator_
            self.config.update(grid_search.best_params_)
            
            # Log best params
            for param, value in grid_search.best_params_.items():
                mlflow.log_param(f'tuned_{param}', value)
            mlflow.log_metric('best_cv_score', grid_search.best_score_)
            
            logger.info(f"Best parameters found: {grid_search.best_params_}")
            
            return {
                'success': True,
                'best_params': grid_search.best_params_,
                'best_score': grid_search.best_score_
            }
        
        except Exception as e:
            logger.error(f"Tuning failed: {str(e)}")
            raise
        
        finally:
            mlflow.end_run()
    
    def _evaluate(self, X_test: pd.DataFrame, y_test: pd.Series) -> Dict[str, Any]:
        """Evaluate model on test set"""
        y_pred = self.model.predict(X_test)
        y_pred_proba = self.model.predict_proba(X_test)
        
        metrics = {
            'accuracy': accuracy_score(y_test, y_pred),
            'precision': precision_score(y_test, y_pred, average='weighted', zero_division=0),
            'recall': recall_score(y_test, y_pred, average='weighted', zero_division=0),
            'f1_score': f1_score(y_test, y_pred, average='weighted', zero_division=0),
        }
        
        try:
            metrics['roc_auc'] = roc_auc_score(
                y_test, y_pred_proba, multi_class='ovr', average='weighted'
            )
        except:
            metrics['roc_auc'] = 0.0
        
        return {
            'metrics': metrics,
            'y_pred': y_pred,
            'y_pred_proba': y_pred_proba,
            'confusion_matrix': confusion_matrix(y_test, y_pred),
            'classification_report': classification_report(y_test, y_pred, output_dict=True)
        }
    
    def _get_feature_importance(self, feature_names: list) -> pd.DataFrame:
        """Get feature importance scores"""
        importances = self.model.feature_importances_
        
        importance_df = pd.DataFrame([
            {'feature': feat, 'importance': float(imp)}
            for feat, imp in zip(feature_names, importances)
        ]).sort_values('importance', ascending=False)
        
        return importance_df
    
    def save(self, filepath: str):
        if self.model is None:
            raise ValueError("No model to save. Train a model first.")
        
        with open(filepath, 'wb') as f:
            pickle.dump(self.model, f)
        
        logger.info(f"Model saved to {filepath}")
