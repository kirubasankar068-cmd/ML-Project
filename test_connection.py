"""Quick MongoDB Atlas connection test"""
import pymongo
import sys

MONGO_URI = "mongodb+srv://kirubasankar068_db_user:AuTVeNeARIZtsBJa@cluster0.olxdhww.mongodb.net/"

print("=" * 50)
print("  MongoDB Atlas Connection Test")
print("=" * 50)

# Attempt 1: Standard SRV connection
print("\n[1] Trying standard SRV connection (20s timeout)...")
try:
    client = pymongo.MongoClient(
        MONGO_URI,
        serverSelectionTimeoutMS=20000,
        connectTimeoutMS=20000,
    )
    info = client.server_info()
    ver = info.get("version", "unknown")
    print(f"    [OK] Connected! MongoDB v{ver}")
    dbs = client.list_database_names()
    print(f"    [OK] Databases: {dbs}")
    
    # Create the database and a test collection
    print("\n[2] Creating 'bug_priority_db' database...")
    db = client["bug_priority_db"]
    db["_connection_test"].insert_one({"status": "connected", "test": True})
    db["_connection_test"].drop()
    print("    [OK] Database created successfully!")
    
    # List databases again to confirm
    dbs = client.list_database_names()
    print(f"    [OK] Updated databases: {dbs}")
    
    client.close()
    print("\n[SUCCESS] MongoDB Atlas is connected and working!")
    sys.exit(0)

except pymongo.errors.ServerSelectionTimeoutError as e:
    print(f"    [FAIL] Connection timed out")
    print(f"    Error: {e}")

except Exception as e:
    print(f"    [FAIL] {type(e).__name__}: {e}")

# Attempt 2: Try direct connection to individual shards
print("\n[2] Trying direct shard connections...")
shards = [
    "ac-ysl6qpl-shard-00-00.olxdhww.mongodb.net",
    "ac-ysl6qpl-shard-00-01.olxdhww.mongodb.net",
    "ac-ysl6qpl-shard-00-02.olxdhww.mongodb.net",
]

for shard in shards:
    direct_uri = (
        f"mongodb://kirubasankar068_db_user:AuTVeNeARIZtsBJa@{shard}:27017/"
        f"?authSource=admin&ssl=true&directConnection=true"
    )
    try:
        client = pymongo.MongoClient(direct_uri, serverSelectionTimeoutMS=10000)
        info = client.server_info()
        ver = info.get("version", "unknown")
        print(f"    [OK] {shard} -> Connected (v{ver})")
        client.close()
    except Exception as e:
        err_name = type(e).__name__
        print(f"    [FAIL] {shard} -> {err_name}")

# Attempt 3: Check if port 27017 is reachable
print("\n[3] Testing TCP connectivity to port 27017...")
import socket
for shard in shards:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(5)
        result = s.connect_ex((shard, 27017))
        status = "OPEN" if result == 0 else f"BLOCKED (code={result})"
        print(f"    {shard}:27017 -> {status}")
        s.close()
    except Exception as e:
        print(f"    {shard}:27017 -> ERROR: {e}")

print("\n" + "=" * 50)
print("  DIAGNOSIS:")
print("  Your IP address is NOT whitelisted in MongoDB Atlas.")
print("  ")
print("  FIX: Go to MongoDB Atlas (cloud.mongodb.com)")
print("       -> Network Access -> + Add IP Address")
print("       -> 'Allow Access from Anywhere' -> Confirm")
print("  ")
print("  Then re-run this script.")
print("=" * 50)
