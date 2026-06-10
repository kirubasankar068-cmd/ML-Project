"""
Data quality validation script
"""

import logging
import pandas as pd
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class DataValidator:
    """Validates bug data structure and column values"""
    
    def __init__(self):
        self.validation_results = []
    
    def validate_schema(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Validates columns and schema types"""
        logger.info("Validating schema...")
        
        expected_columns = {
            'id': 'int64',
            'title': 'object',
            'description': 'object',
            'component': 'object',
            'severity': 'object',
            'affected_users': 'int64',
            'is_reproducible': 'bool',
            'priority': 'object',
        }
        
        report = {
            'test_name': 'schema_validation',
            'passed': True,
            'issues': [],
            'details': {}
        }
        
        # Check for required columns
        missing_cols = set(expected_columns.keys()) - set(df.columns)
        if missing_cols:
            report['passed'] = False
            report['issues'].append(f"Missing columns: {missing_cols}")
            report['details']['missing_columns'] = list(missing_cols)
        
        # Check column types
        for col, expected_type in expected_columns.items():
            if col in df.columns:
                if str(df[col].dtype) != expected_type:
                    report['issues'].append(
                        f"Column '{col}': expected {expected_type}, got {df[col].dtype}"
                    )
                    report['details'][col] = {
                        'expected': expected_type,
                        'actual': str(df[col].dtype)
                    }
        
        if report['issues']:
            report['passed'] = False
        
        self.validation_results.append(report)
        return report
    
    def validate_values(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Validates range and specific allowed values"""
        logger.info("Validating values...")
        
        report = {
            'test_name': 'value_validation',
            'passed': True,
            'issues': [],
            'details': {}
        }
        
        # Check for duplicates
        duplicates = df.duplicated(subset=['id']).sum()
        if duplicates > 0:
            report['issues'].append(f"Found {duplicates} duplicate IDs")
            report['details']['duplicate_ids'] = int(duplicates)
        
        # Check severity values
        valid_severities = {'low', 'medium', 'high', 'critical'}
        if 'severity' in df.columns:
            invalid_severities = ~df['severity'].isin(valid_severities)
            if invalid_severities.any():
                report['issues'].append(
                    f"Invalid severity values: {df.loc[invalid_severities, 'severity'].unique()}"
                )
                report['details']['invalid_severities'] = df.loc[invalid_severities, 'severity'].unique().tolist()
        
        # Check priority values
        valid_priorities = {'Low', 'Medium', 'High', 'Critical'}
        if 'priority' in df.columns:
            invalid_priorities = ~df['priority'].isin(valid_priorities)
            if invalid_priorities.any():
                report['issues'].append(
                    f"Invalid priority values: {df.loc[invalid_priorities, 'priority'].unique()}"
                )
                report['details']['invalid_priorities'] = df.loc[invalid_priorities, 'priority'].unique().tolist()
        
        # Check affected_users range
        if 'affected_users' in df.columns:
            invalid_users = (df['affected_users'] < 0) | (df['affected_users'] > 100000)
            if invalid_users.any():
                report['issues'].append(
                    f"Found {invalid_users.sum()} records with invalid affected_users"
                )
                report['details']['invalid_affected_users'] = int(invalid_users.sum())
        
        if report['issues']:
            report['passed'] = False
        
        self.validation_results.append(report)
        return report
    
    def validate_missing_values(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Checks percentage of null/empty records"""
        logger.info("Validating missing values...")
        
        missing_counts = df.isnull().sum()
        missing_pct = (missing_counts / len(df)) * 100
        
        report = {
            'test_name': 'missing_values_check',
            'passed': True,
            'issues': [],
            'details': {}
        }
        
        threshold = 5.0
        for col in df.columns:
            if missing_pct[col] > threshold:
                report['issues'].append(
                    f"Column '{col}': {missing_pct[col]:.2f}% missing values"
                )
                report['details'][col] = {
                    'count': int(missing_counts[col]),
                    'percentage': float(missing_pct[col])
                }
        
        if report['issues']:
            report['passed'] = False
        
        self.validation_results.append(report)
        return report
    
    def validate_distributions(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Flags rare categories"""
        logger.info("Validating distributions...")
        
        report = {
            'test_name': 'distribution_validation',
            'passed': True,
            'issues': [],
            'details': {}
        }
        
        if 'priority' in df.columns:
            priority_dist = df['priority'].value_counts()
            for priority, count in priority_dist.items():
                pct = (count / len(df)) * 100
                report['details'][f'priority_{priority}_pct'] = round(pct, 2)
                
                if pct < 1:
                    report['issues'].append(
                        f"Priority '{priority}' is rare: only {pct:.2f}% of data"
                    )
        
        if 'severity' in df.columns:
            severity_dist = df['severity'].value_counts()
            for severity, count in severity_dist.items():
                pct = (count / len(df)) * 100
                report['details'][f'severity_{severity}_pct'] = round(pct, 2)
        
        self.validation_results.append(report)
        return report
    
    def run_all_validations(self, df: pd.DataFrame) -> List[Dict[str, Any]]:
        self.validate_schema(df)
        self.validate_values(df)
        self.validate_missing_values(df)
        self.validate_distributions(df)
        return self.validation_results
    
    def get_report_summary(self) -> Dict[str, Any]:
        total = len(self.validation_results)
        passed = sum(1 for r in self.validation_results if r['passed'])
        
        return {
            'total_tests': total,
            'passed': passed,
            'failed': total - passed,
            'success_rate': round((passed / total * 100) if total > 0 else 0, 2),
            'all_passed': all(r['passed'] for r in self.validation_results)
        }
