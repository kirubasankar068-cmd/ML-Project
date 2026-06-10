"""
Prometheus Metrics Module

Exposes metrics for monitoring and observability.
"""

import logging
from datetime import datetime
from typing import Dict, Any
from dataclasses import dataclass, asdict

logger = logging.getLogger(__name__)


@dataclass
class PredictionMetrics:
    """Metrics for a single prediction"""
    timestamp: str
    model_name: str
    prediction_time_ms: float
    confidence: float
    priority_predicted: str
    feature_count: int
    success: bool
    error_message: str = None


class MetricsCollector:
    """Collects and aggregates metrics"""
    
    def __init__(self):
        """Initialize metrics collector"""
        self.prediction_metrics = []
        self.model_performance = {
            'total_predictions': 0,
            'successful_predictions': 0,
            'failed_predictions': 0,
            'average_confidence': 0.0,
            'average_latency_ms': 0.0
        }
    
    def record_prediction(self, metrics: PredictionMetrics):
        """
        Record a prediction
        
        Args:
            metrics: Prediction metrics
        """
        self.prediction_metrics.append(asdict(metrics))
        
        self.model_performance['total_predictions'] += 1
        
        if metrics.success:
            self.model_performance['successful_predictions'] += 1
        else:
            self.model_performance['failed_predictions'] += 1
        
        # Update running averages
        if self.model_performance['total_predictions'] > 0:
            total = self.model_performance['total_predictions']
            
            # Average confidence (for successful predictions only)
            successful = self.model_performance['successful_predictions']
            if successful > 0:
                current_avg = self.model_performance['average_confidence']
                self.model_performance['average_confidence'] = (
                    (current_avg * (successful - 1) + metrics.confidence) / successful
                )
            
            # Average latency
            current_avg_latency = self.model_performance['average_latency_ms']
            self.model_performance['average_latency_ms'] = (
                (current_avg_latency * (total - 1) + metrics.prediction_time_ms) / total
            )
    
    def get_performance_summary(self) -> Dict[str, Any]:
        """Get performance summary"""
        success_rate = (
            (self.model_performance['successful_predictions'] / 
             self.model_performance['total_predictions'] * 100)
            if self.model_performance['total_predictions'] > 0
            else 0
        )
        
        return {
            'total_predictions': self.model_performance['total_predictions'],
            'successful_predictions': self.model_performance['successful_predictions'],
            'failed_predictions': self.model_performance['failed_predictions'],
            'success_rate_percent': round(success_rate, 2),
            'average_confidence': round(self.model_performance['average_confidence'], 4),
            'average_latency_ms': round(self.model_performance['average_latency_ms'], 2)
        }
    
    def export_prometheus_metrics(self) -> str:
        """
        Export metrics in Prometheus format
        
        Returns:
            Prometheus-formatted metrics
        """
        summary = self.get_performance_summary()
        
        metrics = f"""
# HELP bug_priority_predictions_total Total number of bug priority predictions
# TYPE bug_priority_predictions_total counter
bug_priority_predictions_total {summary['total_predictions']}

# HELP bug_priority_predictions_success_total Successful predictions
# TYPE bug_priority_predictions_success_total counter
bug_priority_predictions_success_total {summary['successful_predictions']}

# HELP bug_priority_predictions_failed_total Failed predictions
# TYPE bug_priority_predictions_failed_total counter
bug_priority_predictions_failed_total {summary['failed_predictions']}

# HELP bug_priority_success_rate Success rate percentage
# TYPE bug_priority_success_rate gauge
bug_priority_success_rate {summary['success_rate_percent']}

# HELP bug_priority_average_confidence Average prediction confidence
# TYPE bug_priority_average_confidence gauge
bug_priority_average_confidence {summary['average_confidence']}

# HELP bug_priority_prediction_latency_ms Average prediction latency in milliseconds
# TYPE bug_priority_prediction_latency_ms gauge
bug_priority_prediction_latency_ms {summary['average_latency_ms']}
        """
        
        return metrics.strip()
    
    def reset_metrics(self):
        """Reset all metrics"""
        self.prediction_metrics = []
        self.model_performance = {
            'total_predictions': 0,
            'successful_predictions': 0,
            'failed_predictions': 0,
            'average_confidence': 0.0,
            'average_latency_ms': 0.0
        }
        logger.info("Metrics reset")


class AlertManager:
    """Manages alerts based on metrics thresholds"""
    
    def __init__(self, thresholds: Dict[str, Any] = None):
        """
        Initialize alert manager
        
        Args:
            thresholds: Alert thresholds
        """
        self.thresholds = thresholds or {
            'min_success_rate': 0.95,
            'max_latency_ms': 1000,
            'min_confidence': 0.7,
            'max_failure_rate': 0.05
        }
        self.active_alerts = []
    
    def check_thresholds(self, metrics: Dict[str, Any]) -> list:
        """
        Check if metrics exceed thresholds
        
        Args:
            metrics: Metrics to check
        
        Returns:
            List of triggered alerts
        """
        alerts = []
        
        # Check success rate
        success_rate = metrics.get('success_rate_percent', 100) / 100
        if success_rate < self.thresholds['min_success_rate']:
            alerts.append({
                'severity': 'WARNING',
                'message': f"Success rate {success_rate:.1%} below threshold {self.thresholds['min_success_rate']:.1%}",
                'metric': 'success_rate'
            })
        
        # Check latency
        latency = metrics.get('average_latency_ms', 0)
        if latency > self.thresholds['max_latency_ms']:
            alerts.append({
                'severity': 'WARNING',
                'message': f"Average latency {latency:.0f}ms exceeds threshold {self.thresholds['max_latency_ms']}ms",
                'metric': 'latency'
            })
        
        # Check confidence
        confidence = metrics.get('average_confidence', 0)
        if confidence < self.thresholds['min_confidence']:
            alerts.append({
                'severity': 'INFO',
                'message': f"Average confidence {confidence:.3f} below threshold {self.thresholds['min_confidence']}",
                'metric': 'confidence'
            })
        
        self.active_alerts = alerts
        return alerts
    
    def get_alerts_summary(self) -> Dict[str, Any]:
        """Get summary of active alerts"""
        return {
            'total_alerts': len(self.active_alerts),
            'warnings': sum(1 for a in self.active_alerts if a['severity'] == 'WARNING'),
            'info': sum(1 for a in self.active_alerts if a['severity'] == 'INFO'),
            'alerts': self.active_alerts
        }
