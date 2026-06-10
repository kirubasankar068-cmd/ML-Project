export type PriorityLabel = 'Critical' | 'High' | 'Medium' | 'Low';

export type Department =
  | 'Engineering'
  | 'Finance'
  | 'HR'
  | 'Sales'
  | 'Marketing'
  | 'Operations'
  | 'Customer-Support'
  | 'IT'
  | 'Data-Analytics'
  | 'Product';

export type Severity = 'blocker' | 'critical' | 'major' | 'normal' | 'minor' | 'trivial';

export type Environment = 'production' | 'staging' | 'QA' | 'development';

export type ReporterSeniority =
  | 'senior-engineer'
  | 'junior-engineer'
  | 'qa-tester'
  | 'external-user'
  | 'product-manager';

export interface BugInput {
  title: string;
  department: Department;
  module: string;
  severity: Severity;
  reporter_seniority: ReporterSeniority;
  environment: Environment;
  os_platform?: string;
  version?: string;
  affected_users: number;
  stack_trace_depth: number;
  error_frequency: number;
  days_since_last_occurrence: number;
  has_crash_log: boolean;
  linked_issues_count: number;
  comment_count: number;
  votes: number;
  time_to_resolve_hours: number;
}

export interface FeatureSignal {
  feature: string;
  value: string | number | boolean;
  importance: number;
  direction: 'increases' | 'decreases';
}

export interface PredictionResult {
  priority_label: PriorityLabel;
  confidence_score: number;
  top_3_features: string[] | FeatureSignal[];
  prediction_id: string;
  model_version: string;
  timestamp: string;
}

export interface DashboardStats {
  total_predictions: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  avg_confidence: number;
  service_status: string;
  predictions_last_hour?: number;
  trend_delta?: number;
}

export interface HealthResponse {
  status: string;
  model_version: string;
  uptime_seconds: number;
}

export interface HistoryResponse {
  timestamps: string[];
  confidences: number[];
  labels: string[];
}

export interface TrendData {
  dates: string[];
  critical: number[];
  high: number[];
  medium: number[];
  low: number[];
}

export interface DeptData {
  departments: string[];
  critical: number[];
  high: number[];
  medium: number[];
  low: number[];
}

export interface MonitoringHealth {
  model_status: string;
  drift_scores: Record<string, number>;
  last_retrain: string;
  avg_latency?: number;
  predictions_today?: number;
}
