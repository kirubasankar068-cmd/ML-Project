"""
SQLite Database Utility for Prediction History
"""

import os
import sqlite3
from datetime import datetime
from typing import List, Dict, Any

from backend.app.config.settings import settings
from backend.app.utils.logger import setup_logger

logger = setup_logger("db")


class HistoryDB:
    """Manages SQLite storage for predictions history"""
    
    def __init__(self):
        # Extract DB path from URL (e.g. sqlite:///backend/data/prediction_history.db)
        db_url = settings.DATABASE_URL
        if db_url.startswith("sqlite:///"):
            self.db_path = db_url.replace("sqlite:///", "")
        else:
            self.db_path = "backend/data/prediction_history.db"
            
        self._init_db()
        
    def _init_db(self):
        """Initializes database schema"""
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                CREATE TABLE IF NOT EXISTS predictions_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    bug_id TEXT NOT NULL,
                    title TEXT NOT NULL,
                    severity TEXT NOT NULL,
                    component TEXT NOT NULL,
                    predicted_priority TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    recommendation TEXT NOT NULL,
                    timestamp TEXT NOT NULL
                )
            """)
            conn.commit()
            conn.close()
            logger.info(f"Database initialized at {self.db_path}")
        except Exception as e:
            logger.error(f"Failed to initialize database: {e}")
            
    def insert_prediction(self, record: Dict[str, Any]):
        """Inserts a prediction record into history"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO predictions_history 
                (bug_id, title, severity, component, predicted_priority, confidence, recommendation, timestamp)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                record['bug_id'],
                record['title'],
                record['severity'],
                record['component'],
                record['predicted_priority'],
                record['confidence'],
                record['recommendation'],
                record.get('timestamp', datetime.utcnow().isoformat())
            ))
            conn.commit()
            conn.close()
        except Exception as e:
            logger.error(f"Failed to insert prediction history record: {e}")
            
    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Returns recent prediction records"""
        try:
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(
                "SELECT * FROM predictions_history ORDER BY id DESC LIMIT ?",
                (limit,)
            )
            rows = cursor.fetchall()
            conn.close()
            
            return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"Failed to fetch prediction history: {e}")
            return []
            
    def get_metrics_summary(self) -> Dict[str, Any]:
        """Aggregates metrics from history"""
        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()
            
            # Total counts
            cursor.execute("SELECT COUNT(*) FROM predictions_history")
            total = cursor.fetchone()[0]
            
            if total == 0:
                conn.close()
                return {
                    'total': 0,
                    'low': 0, 'medium': 0, 'high': 0, 'critical': 0,
                    'avg_confidence': 0.0
                }
                
            # Priority counts
            cursor.execute("SELECT predicted_priority, COUNT(*) FROM predictions_history GROUP BY predicted_priority")
            counts = dict(cursor.fetchall())
            
            # Avg confidence
            cursor.execute("SELECT AVG(confidence) FROM predictions_history")
            avg_conf = cursor.fetchone()[0]
            
            conn.close()
            
            return {
                'total': total,
                'low': counts.get('Low', 0),
                'medium': counts.get('Medium', 0),
                'high': counts.get('High', 0),
                'critical': counts.get('Critical', 0),
                'avg_confidence': float(avg_conf) if avg_conf else 0.0
            }
        except Exception as e:
            logger.error(f"Failed to compute historical metrics: {e}")
            return {
                'total': 0,
                'low': 0, 'medium': 0, 'high': 0, 'critical': 0,
                'avg_confidence': 0.0
            }


# Global DB instance
history_db = HistoryDB()
