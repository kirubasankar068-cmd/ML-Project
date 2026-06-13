"""
MongoDB Database Initializer
Smart Bug Priority Predictor

This script connects to your existing MongoDB Atlas Cluster0 and creates
the 'bug_priority_db' database with all required collections and indexes.

Run with:  python setup_mongodb.py
"""

import os
import sys
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Load MONGO_URI from .env if python-dotenv is available, else fall back to
# reading the file manually so we don't need extra dependencies.
# ---------------------------------------------------------------------------
MONGO_URI = None
MONGO_DB_NAME = "bug_priority_db"

env_path = os.path.join(os.path.dirname(__file__), ".env")
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line.startswith("MONGO_URI="):
                MONGO_URI = line.split("=", 1)[1].strip().strip('"').strip("'")
            if line.startswith("MONGO_DB_NAME="):
                MONGO_DB_NAME = line.split("=", 1)[1].strip().strip('"').strip("'")

if not MONGO_URI:
    MONGO_URI = "mongodb+srv://kirubasankar068_db_user:AuTVeNeARIZtsBJa@cluster0.olxdhww.mongodb.net/"

print("=" * 60)
print("  Smart Bug Priority Predictor -- MongoDB Initializer")
print("=" * 60)
print(f"\n  Cluster  : cluster0.olxdhww.mongodb.net")
print(f"  Database : {MONGO_DB_NAME}")
print()

# ---------------------------------------------------------------------------
# Connect
# ---------------------------------------------------------------------------
try:
    import pymongo
except ImportError:
    print("[ERROR] pymongo is not installed.")
    print("        Run:  pip install pymongo[srv]")
    sys.exit(1)

try:
    print("[1/5] Connecting to MongoDB Atlas ...")
    client = pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=15000)
    # Force a real connection check
    server_info = client.server_info()
    print(f"      [OK] Connected  (MongoDB v{server_info['version']})")
except Exception as exc:
    print(f"\n[ERROR] Could not connect to MongoDB Atlas:\n  {exc}")
    print()
    print("  Possible reasons:")
    print("  1. Your IP is not whitelisted in Atlas -> Network Access -> Add IP Address")
    print("  2. Wrong credentials in the URI")
    print("  3. Cluster is paused on the free tier (M0)")
    sys.exit(1)

# ---------------------------------------------------------------------------
# Create / open database
# ---------------------------------------------------------------------------
print(f"\n[2/5] Creating database '{MONGO_DB_NAME}' ...")
db = client[MONGO_DB_NAME]

# ---------------------------------------------------------------------------
# Collections and their indexes
# ---------------------------------------------------------------------------
COLLECTIONS = {
    "users": {
        "description": "Application users (admin, developer, guest)",
        "indexes": [
            {"key": [("username", pymongo.ASCENDING)], "unique": True, "name": "username_unique"},
            {"key": [("created_at", pymongo.DESCENDING)], "name": "created_at_desc"},
        ],
        "seed": [
            {
                "username": "admin",
                "password_hash": "$2b$12$placeholder_hash",  # replace with real bcrypt hash
                "role": "admin",
                "created_at": datetime.now(timezone.utc),
            }
        ],
    },
    "predictions": {
        "description": "Individual bug prediction records",
        "indexes": [
            {"key": [("bug_id", pymongo.ASCENDING)], "unique": True, "name": "bug_id_unique"},
            {"key": [("timestamp", pymongo.DESCENDING)], "name": "timestamp_desc"},
            {"key": [("predicted_priority", pymongo.ASCENDING)], "name": "priority_asc"},
            {"key": [("file_id", pymongo.ASCENDING)], "name": "file_id_asc"},
        ],
        "seed": [],
    },
    "uploaded_files": {
        "description": "Metadata for uploaded CSV / XLSX / log files",
        "indexes": [
            {"key": [("created_at", pymongo.DESCENDING)], "name": "created_at_desc"},
            {"key": [("upload_status", pymongo.ASCENDING)], "name": "status_asc"},
        ],
        "seed": [],
    },
    "model_metrics": {
        "description": "ML model accuracy / F1 / precision / recall snapshots",
        "indexes": [
            {"key": [("model_name", pymongo.ASCENDING)], "name": "model_name_asc"},
            {"key": [("training_date", pymongo.DESCENDING)], "name": "training_date_desc"},
            {"key": [("active", pymongo.ASCENDING)], "name": "active_asc"},
        ],
        "seed": [
            {
                "model_name": "LightGBM",
                "accuracy": 0.0,
                "f1_score": 0.0,
                "precision": 0.0,
                "recall": 0.0,
                "training_date": datetime.now(timezone.utc),
                "active": True,
            }
        ],
    },
    "prediction_history": {
        "description": "Lightweight history log of every prediction",
        "indexes": [
            {"key": [("bug_id", pymongo.ASCENDING)], "name": "bug_id_asc"},
            {"key": [("created_at", pymongo.DESCENDING)], "name": "created_at_desc"},
        ],
        "seed": [],
    },
    "audit_logs": {
        "description": "Audit trail for user actions",
        "indexes": [
            {"key": [("timestamp", pymongo.DESCENDING)], "name": "timestamp_desc"},
            {"key": [("user_id", pymongo.ASCENDING)], "name": "user_id_asc"},
            {"key": [("action", pymongo.ASCENDING)], "name": "action_asc"},
        ],
        "seed": [],
    },
}

# ---------------------------------------------------------------------------
# Create collections + indexes
# ---------------------------------------------------------------------------
print(f"\n[3/5] Creating collections and indexes ...\n")
existing_cols = set(db.list_collection_names())

created = []
skipped = []

for col_name, spec in COLLECTIONS.items():
    col = db[col_name]

    if col_name not in existing_cols:
        # Insert a dummy document to create the collection, then remove it
        col.insert_one({"__init__": True})
        col.delete_one({"__init__": True})
        created.append(col_name)
        status = "CREATED"
    else:
        skipped.append(col_name)
        status = "EXISTS "

    # Create indexes (idempotent — pymongo skips existing ones with the same name)
    for idx in spec["indexes"]:
        try:
            col.create_index(
                idx["key"],
                unique=idx.get("unique", False),
                name=idx["name"],
                background=True,
            )
        except pymongo.errors.OperationFailure as e:
            # Index already exists with different options — skip
            if "already exists" in str(e) or "IndexOptionsConflict" in str(e):
                pass
            else:
                raise

    print(f"  [{status}] {col_name:25s} — {spec['description']}")

# ---------------------------------------------------------------------------
# Seed data
# ---------------------------------------------------------------------------
print(f"\n[4/5] Seeding initial data …")
seeded = 0
for col_name, spec in COLLECTIONS.items():
    if spec["seed"]:
        col = db[col_name]
        for doc in spec["seed"]:
            try:
                col.insert_one(doc)
                seeded += 1
            except pymongo.errors.DuplicateKeyError:
                pass  # already seeded

if seeded:
    print(f"      [OK] {seeded} document(s) inserted.")
else:
    print("      [OK] No seed data to insert (collections already seeded).")

# ---------------------------------------------------------------------------
# Verify
# ---------------------------------------------------------------------------
print(f"\n[5/5] Verification ...\n")
all_cols = sorted(db.list_collection_names())
for col_name in all_cols:
    count = db[col_name].count_documents({})
    idxs  = db[col_name].index_information()
    print(f"  [OK] {col_name:25s}  docs={count:>4}  indexes={len(idxs)}")

print()
print("=" * 60)
print(f"  [SUCCESS] Database '{MONGO_DB_NAME}' is ready in Cluster0!")
print(f"     Collections : {len(all_cols)}")
print(f"     New         : {len(created)}  |  Already existed: {len(skipped)}")
print("=" * 60)
print()
print("  Next steps:")
print("  1. Go to MongoDB Atlas -> Network Access -> Add your IP address")
print("     if you haven't already (required to connect from your machine).")
print("  2. Update .env to confirm:  MONGO_DB_NAME=bug_priority_db")
print("  3. The project can now use this database instead of SQLite.")
print()

client.close()
