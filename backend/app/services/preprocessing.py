"""
Preprocessing Helper Module
"""

import re

def clean_text(text: str) -> str:
    """Cleans raw text for modeling"""
    if not text:
        return ""
    
    # Lowercase
    text = text.lower()
    
    # Remove HTML elements
    text = re.sub(r'<[^>]*>', ' ', text)
    
    # Remove special chars (keep letters, numbers, and basic punctuation)
    text = re.sub(r'[^a-zA-Z0-9\s\.\,\!\?\-]', ' ', text)
    
    # Collapse multiple whitespaces
    text = re.sub(r'\s+', ' ', text).strip()
    
    return text
