"""
MongoDB Connection Client Module
"""

import pymongo
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger

logger = setup_logger("mongodb")

class MongoDBClient:
    """Manages connection, health check, and collection reference for MongoDB"""
    
    def __init__(self):
        self.client = None
        self.db = None
        self._connected = False
        
        # Initialize if URI is configured
        self.uri = settings.MONGO_URI
        self.db_name = settings.MONGO_DB_NAME
        
        if self.uri:
            self.connect()
            
    def connect(self):
        """Attempts connection to MongoDB cluster"""
        print("Connecting to MongoDB...")
        logger.info("Connecting to MongoDB...")
        
        # Parse URI host for logging safely
        uri_host = "Unknown"
        if self.uri:
            try:
                if "@" in self.uri:
                    uri_host = self.uri.split("@")[-1].split("/")[0]
                else:
                    uri_host = self.uri.split("://")[-1].split("/")[0]
            except Exception:
                pass

        print(f"Database URI Host: {uri_host}")
        print(f"Database Name: {self.db_name}")
        
        if not self.uri:
            print("Connection Status: Failed")
            print("Authentication Result: Failed (No URI provided)")
            print("MongoDB URI Invalid: No connection string found in settings.")
            logger.error("MongoDB URI Invalid: No connection string found in settings.")
            self._connected = False
            return

        try:
            # Check for obvious URI syntax/scheme errors
            if not self.uri.startswith("mongodb://") and not self.uri.startswith("mongodb+srv://"):
                raise ValueError("URI must begin with 'mongodb://' or 'mongodb+srv://'")
                
            self.client = pymongo.MongoClient(
                self.uri,
                serverSelectionTimeoutMS=5000,
                connectTimeoutMS=5000
            )
            # Ping database to force connection and authenticate
            self.client.admin.command('ping')
            self.db = self.client[self.db_name]
            self._connected = True
            
            print("MongoDB Connected Successfully")
            print("Connection Status: Connected")
            print("Authentication Result: Successful")
            logger.info("MongoDB Connected Successfully")
            
        except (ValueError, pymongo.errors.ConfigurationError) as e:
            print("Connection Status: Failed")
            print("Authentication Result: Failed")
            print(f"MongoDB URI Invalid: {e}")
            logger.error(f"MongoDB URI Invalid: {e}")
            self._connected = False
            self.db = None
            
        except pymongo.errors.OperationFailure as e:
            # OperationFailure is raised when auth fails
            print("Connection Status: Failed")
            print("Authentication Result: Failed")
            print(f"MongoDB Authentication Failed: {e}")
            logger.error(f"MongoDB Authentication Failed: {e}")
            self._connected = False
            self.db = None
            
        except (pymongo.errors.ServerSelectionTimeoutError, pymongo.errors.ConnectionFailure) as e:
            # Network error / timeout
            print("Connection Status: Failed")
            print("Authentication Result: Unknown")
            print(f"MongoDB Network Error: {e}")
            logger.error(f"MongoDB Network Error: {e}")
            self._connected = False
            self.db = None
            
        except Exception as e:
            print("Connection Status: Failed")
            print("Authentication Result: Unknown")
            print(f"MongoDB Connection Error: {e}")
            logger.error(f"Unexpected error during MongoDB connection setup: {e}")
            self._connected = False
            self.db = None

    @property
    def is_active(self) -> bool:
        """Returns True if connected and MongoDB is ready to use"""
        if not self._connected or self.db is None:
            return False
        try:
            self.client.admin.command('ping')
            return True
        except Exception:
            self._connected = False
            return False

    @property
    def predictions(self):
        return self.db["predictions"] if self.is_active else None

    @property
    def users(self):
        return self.db["users"] if self.is_active else None

    @property
    def uploaded_files(self):
        return self.db["uploaded_files"] if self.is_active else None

    @property
    def model_metrics(self):
        return self.db["model_metrics"] if self.is_active else None

    @property
    def audit_logs(self):
        return self.db["audit_logs"] if self.is_active else None

# Singleton client instance
mongo_client = MongoDBClient()
