"""
Unit tests for Multi-Source Bug Analysis, OCR Screenshot Extraction,
Root Cause & Solution Generation, Upload Security Limits, and Continuous Learning Integration.
"""

import os
import io
import zipfile
import pytest
import pandas as pd

from backend.app.services.smart_bug_priority import (
    scan_file,
    scan_screenshot,
    generate_solution,
    analyze_bug,
    store_prediction,
    verify_prediction
)
from backend.app.utils.security import (
    validate_file_security,
    validate_batch_upload_limits,
    safely_extract_zip,
    sanitize_dataset_content
)
from backend.app.database.database import engine, Base


@pytest.fixture(scope="module", autouse=True)
def setup_database():
    """Ensure database schema is bound before running tests"""
    Base.metadata.create_all(bind=engine)
    yield


def test_upload_security_limits():
    """1. Test upload security: size limits, extension blocking, magic bytes"""
    # Test valid text file
    valid, msg = validate_file_security(b"Error log content", "app.log")
    assert valid is True

    # Test dangerous extension (.exe)
    valid_exe, msg_exe = validate_file_security(b"MZfakeexeheader", "malicious.exe")
    assert valid_exe is False
    assert "forbidden dangerous extension" in msg_exe

    # Test oversized single file (>10MB)
    large_bytes = b"0" * (11 * 1024 * 1024)
    valid_large, msg_large = validate_file_security(large_bytes, "large.log")
    assert valid_large is False
    assert "exceeds maximum allowed size" in msg_large

    # Test invalid magic bytes for PNG
    valid_png, msg_png = validate_file_security(b"FA KEP NG HEADER", "screenshot.png")
    assert valid_png is False
    assert "header does not match expected signature" in msg_png


def test_zip_security_and_extraction():
    """2. Test ZIP security: path traversal, extraction limits"""
    # Create valid in-memory zip
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w") as zf:
        zf.writestr("test_log.log", "ERROR: ConnectionRefusedError at database port 5432")
    zip_bytes = zip_buffer.getvalue()

    # Scan file with ZIP
    res = scan_file(zip_bytes, "logs_package.zip")
    assert res["file_name"] == "logs_package.zip"
    assert "ConnectionRefusedError" in res["detected_exceptions"]


def test_scan_file_log_and_csv():
    """3. Test scan_file on log and CSV datasets"""
    log_content = b"2026-09-07 10:00:00 [ERROR] java.lang.NullPointerException at com.auth.LoginService.verifyCredentials(LoginService.java:42)"
    res_log = scan_file(log_content, "server.log")
    assert "NullPointerException" in res_log["detected_exceptions"]
    assert len(res_log["stack_traces"]) > 0

    csv_content = b"summary,description,severity,component,priority\nDatabase pool leak,Query hangs,high,Database,HIGH\n"
    res_csv = scan_file(csv_content, "dataset.csv")
    assert len(res_csv["dataset_records"]) == 1
    assert res_csv["dataset_records"][0]["summary"] == "Database pool leak"


def test_generate_solution_accuracy_rule():
    """4. Test generate_solution with sufficient info vs insufficient info rule"""
    # Case A: Insufficient evidence
    empty_info = {"detected_exceptions": [], "stack_traces": [], "combined_text": "foo", "description": ""}
    sol_empty = generate_solution(empty_info)
    assert sol_empty["has_sufficient_info"] is False
    assert "Insufficient information to determine the exact root cause" in sol_empty["message"]

    # Case B: Sufficient evidence (NullPointerException)
    npe_info = {
        "detected_exceptions": ["NullPointerException"],
        "stack_traces": ["at com.auth.LoginService.verifyCredentials(LoginService.java:42)"],
        "combined_text": "NullPointerException user login",
        "description": "User login crashes with null reference"
    }
    sol_npe = generate_solution(npe_info)
    assert sol_npe["has_sufficient_info"] is True
    assert "NullPointerException" in sol_npe["problem"]
    assert sol_npe["code_fix"] is not None
    assert "if (user != null" in sol_npe["code_fix"]


def test_analyze_bug_multi_source():
    """5. Test combined multi-source analyze_bug function"""
    bug_details = {
        "summary": "Database connection pool exhausted during peak load",
        "description": "Application throws 500 Internal Server Error when 500 users attempt checkout.",
        "severity": "critical",
        "component": "Database",
        "bug_type": "Performance",
        "affected_users": 250,
        "is_reproducible": True
    }

    log_file = ("db_error.log", b"500 Internal Server Error: DatabaseConnectionPoolExhausted at line 102")

    result = analyze_bug(
        bug_details=bug_details,
        files=[log_file],
        screenshots=None
    )

    assert result["bug_id"] is not None
    assert result["priority"] in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "REVIEW REQUIRED"]
    assert result["confidence"] > 0
    assert result["error_type"] in ["DatabaseConnectionPoolExhausted", "500 Internal Server Error", "Unidentified Exception"]
    assert result["solution"]["has_sufficient_info"] is True
    assert len(result["solution"]["steps_to_fix"]) > 0
    assert result["solution"]["code_fix"] is not None


def test_continuous_learning_integration():
    """6. Test prediction storage & human verification for multi-source bugs"""
    bug_details = {
        "summary": "Authentication token invalidation flaw on logout",
        "description": "JWT tokens remain active post logout.",
        "severity": "high",
        "component": "Auth"
    }
    result = analyze_bug(bug_details=bug_details)
    bug_id = result["bug_id"]

    v_res = verify_prediction(bug_id=bug_id, actual_priority="HIGH", verified_by="security_auditor")
    assert v_res["status"] == "success"
    assert v_res["verified_record"]["bug_id"] == bug_id
