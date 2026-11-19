"""
Upload Security & File Validation Utility
Enforces upload size limits, MIME type & magic byte checks, ZIP bomb & path traversal protection,
dangerous file extension blocking, and dataset sanitization.
"""

import os
import re
import uuid
import zipfile
import shutil
import logging
from typing import List, Tuple, Dict, Any

logger = logging.getLogger(__name__)

# Security Threshold Configuration
MAX_SINGLE_FILE_SIZE = 10 * 1024 * 1024       # 10 MB
MAX_TOTAL_REQUEST_SIZE = 25 * 1024 * 1024     # 25 MB
MAX_FILES_PER_REQUEST = 10                     # 10 files
MAX_ZIP_EXTRACTION_SIZE = 50 * 1024 * 1024    # 50 MB
MAX_ZIP_NESTING_DEPTH = 3                     # 3 levels

ALLOWED_EXTENSIONS = {
    '.csv', '.txt', '.log', '.json', '.pdf', '.doc', '.docx',
    '.png', '.jpg', '.jpeg', '.zip'
}

DANGEROUS_EXTENSIONS = {
    '.exe', '.bat', '.cmd', '.sh', '.ps1', '.dll', '.jar', '.scr',
    '.vbs', '.js', '.py', '.php', '.asp', '.aspx', '.pl', '.cgi', '.com'
}

# Magic byte signatures
MAGIC_BYTES = {
    '.png': b'\x89PNG\r\n\x1a\n',
    '.jpg': b'\xff\xd8\xff',
    '.jpeg': b'\xff\xd8\xff',
    '.pdf': b'%PDF',
    '.zip': b'PK\x03\x04',
}


def sanitize_filename(filename: str) -> str:
    """Generates a safe unique filename preserving extension"""
    base, ext = os.path.splitext(filename)
    ext = ext.lower().strip()
    safe_id = uuid.uuid4().hex[:12]
    return f"upload_{safe_id}{ext}"


def validate_file_security(
    file_bytes: bytes,
    filename: str
) -> Tuple[bool, str]:
    """
    Validates single file size, extension, dangerous file types, and magic bytes.
    
    Returns:
        Tuple of (is_valid: bool, error_message: str)
    """
    if not file_bytes or len(file_bytes) == 0:
        return False, f"File '{filename}' is empty."

    # Size check
    file_size = len(file_bytes)
    if file_size > MAX_SINGLE_FILE_SIZE:
        return False, f"File '{filename}' exceeds maximum allowed size of 10 MB ({file_size / (1024*1024):.2f} MB)."

    # Extension check
    ext = os.path.splitext(filename)[1].lower().strip()
    if ext in DANGEROUS_EXTENSIONS:
        return False, f"File '{filename}' has a forbidden dangerous extension ('{ext}')."

    if ext not in ALLOWED_EXTENSIONS:
        return False, f"Unsupported file type '{ext}'. Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}."

    # Magic Bytes Check for Binary Files
    if ext in MAGIC_BYTES:
        expected_bytes = MAGIC_BYTES[ext]
        if not file_bytes.startswith(expected_bytes):
            return False, f"File '{filename}' header does not match expected signature for '{ext}' format."

    return True, ""


def validate_batch_upload_limits(files: List[Tuple[str, bytes]]) -> Tuple[bool, str]:
    """
    Validates batch request file count and total size limits.
    """
    if len(files) > MAX_FILES_PER_REQUEST:
        return False, f"Exceeded maximum file count per request. Allowed: {MAX_FILES_PER_REQUEST}, Received: {len(files)}."

    total_size = sum(len(b) for _, b in files)
    if total_size > MAX_TOTAL_REQUEST_SIZE:
        return False, f"Exceeded maximum total upload size. Allowed: 25 MB, Received: {total_size / (1024*1024):.2f} MB."

    return True, ""


def safely_extract_zip(
    zip_bytes: bytes,
    target_dir: str
) -> Tuple[List[str], Optional[str]]:
    """
    Extracts ZIP contents securely:
    - Path traversal prevention (checking '../')
    - ZIP bomb prevention (total uncompressed size limit)
    - Encrypted ZIP rejection
    - Nesting level checks
    
    Returns:
        Tuple of (extracted_file_paths, error_message)
    """
    from io import BytesIO
    extracted_paths = []
    total_uncompressed_size = 0

    try:
        with zipfile.ZipFile(BytesIO(zip_bytes), 'r') as zf:
            # Check for encryption
            for zinfo in zf.infolist():
                if zinfo.flag_bits & 0x1:
                    return [], "Encrypted/password-protected ZIP archives are not supported."

                # Path traversal check
                norm_name = os.path.normpath(zinfo.filename)
                if norm_name.startswith("..") or os.path.isabs(norm_name):
                    return [], f"Security violation: ZIP entry '{zinfo.filename}' contains invalid path traversal."

                # Nesting depth check
                depth = len([p for p in norm_name.split(os.sep) if p and p != '.'])
                if depth > MAX_ZIP_NESTING_DEPTH:
                    return [], f"ZIP entry '{zinfo.filename}' exceeds maximum nesting depth of {MAX_ZIP_NESTING_DEPTH} levels."

                total_uncompressed_size += zinfo.file_size
                if total_uncompressed_size > MAX_ZIP_EXTRACTION_SIZE:
                    return [], f"ZIP bomb detected: Uncompressed size exceeds {MAX_ZIP_EXTRACTION_SIZE / (1024*1024):.0f} MB threshold."

                ext = os.path.splitext(zinfo.filename)[1].lower()
                if ext in DANGEROUS_EXTENSIONS:
                    return [], f"ZIP contains dangerous file type '{ext}' in entry '{zinfo.filename}'."

            # Extract safely
            for zinfo in zf.infolist():
                if not zinfo.is_dir():
                    ext = os.path.splitext(zinfo.filename)[1].lower()
                    if ext in ALLOWED_EXTENSIONS:
                        safe_name = sanitize_filename(zinfo.filename)
                        dest_path = os.path.join(target_dir, safe_name)
                        with zf.open(zinfo) as source, open(dest_path, "wb") as target:
                            shutil.copyfileobj(source, target)
                        extracted_paths.append(dest_path)

        return extracted_paths, None
    except zipfile.BadZipFile:
        return [], "Invalid or corrupted ZIP archive."
    except Exception as e:
        logger.error(f"ZIP extraction error: {e}")
        return [], f"Failed to extract ZIP archive: {str(e)}"


def sanitize_dataset_content(df_raw) -> Any:
    """
    Sanitizes dataset contents:
    - Removes Excel/CSV formula injection prefixes (=, +, -, @)
    - Enforces max row processing limit (max 5,000 rows)
    """
    if df_raw is None or df_raw.empty:
        return df_raw

    # Cap row count to prevent memory exhaustion
    if len(df_raw) > 5000:
        df_raw = df_raw.iloc[:5000].copy()

    # Strip dangerous formula prefixes from string cells
    for col in df_raw.select_dtypes(include=['object']).columns:
        df_raw[col] = df_raw[col].astype(str).map(
            lambda val: re.sub(r'^[=+\-@]', '\'', val.strip()) if val else val
        )

    return df_raw
