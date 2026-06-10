"""
Model Loader Singleton Module
"""

import os
import sys
import pickle
import logging
from typing import Optional, Any

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger

logger = setup_logger("model_loader")

# Backwards compatibility: Register module redirect so pickle can load FeatureEngineer
try:
    import backend.app.services.feature_engineering as fe
    sys.modules['src.features'] = fe
    sys.modules['src'] = sys.modules['backend.app.services']
    logger.info("Registered module redirects for pickling compatibility")
except Exception as e:
    logger.warning(f"Could not register module redirects: {e}")


class ModelLoader:
    """Singleton class to load and hold model objects in memory"""
    
    _instance: Optional['ModelLoader'] = None
    
    def __new__(cls, *args, **kwargs):
        if not cls._instance:
            cls._instance = super(ModelLoader, cls).__new__(cls, *args, **kwargs)
            cls._instance._initialized = False
        return cls._instance
        
    def __init__(self):
        if self._initialized:
            return
            
        self.model: Optional[Any] = None
        self.feature_engineer: Optional[Any] = None
        self._initialized = True
        self.load()
        
    def load(self):
        """Loads LightGBM model and feature engineer from config paths"""
        # Load LightGBM model
        model_path = settings.MODEL_PATH
        if os.path.exists(model_path):
            try:
                with open(model_path, 'rb') as f:
                    self.model = pickle.load(f)
                logger.info(f"Successfully loaded LightGBM model from {model_path}")
            except Exception as e:
                logger.error(f"Failed to load LightGBM model from {model_path}: {e}")
                self.model = None
        else:
            logger.warning(f"LightGBM model not found at {model_path}")
            self.model = None
            
        # Load Feature Engineer
        fe_path = settings.FEATURE_ENGINEER_PATH
        if os.path.exists(fe_path):
            try:
                with open(fe_path, 'rb') as f:
                    self.feature_engineer = pickle.load(f)
                logger.info(f"Successfully loaded Feature Engineer from {fe_path}")
            except Exception as e:
                logger.error(f"Failed to load Feature Engineer from {fe_path}: {e}")
                self.feature_engineer = None
        else:
            logger.warning(f"Feature Engineer not found at {fe_path}. Preds will fallback to direct dict extraction.")
            self.feature_engineer = None

    def reload(self):
        """Reloads the models from disk"""
        self._initialized = False
        self.__init__()


# Global model loader instance
model_loader = ModelLoader()
