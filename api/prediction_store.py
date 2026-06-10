import threading
from collections import deque
from typing import List, Dict, Any
from datetime import datetime

class PredictionStore:
    def __init__(self, max_size: int = 1000):
        self.max_size = max_size
        self.store = deque(maxlen=max_size)
        self.lock = threading.Lock()
        
        # Keep rolling totals for easy O(1) retrieval
        self.stats = {
            "total_predictions": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "total_confidence": 0.0
        }

    def add_prediction(self, prediction: Dict[str, Any]):
        with self.lock:
            # If deque is full, we must subtract the stats of the element being evicted
            if len(self.store) >= self.max_size:
                evicted = self.store[0]
                label = evicted.get("priority_label", "").lower()
                if label in self.stats:
                    self.stats[label] = max(0, self.stats[label] - 1)
                self.stats["total_confidence"] = max(0.0, self.stats["total_confidence"] - evicted.get("confidence_score", 0.0))
                self.stats["total_predictions"] = max(0, self.stats["total_predictions"] - 1)
            
            # Add new prediction
            self.store.append(prediction)
            
            # Update stats
            label = prediction.get("priority_label", "").lower()
            if label in self.stats:
                self.stats[label] += 1
            self.stats["total_confidence"] += prediction.get("confidence_score", 0.0)
            self.stats["total_predictions"] += 1

    def get_stats(self) -> Dict[str, Any]:
        with self.lock:
            total = self.stats["total_predictions"]
            avg_conf = (self.stats["total_confidence"] / total) if total > 0 else 0.85
            return {
                "total_predictions": total,
                "critical": self.stats["critical"],
                "high": self.stats["high"],
                "medium": self.stats["medium"],
                "low": self.stats["low"],
                "avg_confidence": round(avg_conf, 2),
                "service_status": "healthy"
            }

    def get_history(self, limit: int = 20) -> Dict[str, List[Any]]:
        with self.lock:
            # Get last N elements
            items = list(self.store)[-limit:]
            
            timestamps = []
            confidences = []
            labels = []
            
            for item in items:
                timestamps.append(item.get("timestamp", datetime.now().strftime("%I:%M:%S %p")))
                confidences.append(item.get("confidence_score", 0.0))
                labels.append(item.get("priority_label", "Medium"))
                
            return {
                "timestamps": timestamps,
                "confidences": confidences,
                "labels": labels
            }

# Singleton instance
prediction_store = PredictionStore()
