import socket
import sys

shard = "ac-ysl6qpl-shard-00-00.olxdhww.mongodb.net"
try:
    ip = socket.gethostbyname(shard)
    print(f"DNS RESOLVED: {shard} -> {ip}")
except Exception as e:
    print(f"DNS RESOLUTION FAILED for {shard}: {e}")
