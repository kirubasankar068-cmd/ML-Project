"""
Authentication and Password Hashing Utilities
"""

import bcrypt

def hash_password(plain_password: str) -> str:
    """
    Hashes a plain-text password using bcrypt.
    """
    password_bytes = plain_password.encode('utf-8')
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifies a plain-text password against a hashed password (or plain-text fallback).
    """
    if hashed_password.startswith(("$2a$", "$2b$", "$2y$")):
        try:
            return bcrypt.checkpw(plain_password.encode('utf-8'), hashed_password.encode('utf-8'))
        except Exception:
            return False
    # Fallback to direct string comparison for legacy/bootstrapped passwords
    return plain_password == hashed_password

