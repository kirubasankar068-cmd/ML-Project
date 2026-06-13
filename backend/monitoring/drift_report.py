"""
Data and Model Drift Detection Module

Using Evidently AI for drift detection and reporting.
"""

import logging
import pandas as pd
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)


class DriftDetector:
    """Detects data drift using statistical methods"""
    
    def __init__(self, reference_data: pd.DataFrame = None):
        """
        Initialize drift detector
        
        Args:
            reference_data: Reference dataset for comparison
        """
        self.reference_data = reference_data
        self.reference_stats = self._compute_stats(reference_data) if reference_data is not None else None
    
    def _compute_stats(self, df: pd.DataFrame) -> Dict[str, Any]:
        """Compute statistics for a dataset"""
        stats = {}
        
        for col in df.columns:
            if df[col].dtype in ['int64', 'float64']:
                stats[col] = {
                    'mean': df[col].mean(),
                    'std': df[col].std(),
                    'min': df[col].min(),
                    'max': df[col].max(),
                    'median': df[col].median()
                }
            else:
                stats[col] = {
                    'unique_values': df[col].nunique(),
                    'value_counts': df[col].value_counts().to_dict()
                }
        
        return stats
    
    def detect_drift(self, current_data: pd.DataFrame, threshold: float = 0.1) -> Dict[str, Any]:
        """
        Detect drift in current data compared to reference
        
        Args:
            current_data: Current dataset
            threshold: Drift detection threshold
        
        Returns:
            Drift detection report
        """
        if self.reference_stats is None:
            raise ValueError("No reference data available. Initialize with reference_data.")
        
        current_stats = self._compute_stats(current_data)
        
        drift_report = {
            'timestamp': datetime.utcnow().isoformat(),
            'has_drift': False,
            'drifted_features': [],
            'drift_details': {}
        }
        
        # Check for numeric feature drift
        for col in self.reference_stats:
            if isinstance(self.reference_stats[col], dict) and 'mean' in self.reference_stats[col]:
                ref_mean = self.reference_stats[col]['mean']
                curr_mean = current_stats[col]['mean']
                
                # Calculate relative change
                if ref_mean != 0:
                    relative_change = abs((curr_mean - ref_mean) / ref_mean)
                    
                    if relative_change > threshold:
                        drift_report['has_drift'] = True
                        drift_report['drifted_features'].append(col)
                        drift_report['drift_details'][col] = {
                            'reference_mean': float(ref_mean),
                            'current_mean': float(curr_mean),
                            'relative_change': float(relative_change)
                        }
        
        return drift_report
    
    def generate_drift_report_html(self, drift_report: Dict[str, Any], output_path: str):
        """
        Generate HTML drift report
        
        Args:
            drift_report: Drift detection results
            output_path: Path to save HTML report
        """
        html_content = f"""
        <html>
            <head>
                <title>Data Drift Report</title>
                <style>
                    body {{ font-family: Arial, sans-serif; margin: 20px; }}
                    .header {{ background-color: #333; color: white; padding: 20px; }}
                    .drift-warning {{ background-color: #ff6b6b; color: white; padding: 10px; margin: 10px 0; }}
                    .drift-ok {{ background-color: #51cf66; color: white; padding: 10px; margin: 10px 0; }}
                    table {{ border-collapse: collapse; width: 100%; margin-top: 20px; }}
                    th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
                    th {{ background-color: #f2f2f2; }}
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Data Drift Report</h1>
                    <p>Generated: {drift_report['timestamp']}</p>
                </div>
                
                <div>
                    {
                        '<div class="drift-warning">⚠️ DRIFT DETECTED</div>' 
                        if drift_report['has_drift'] 
                        else '<div class="drift-ok">✓ No drift detected</div>'
                    }
                </div>
                
                <h2>Drifted Features</h2>
                <p>Total drifted features: {len(drift_report['drifted_features'])}</p>
                
                {
                    '<table>' +
                    '<tr><th>Feature</th><th>Reference Mean</th><th>Current Mean</th><th>Change %</th></tr>' +
                    ''.join([
                        f"<tr><td>{feat}</td><td>{drift_report['drift_details'][feat]['reference_mean']:.4f}</td>"
                        f"<td>{drift_report['drift_details'][feat]['current_mean']:.4f}</td>"
                        f"<td>{drift_report['drift_details'][feat]['relative_change']*100:.2f}%</td></tr>"
                        for feat in drift_report['drifted_features']
                    ]) +
                    '</table>'
                    if drift_report['drifted_features']
                    else '<p>No features show significant drift.</p>'
                }
            </body>
        </html>
        """
        
        with open(output_path, 'w') as f:
            f.write(html_content)
        
        logger.info(f"Drift report saved to {output_path}")


class ModelDriftMonitor:
    """Monitors model performance drift over time"""
    
    def __init__(self):
        """Initialize model drift monitor"""
        self.performance_history = []
    
    def log_prediction_performance(self, y_true: pd.Series, y_pred: pd.Series, timestamp: str = None):
        """
        Log prediction performance
        
        Args:
            y_true: Actual labels
            y_pred: Predicted labels
            timestamp: Timestamp of predictions
        """
        from sklearn.metrics import accuracy_score, f1_score
        
        if timestamp is None:
            timestamp = datetime.utcnow().isoformat()
        
        accuracy = accuracy_score(y_true, y_pred)
        f1 = f1_score(y_true, y_pred, average='weighted', zero_division=0)
        
        performance_entry = {
            'timestamp': timestamp,
            'accuracy': accuracy,
            'f1_score': f1,
            'sample_count': len(y_true)
        }
        
        self.performance_history.append(performance_entry)
        logger.info(f"Performance logged: Accuracy={accuracy:.4f}, F1={f1:.4f}")
    
    def detect_performance_drift(self, window_size: int = 10, threshold: float = 0.05) -> Dict[str, Any]:
        """
        Detect performance drift
        
        Args:
            window_size: Number of recent entries to compare
            threshold: Performance drop threshold
        
        Returns:
            Performance drift report
        """
        if len(self.performance_history) < window_size * 2:
            return {'drift_detected': False, 'message': 'Insufficient history for drift detection'}
        
        # Compare recent window with historical average
        recent = self.performance_history[-window_size:]
        historical = self.performance_history[:-window_size]
        
        recent_acc = sum(p['accuracy'] for p in recent) / len(recent)
        historical_acc = sum(p['accuracy'] for p in historical) / len(historical)
        
        accuracy_drop = (historical_acc - recent_acc) / historical_acc if historical_acc != 0 else 0
        
        drift_detected = accuracy_drop > threshold
        
        return {
            'drift_detected': drift_detected,
            'historical_accuracy': historical_acc,
            'recent_accuracy': recent_acc,
            'accuracy_drop': accuracy_drop,
            'threshold': threshold
        }
