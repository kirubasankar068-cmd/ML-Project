import pytest
import pandas as pd
import numpy as np
from backend.app.services.feature_engineering import FeatureEngineer

@pytest.fixture
def dummy_bug_data():
    """Returns a dummy bug reports dataframe for testing"""
    return pd.DataFrame([
        {
            'id': 1,
            'title': 'System crash on database query',
            'description': 'The application crashed immediately when executing standard sql queries on dashboard load. Severe bottleneck.',
            'component': 'database',
            'severity': 'critical',
            'affected_users': 500,
            'is_reproducible': True,
            'priority': 'Critical',
            'reported_date': '2024-06-05 12:00:00'
        },
        {
            'id': 2,
            'title': 'Button alignment issue on settings panel',
            'description': 'The save changes button is slightly cut off at the bottom. Cosmetic issue only.',
            'component': 'UI',
            'severity': 'low',
            'affected_users': 5,
            'is_reproducible': False,
            'priority': 'Low',
            'reported_date': '2024-06-06 09:30:00'
        }
    ])

def test_feature_engineer_fit_transform(dummy_bug_data):
    """Tests fitting and transforming with FeatureEngineer"""
    fe = FeatureEngineer()
    
    # Fit and transform
    X = fe.fit_transform(dummy_bug_data)
    
    assert fe.is_fitted
    assert isinstance(X, pd.DataFrame)
    assert len(X) == 2
    
    # Target column and id should not be features
    assert 'priority' not in X.columns
    assert 'id' not in X.columns
    assert 'priority_encoded' not in X.columns
    assert 'id_scaled' not in X.columns
    
    # Assert important features are generated
    assert 'title_length' in X.columns
    assert 'desc_length' in X.columns
    assert 'severity_encoded' in X.columns
    assert 'component_encoded' in X.columns
    assert 'affected_users_scaled' in X.columns

def test_feature_engineer_unseen_categories(dummy_bug_data):
    """Tests if FeatureEngineer handles unseen components or missing columns robustly"""
    fe = FeatureEngineer()
    fe.fit(dummy_bug_data)
    
    # Test data with unseen component and missing reported_date
    test_data = pd.DataFrame([
        {
            'title': 'New unique bug title',
            'description': 'Detailed description of a new unique bug report that is long enough.',
            'component': 'new_unseen_component',
            'severity': 'medium',
            'affected_users': 100,
            'is_reproducible': True
        }
    ])
    
    # Transform should run successfully without throwing exception
    try:
        X = fe.transform(test_data)
        assert isinstance(X, pd.DataFrame)
        assert len(X) == 1
        # Component encoded should be present and valid
        assert 'component_encoded' in X.columns
        # Time-based features should be defaulted and present
        assert 'report_day_of_week' in X.columns
        assert 'report_month' in X.columns
    except Exception as e:
        pytest.fail(f"Transform crashed on unseen component/missing columns: {e}")
