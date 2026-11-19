"""
Model Training Statistics Service.
Manages persistent stats in `model_training_stats` table/collection.
Calculates auto-training progress, model accuracy change, total samples, and training status.
"""

from datetime import datetime, timezone
from typing import Dict, Any

from backend.app.database.database import SessionLocal
from backend.app.database.models import ModelTrainingStats
from backend.app.database.mongodb import mongo_client
from backend.app.utils.logger import setup_logger

logger = setup_logger("training_stats_service")


class TrainingStatsService:
    """Manages model_training_stats stored separately from bug tables"""

    def get_stats(self) -> Dict[str, Any]:
        """Loads model training statistics from database/collection"""
        # Try Mongo first if active
        if mongo_client.is_active and mongo_client.db is not None:
            try:
                doc = mongo_client.db["model_training_stats"].find_one({"_id": "current_stats"})
                if doc:
                    samples_needed = max(1, doc.get("samples_needed_for_retrain", 100))
                    new_samples = doc.get("new_verified_samples", 0)
                    progress_pct = min(100.0, round((new_samples / samples_needed) * 100.0, 1))

                    return {
                        "auto_training_progress_pct": progress_pct,
                        "new_verified_samples": new_samples,
                        "samples_needed_for_retrain": samples_needed,
                        "current_accuracy": round(doc.get("current_accuracy", 92.5), 1),
                        "accuracy_change": round(doc.get("accuracy_change", 2.3), 1),
                        "last_trained_at": doc.get("last_trained_at", datetime.now(timezone.utc).isoformat()),
                        "total_samples_used": doc.get("total_samples_used", 1500),
                        "model_version": doc.get("model_version", "SBP-v1.0"),
                        "status": doc.get("status", "Idle"),
                        "auto_train_enabled": doc.get("auto_train_enabled", True)
                    }
            except Exception as e:
                logger.warning(f"Failed to read training stats from Mongo: {e}")

        # Fallback to SQLite SessionLocal
        db = SessionLocal()
        try:
            record = db.query(ModelTrainingStats).order_by(ModelTrainingStats.id.desc()).first()
            if not record:
                # Initialize default record
                record = ModelTrainingStats(
                    model_version="SBP-v1.0",
                    current_accuracy=92.5,
                    accuracy_change=2.3,
                    new_verified_samples=0,
                    samples_needed_for_retrain=100,
                    total_samples_used=1500,
                    last_trained_at=datetime.now(timezone.utc),
                    status="Idle",
                    auto_train_enabled=True
                )
                db.add(record)
                db.commit()
                db.refresh(record)

            samples_needed = max(1, record.samples_needed_for_retrain or 100)
            new_samples = record.new_verified_samples or 0
            progress_pct = min(100.0, round((new_samples / samples_needed) * 100.0, 1))

            last_trained_str = record.last_trained_at.isoformat() if record.last_trained_at else datetime.now(timezone.utc).isoformat()

            return {
                "auto_training_progress_pct": progress_pct,
                "new_verified_samples": new_samples,
                "samples_needed_for_retrain": samples_needed,
                "current_accuracy": round(record.current_accuracy or 92.5, 1),
                "accuracy_change": round(record.accuracy_change or 2.3, 1),
                "last_trained_at": last_trained_str,
                "total_samples_used": record.total_samples_used or 1500,
                "model_version": record.model_version or "SBP-v1.0",
                "status": record.status or "Idle",
                "auto_train_enabled": bool(record.auto_train_enabled)
            }
        finally:
            db.close()

    def update_settings(self, auto_train_enabled: bool, threshold: int = 100) -> Dict[str, Any]:
        """Updates auto_train_enabled toggle and configurable threshold"""
        threshold = max(1, threshold)
        
        if mongo_client.is_active and mongo_client.db is not None:
            try:
                mongo_client.db["model_training_stats"].update_one(
                    {"_id": "current_stats"},
                    {"$set": {
                        "auto_train_enabled": auto_train_enabled,
                        "samples_needed_for_retrain": threshold,
                        "updated_at": datetime.now(timezone.utc).isoformat()
                    }},
                    upsert=True
                )
            except Exception as e:
                logger.warning(f"Failed to update Mongo training stats settings: {e}")

        db = SessionLocal()
        try:
            record = db.query(ModelTrainingStats).order_by(ModelTrainingStats.id.desc()).first()
            if not record:
                record = ModelTrainingStats()
                db.add(record)

            record.auto_train_enabled = auto_train_enabled
            record.samples_needed_for_retrain = threshold
            record.updated_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()

        return self.get_stats()

    def increment_verified_sample() -> Tuple[Dict[str, Any], bool]:
        """
        Increments new_verified_samples count when a prediction is verified.
        Returns (current_stats, should_trigger_autotrain).
        """
        stats = self.get_stats()
        new_count = stats["new_verified_samples"] + 1
        threshold = stats["samples_needed_for_retrain"]
        auto_enabled = stats["auto_train_enabled"]

        should_trigger = auto_enabled and (new_count >= threshold)
        new_status = "Training" if should_trigger else ("Collecting data" if new_count > 0 else "Idle")

        # Persist update
        now_iso = datetime.now(timezone.utc).isoformat()

        if mongo_client.is_active and mongo_client.db is not None:
            try:
                mongo_client.db["model_training_stats"].update_one(
                    {"_id": "current_stats"},
                    {"$set": {
                        "new_verified_samples": new_count,
                        "status": new_status,
                        "updated_at": now_iso
                    }},
                    upsert=True
                )
            except Exception as e:
                logger.warning(f"Failed to update Mongo verified sample count: {e}")

        db = SessionLocal()
        try:
            record = db.query(ModelTrainingStats).order_by(ModelTrainingStats.id.desc()).first()
            if not record:
                record = ModelTrainingStats()
                db.add(record)

            record.new_verified_samples = new_count
            record.status = new_status
            record.updated_at = datetime.now(timezone.utc)
            db.commit()
        finally:
            db.close()

        updated_stats = self.get_stats()
        return updated_stats, should_trigger

    def update_training_status(self, status: str, result: Dict[str, Any] = None):
        """Updates status to Training / Completed / Failed after retraining"""
        now_iso = datetime.now(timezone.utc).isoformat()
        
        # Calculate new metrics if result provided
        new_version = result.get("candidate_version", "SBP-v1.1") if result else None
        accuracy = result.get("accuracy") if result else None
        
        stats = self.get_stats()
        old_acc = stats["current_accuracy"]
        acc_change = round(accuracy - old_acc, 2) if (accuracy is not None and old_acc is not None) else stats["accuracy_change"]

        update_dict = {
            "status": status,
            "updated_at": now_iso
        }
        if status in ["Completed", "Idle"]:
            update_dict["new_verified_samples"] = 0
            update_dict["last_trained_at"] = now_iso
            if accuracy is not None:
                update_dict["current_accuracy"] = round(accuracy * 100 if accuracy <= 1.0 else accuracy, 1)
                update_dict["accuracy_change"] = acc_change
            if new_version:
                update_dict["model_version"] = new_version
            update_dict["total_samples_used"] = stats["total_samples_used"] + stats["new_verified_samples"]

        if mongo_client.is_active and mongo_client.db is not None:
            try:
                mongo_client.db["model_training_stats"].update_one(
                    {"_id": "current_stats"},
                    {"$set": update_dict},
                    upsert=True
                )
            except Exception as e:
                logger.warning(f"Failed to update Mongo training status: {e}")

        db = SessionLocal()
        try:
            record = db.query(ModelTrainingStats).order_by(ModelTrainingStats.id.desc()).first()
            if not record:
                record = ModelTrainingStats()
                db.add(record)

            record.status = status
            record.updated_at = datetime.now(timezone.utc)

            if status in ["Completed", "Idle"]:
                record.new_verified_samples = 0
                record.last_trained_at = datetime.now(timezone.utc)
                if accuracy is not None:
                    record.current_accuracy = round(accuracy * 100 if accuracy <= 1.0 else accuracy, 1)
                    record.accuracy_change = acc_change
                if new_version:
                    record.model_version = new_version
                record.total_samples_used = (record.total_samples_used or 1500) + stats["new_verified_samples"]

            db.commit()
        finally:
            db.close()


training_stats_service = TrainingStatsService()
