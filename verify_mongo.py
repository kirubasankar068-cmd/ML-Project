import pymongo
import sys

uri = "mongodb+srv://kirubasankar068_db_user:AuTVeNeARIZtsBJa@cluster0.olxdhww.mongodb.net/"
try:
    print("Connecting to MongoDB...")
    client = pymongo.MongoClient(uri, serverSelectionTimeoutMS=5000)
    # Trigger a connection check
    info = client.server_info()
    print("Connected successfully!")
    print("Server Info:", info.get("version"))
    print("List of Databases:")
    for db_name in client.list_database_names():
        print(" -", db_name)
except Exception as e:
    print("Error connecting to MongoDB:", e)
    sys.exit(1)
