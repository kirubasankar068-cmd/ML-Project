"""
MongoDB Initialization and Collection Setup Script for Smart Bug Priority Predictor.
This script connects to the MongoDB cluster, creates the 'bug_priority_db' database,
defines collections with appropriate unique and search indexes, and inserts seed data.
"""

import sys
import os
import pymongo
from datetime import datetime

# Connection parameters
DEFAULT_MONGO_URI = "mongodb+srv://kirubasankar068_db_user:AuTVeNeARIZtsBJa@cluster0.olxdhww.mongodb.net/"
DB_NAME = "bug_priority_db"

def load_uri():
    """Load URI from env or use default"""
    # Try loading from .env if present
    try:
        if os.path.exists(".env"):
            with open(".env", "r") as f:
                for line in f:
                    if line.strip().startswith("MONGO_URI="):
                        val = line.strip().split("=", 1)[1]
                        if val:
                            return val
    except Exception:
        pass
    return DEFAULT_MONGO_URI

def main():
    mongo_uri = load_uri()
    print("=" * 60)
    print("MongoDB Atlas Database Setup and Seeding Script")
    print("=" * 60)
    print(f"Target DB: {DB_NAME}")
    print(f"Connection URI: {mongo_uri}")
    print("Connecting to cluster...")

    try:
        # 5-second timeout for server selection
        client = pymongo.MongoClient(mongo_uri, serverSelectionTimeoutMS=5000)
        
        # Test connection (will throw ServerSelectionTimeoutError if blocked/offline)
        server_info = client.server_info()
        print("\n[+] SUCCESS: Connected to MongoDB Atlas cluster!")
        print(f"    Version: {server_info.get('version')}")
        print(f"    Databases currently present: {client.list_database_names()}")
    except pymongo.errors.ServerSelectionTimeoutError as err:
        print("\n[-] CONNECTION ERROR: Server selection timeout (5.0s).")
        print("\nPossible causes:")
        print("1. Network Access (IP Access List) block: Your current IP address is not whitelisted in MongoDB Atlas.")
        print("   -> Solution: Log in to cloud.mongodb.com -> Network Access -> Add IP Address.")
        print("2. Incorrect URI credentials or server hostname.")
        print("\nDetailed Error Info:")
        print(err)
        sys.exit(1)
    except Exception as err:
        print(f"\n[-] ERROR: Failed to connect or retrieve server details: {err}")
        sys.exit(1)

    # Reference database
    db = client[DB_NAME]
    
    print("\nInitializing collections & indexes...")

    # --- 1. USERS COLLECTION ---
    print(" -> Setting up 'users' collection...")
    users_coll = db["users"]
    users_coll.create_index("username", unique=True)
    
    # Check if admin user exists, else insert seed admin
    if not users_coll.find_one({"username": "admin"}):
        users_coll.insert_one({
            "username": "admin",
            "password_hash": "admin123",  # Plaintext placeholder matching project default
            "role": "admin",
            "created_at": datetime.utcnow()
        })
        print("    [+] Inserted default user: admin")
    if not users_coll.find_one({"username": "developer"}):
        users_coll.insert_one({
            "username": "developer",
            "password_hash": "dev123",
            "role": "developer",
            "created_at": datetime.utcnow()
        })
        print("    [+] Inserted default user: developer")

    # --- 2. PREDICTIONS COLLECTION ---
    print(" -> Setting up 'predictions' collection...")
    pred_coll = db["predictions"]
    pred_coll.create_index("bug_id", unique=True)
    pred_coll.create_index("file_id")
    pred_coll.create_index("category")
    pred_coll.create_index("timestamp")

    # Seed sample prediction if empty
    if pred_coll.count_documents({}) == 0:
        pred_coll.insert_one({
            "bug_id": "BUG-SEED-001",
            "title": "Database connection pool exhausted",
            "severity": "critical",
            "component": "Database Core",
            "predicted_priority": "Critical",
            "confidence": 95.0,
            "local_model_priority": "Critical",
            "gemini_verified_priority": "Critical",
            "decision_status": "Auto-Approved",
            "explanation": "Memory or connection leak in backend controller session allocation.",
            "recommendation": "CRITICAL: Assign to Senior On-Call Engineer immediately.",
            "file_id": None,
            "category": "Performance",
            "root_cause": "Connection pool limit exceeded or unreleased resource handles.",
            "impact": "Server crashes, system freeze, or complete application downtime under load.",
            "solution": "Increase connection pool size and recycle connections.",
            "recommendations_json": "[\"Monitor active database connections\", \"Add connection timeout limits\"]",
            "prevention_json": "[\"Connection pooling validation\", \"Load testing with profiling\"]",
            "timestamp": datetime.utcnow()
        })
        print("    [+] Seeded predictions collection with sample record.")

    # --- 3. UPLOADED FILES COLLECTION ---
    print(" -> Setting up 'uploaded_files' collection...")
    files_coll = db["uploaded_files"]
    files_coll.create_index("file_id", unique=True)
    files_coll.create_index("created_at")
    
    if files_coll.count_documents({}) == 0:
        files_coll.insert_one({
            "file_id": "seedfile12345",
            "file_name": "sample_bugs.csv",
            "file_type": "csv",
            "file_size": 1024,
            "upload_status": "completed",
            "prediction_count": 1,
            "uploaded_by": "system",
            "created_at": datetime.utcnow()
        })
        print("    [+] Seeded uploaded_files collection.")

    # --- 4. MODEL METRICS COLLECTION ---
    print(" -> Setting up 'model_metrics' collection...")
    metrics_coll = db["model_metrics"]
    metrics_coll.create_index("training_date")
    
    if metrics_coll.count_documents({}) == 0:
        metrics_coll.insert_many([
            {
                "model_name": "LightGBM Bug Classifier v1.0",
                "accuracy": 0.88,
                "f1_score": 0.87,
                "precision": 0.88,
                "recall": 0.86,
                "training_date": datetime.utcnow(),
                "active": True
            }
        ])
        print("    [+] Seeded model_metrics collection.")

    # --- 5. AUDIT LOGS COLLECTION ---
    print(" -> Setting up 'audit_logs' collection...")
    audit_coll = db["audit_logs"]
    audit_coll.create_index("timestamp")
    
    if audit_coll.count_documents({}) == 0:
        audit_coll.insert_one({
            "action": "DB_SETUP",
            "user_id": None,
            "description": "MongoDB database initialized, collections and indexes successfully built.",
            "ip_address": "127.0.0.1",
            "timestamp": datetime.utcnow()
        })
        print("    [+] Seeded audit_logs collection.")

    print("\n" + "=" * 60)
    print("DATABASE INITIALIZATION COMPLETED SUCCESSFULLY!")
    print(f"Database '{DB_NAME}' is now configured on your MongoDB cluster.")
    print("=" * 60)

if __name__ == "__main__":
    main()
