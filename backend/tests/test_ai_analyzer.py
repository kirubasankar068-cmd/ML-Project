"""
Unit Tests for AI Bug Analyzer Engine
"""

import pytest
from backend.app.services.ai_bug_analyzer import ai_bug_analyzer

def test_analyze_empty_input():
    res = ai_bug_analyzer.analyze(text_input="")
    assert res["confidence"] < 70
    assert res["priority"] == "P4"
    assert "No text could be extracted" in res["priority_reason"] or "Insufficient" in res["priority_reason"]
    assert "bug_title" in res
    assert "exact_solution" in res

def test_analyze_valid_text_input():
    sample_text = """
    Exception in thread "main" java.lang.NullPointerException
    at com.example.service.UserService.getUserById(UserService.java:42)
    at com.example.controller.UserController.getProfile(UserController.java:18)
    """
    res = ai_bug_analyzer.analyze(text_input=sample_text)
    assert res["confidence"] >= 70
    assert res["severity"] in ["Critical", "High", "Medium", "Low"]
    assert res["priority"] in ["P1", "P2", "P3", "P4"]
    assert isinstance(res["exact_solution"]["steps"], list)
    assert len(res["exact_solution"]["steps"]) > 0
    assert len(res["alternative_solutions"]) >= 2
    assert len(res["prevention_tips"]) >= 1
    assert "voice_summary" in res

def test_structured_output_schema():
    sample_text = "Database connection timeout error: Unable to connect to host 127.0.0.1:5432 after 30000ms."
    res = ai_bug_analyzer.analyze(text_input=sample_text)
    
    # Check JSON schema keys
    required_keys = [
        "bug_title", "category", "severity", "priority", "priority_reason",
        "confidence", "root_cause", "exact_solution", "alternative_solutions",
        "prevention_tips", "voice_summary"
    ]
    for key in required_keys:
        assert key in res, f"Missing required key: {key}"

    assert isinstance(res["confidence"], int)
    assert 0 <= res["confidence"] <= 100
    assert res["category"] in [
        "Syntax", "Runtime", "Logic", "Performance", "Security",
        "UI/UX", "Database", "Network", "Configuration", "Dependency"
    ]
