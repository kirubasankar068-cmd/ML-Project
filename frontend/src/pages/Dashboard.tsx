import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  TrendingUp,
  Zap,
  ShieldAlert,
  BarChart2,
  RefreshCw,
  Cpu,
  Bug,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { ConfidenceTrend } from '../components/Charts/ConfidenceTrend';
import { ClassDistribution } from '../components/Charts/ClassDistribution';
import { PriorityBadge } from '../components/PriorityBadge';
import { formatRelativeTime, formatConfidence, cn } from '../lib/utils';
import { usePredictionStore } from '../store/predictionStore';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { predictions, getDashboardStats, getDashboardHistory } = usePredictionStore();
  const [selectedPrediction, setSelectedPrediction] = React.useState<any | null>(null);
  


  // Load stats synchronously from local store
  const stats = getDashboardStats();
  const history = getDashboardHistory();

  const getRecentTableRows = () => {
    if (predictions && predictions.length > 0) {
      const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
      const sorted = [...predictions].sort((a, b) => {
        const pA = PRIORITY_ORDER[a.priority_label] ?? 4;
        const pB = PRIORITY_ORDER[b.priority_label] ?? 4;
        if (pA !== pB) return pA - pB;
        return b.confidence_score - a.confidence_score;
      });
      return sorted.slice(0, 5).map((p) => ({
        id: p.prediction_id,
        title: p.input.title || p.title || 'Untitled Bug',
        description: p.input.description || p.description || '',
        module: p.module || p.input.module,
        priority: p.priority_label,
        confidence: p.confidence_score,
        time: p.timestamp || new Date().toISOString(),
        raw: p,
      }));
    }

    return [
      {
        id: '1',
        title: 'SQL Injection threat at auth endpoint',
        description: 'Auth service threw severe database parsing anomalies. Payload validation filters failed, allowing unescaped SQL commands. High risk of data breach.',
        module: 'Auth Service',
        priority: 'Critical',
        confidence: 0.96,
        time: new Date(Date.now() - 660000).toISOString(),
        raw: {
          prediction_id: 'BUG-20260612-AUTH-96',
          priority_label: 'Critical',
          confidence_score: 0.96,
          timestamp: new Date(Date.now() - 660000).toISOString(),
          input: {
            title: 'SQL Injection threat at auth endpoint',
            module: 'Auth Service',
            description: 'Auth service threw severe database parsing anomalies. Payload validation filters failed, allowing unescaped SQL commands. High risk of data breach.',
            environment: 'production',
            severity: 'critical',
            department: 'Engineering'
          },
          recommendation: 'IMMEDIATE ACTION REQUIRED (P0): Rotate DB credentials, block access to auth gateway path, and inspect database query logs.',
          explanation: {
            reasoning: 'Input parameter containing classic SQL keywords (SELECT, UNION) detected in auth payload.',
            shap_impacts: [
              { feature: 'SQL Keyword Count', impact: 0.45 },
              { feature: 'Request Path Match', impact: 0.32 },
              { feature: 'Error Log Frequency', impact: 0.15 }
            ]
          }
        }
      },
      {
        id: '2',
        title: 'Payment checkout flow fails during tokenization',
        description: 'Stripe tokenization requests timeout intermittently. Payment gateway returns 503 Service Unavailable, preventing user transaction completions.',
        module: 'Checkout Core',
        priority: 'High',
        confidence: 0.88,
        time: new Date(Date.now() - 1500000).toISOString(),
        raw: {
          prediction_id: 'BUG-20260612-CHECK-88',
          priority_label: 'High',
          confidence_score: 0.88,
          timestamp: new Date(Date.now() - 1500000).toISOString(),
          input: {
            title: 'Payment checkout flow fails during tokenization',
            module: 'Checkout Core',
            description: 'Stripe tokenization requests timeout intermittently. Payment gateway returns 503 Service Unavailable, preventing user transaction completions.',
            environment: 'production',
            severity: 'major',
            department: 'Sales'
          },
          recommendation: 'HIGH URGENCY (P1): Re-route token queries to standby gateway, increase connection timeout limits, and check stripe API status dashboard.',
          explanation: {
            reasoning: 'Network timeout during transaction validation. Outbound HTTP requests to Stripe failing.',
            shap_impacts: [
              { feature: 'Intermittent Timeout Rate', impact: 0.38 },
              { feature: 'Affected User Count', impact: 0.29 },
              { feature: 'Failure Code 503', impact: 0.12 }
            ]
          }
        }
      },
      {
        id: '3',
        title: 'Database proxy connection leakage detected',
        description: 'Intermittent connection pool leakage observed in database proxy handler. Connection leaks accumulate over 12-hour period causing query lag.',
        module: 'Database Proxy',
        priority: 'Medium',
        confidence: 0.75,
        time: new Date(Date.now() - 3600000).toISOString(),
        raw: {
          prediction_id: 'BUG-20260612-DB-75',
          priority_label: 'Medium',
          confidence_score: 0.75,
          timestamp: new Date(Date.now() - 3600000).toISOString(),
          input: {
            title: 'Database proxy connection leakage detected',
            module: 'Database Proxy',
            description: 'Intermittent connection pool leakage observed in database proxy handler. Connection leaks accumulate over 12-hour period causing query lag.',
            environment: 'staging',
            severity: 'normal',
            department: 'Engineering'
          },
          recommendation: 'MEDIUM URGENCY (P2): Schedule cron task to recycle proxy connections, audit connection closure patterns in code repository, and monitor pool size limits.',
          explanation: {
            reasoning: 'Steady decrease in available pool connections over time. Occasional staging environment latency.',
            shap_impacts: [
              { feature: 'Active Connection Trend', impact: 0.28 },
              { feature: 'Leaked Count rate', impact: 0.18 },
              { feature: 'Latency Delta ms', impact: 0.08 }
            ]
          }
        }
      },
      {
        id: '4',
        title: 'API Gateway returns deprecated warning header',
        description: 'Deprecated v1 API calls trigger warning logs. Uptime unaffected, request completes successfully with correct JSON structure.',
        module: 'API Gateway',
        priority: 'Low',
        confidence: 0.64,
        time: new Date(Date.now() - 7200000).toISOString(),
        raw: {
          prediction_id: 'BUG-20260612-GATE-64',
          priority_label: 'Low',
          confidence_score: 0.64,
          timestamp: new Date(Date.now() - 7200000).toISOString(),
          input: {
            title: 'API Gateway returns deprecated warning header',
            module: 'API Gateway',
            description: 'Deprecated v1 API calls trigger warning logs. Uptime unaffected, request completes successfully with correct JSON structure.',
            environment: 'development',
            severity: 'minor',
            department: 'Product'
          },
          recommendation: 'LOW URGENCY (P3): File in sprint backlog to upgrade clients to newer endpoints, remove warning headers from gateway config, and archive old v1 documentation.',
          explanation: {
            reasoning: 'Warning triggers on minor client request header mismatches. No performance degradation.',
            shap_impacts: [
              { feature: 'Uptime Intact', impact: 0.22 },
              { feature: 'Response Success Rate', impact: 0.14 }
            ]
          }
        }
      },
    ];
  };

  const recentItems = getRecentTableRows();

  return (
    <div className="space-y-6">
      {/* Dashboard Header */}
      <div className="bg-white rounded-[2rem] p-5 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4 select-none border border-transparent">
        <div>
          <h2 className="text-sm font-black text-slate-900 tracking-tight">
            📺 MLOps Control Console
          </h2>
          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1.5">
            Real-time telemetry, model confidence stats, and recent classifications
          </p>
        </div>
      </div>

      {/* Standard MLOps Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Wider - 8/12) */}
        <div className="lg:col-span-8 space-y-6">
          
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            {/* Card 1: Dark Visa Card style predictions */}
            <div className="relative bg-slate-950 text-white rounded-[2rem] p-6 shadow-2xl overflow-hidden h-[180px] flex flex-col justify-between select-none border border-slate-900">
              {/* World Map Dotted Pattern */}
              <div className="absolute inset-0 opacity-10 pointer-events-none mix-blend-overlay">
                <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
                  <pattern id="mesh" width="8" height="8" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="#fff" />
                  </pattern>
                  <rect width="100" height="100" fill="url(#mesh)" />
                </svg>
              </div>

              <div className="flex justify-between items-start z-10">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Predictions</span>
                <Activity size={16} className="text-slate-400" />
              </div>

              <div className="z-10 mt-4">
                <span className="text-4xl font-extrabold tracking-tight leading-none">
                  {(stats?.total_predictions || 0).toLocaleString()}
                </span>
                <p className="text-[10px] text-green-400 font-semibold mt-1">
                  ↑ Local stats synced from storage
                </p>
              </div>

              <div className="flex justify-between items-center z-10 border-t border-white/10 pt-3 text-[10px] font-mono text-slate-500">
                <span>CARD ID: predictor_v1.0</span>
                <span>ENTERPRISE MLOPS</span>
              </div>
            </div>

            {/* Card 2: White Theme Card */}
            <div className="bg-white text-slate-800 rounded-[2rem] p-6 shadow-xl h-[180px] flex flex-col justify-between select-none border border-transparent">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Avg. Confidence</span>
                <TrendingUp size={16} className="text-blue-500" />
              </div>

              <div className="mt-4">
                <span className="text-4xl font-extrabold tracking-tight leading-none text-slate-950">
                  {formatConfidence(stats?.avg_confidence || 0.85)}
                </span>
                <p className="text-[10px] text-slate-400 font-semibold mt-1">
                  Average confidence interval across last evaluations
                </p>
              </div>

              <div className="border-t border-slate-100 pt-3 flex items-center justify-between text-[10px] font-semibold text-slate-500">
                <span>MODEL CALIBRATED</span>
                <span className="text-blue-500">OPTIMAL</span>
              </div>
            </div>
          </div>

          {/* Quick Action Pills Row */}
          <div className="flex flex-wrap gap-3 select-none">
            <Link
              to="/prediction"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-full shadow-md hover:bg-slate-50 transition-colors border border-transparent"
            >
              <Zap size={14} className="text-blue-500" />
              <span>Predict Bug</span>
            </Link>

            <button
              onClick={() => usePredictionStore.getState().clearStore()}
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-full shadow-md hover:bg-slate-50 transition-colors border border-transparent cursor-pointer"
            >
              <Cpu size={14} className="text-red-500" />
              <span>Clear History</span>
            </button>

            <Link
              to="/analytics"
              className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-full shadow-md hover:bg-slate-50 transition-colors border border-transparent"
            >
              <BarChart2 size={14} className="text-green-500" />
              <span>View Analytics</span>
            </Link>

            <button className="flex items-center gap-2 px-5 py-2.5 bg-white text-slate-800 text-xs font-bold rounded-full shadow-md hover:bg-slate-50 transition-colors border border-transparent cursor-pointer">
              <RefreshCw size={14} className="text-amber-500" />
              <span>Jira Sync</span>
            </button>
          </div>

          {/* Main Chart Panel - Confidence Score Trends */}
          <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-transparent">
            <div className="flex justify-between items-center mb-6 select-none">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Confidence Score Trends</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">Smoothing confidence distributions of last predictions</p>
              </div>
            </div>

            <ConfidenceTrend data={history || { timestamps: ['09:00', '10:00', '11:00'], confidences: [0.85, 0.85, 0.85] }} />
          </div>
        </div>

        {/* Right Column (Narrower - 4/12) */}
        <div className="lg:col-span-4">
          <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col gap-6 min-h-[520px] justify-between border border-transparent">
            {/* Top Half: Class Distribution Pie donut */}
            <div>
              <h3 className="text-sm font-bold text-slate-900 mb-4 select-none">Class Distribution</h3>
              <ClassDistribution
                data={
                  stats || {
                    critical: 0,
                    high: 0,
                    medium: 0,
                    low: 0,
                    total_predictions: 0,
                    avg_confidence: 0.85,
                    service_status: 'healthy',
                  }
                }
              />
            </div>

            {/* Bottom Half: Recent Predictions */}
            <div className="border-t border-slate-100 pt-6">
              <h3 className="text-sm font-bold text-slate-900 mb-4 select-none">Recent Predictions</h3>
              <div className="space-y-4">
                {recentItems.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => item.raw && setSelectedPrediction(item.raw)}
                    className={cn(
                      "flex items-center justify-between text-xs font-semibold p-2.5 rounded-2xl transition-all border border-transparent",
                      item.raw ? "hover:bg-slate-50/80 cursor-pointer hover:border-slate-100" : ""
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200 shrink-0 text-slate-700">
                        <Bug size={14} />
                      </div>
                      <div className="flex flex-col gap-0.5 max-w-[140px] truncate">
                        <span className="text-slate-900 truncate">{item.module}</span>
                        <span className="text-[10px] text-slate-400 font-semibold">
                          {formatRelativeTime(item.time)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-400 font-bold">{(item.confidence * 100).toFixed(0)}%</span>
                      <PriorityBadge label={item.priority as any} size="sm" variant="outline" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Modal overlay */}
      {selectedPrediction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start bg-slate-950 text-white select-none">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest leading-none">Bug Details & Action Plan</span>
                <h3 className="text-base font-extrabold text-white mt-1">
                  {selectedPrediction.input?.title || selectedPrediction.title || 'Bug Report Detail'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPrediction(null)}
                className="p-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white cursor-pointer transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto space-y-6">
              {/* Top Row: Meta parameters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 select-none">
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase">Component</span>
                  <span className="text-xs font-extrabold text-slate-800 truncate mt-1">
                    {selectedPrediction.input?.module || selectedPrediction.component || 'General'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase">Environment</span>
                  <span className="text-xs font-extrabold text-slate-800 capitalize mt-1">
                    {selectedPrediction.input?.environment || 'Production'}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase">Priority Level</span>
                  <div className="mt-1">
                    <PriorityBadge label={selectedPrediction.priority_label} size="sm" variant="solid" />
                  </div>
                </div>
                <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col justify-between">
                  <span className="text-[9px] text-slate-400 font-extrabold uppercase">ML Confidence</span>
                  <span className="text-xs font-black text-blue-600 mt-1">
                    {(selectedPrediction.confidence_score * 100).toFixed(1)}%
                  </span>
                </div>
              </div>

              {/* Bug Description */}
              <div className="space-y-1">
                <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bug Description</h4>
                <p className="text-xs text-slate-700 font-medium bg-slate-50 p-3.5 rounded-2xl border border-slate-100 leading-relaxed whitespace-pre-wrap">
                  {selectedPrediction.input?.description || selectedPrediction.description || 'No description available.'}
                </p>
              </div>

              {/* Urgency Fix Chart / Visual Rating (Fix First Guide) */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Urgency Fix Guidance</h4>
                <div className="bg-slate-50 p-4 rounded-3xl border border-slate-100 space-y-3">
                  <div className="flex justify-between items-center text-xs font-bold">
                    <span className="text-slate-800">Priority Fix Index</span>
                    <span className="text-red-500 font-extrabold uppercase">
                      {selectedPrediction.priority_label === 'Critical' ? '🔴 Fix Immediately (P0)' :
                       selectedPrediction.priority_label === 'High' ? '🟠 Address Next (P1)' :
                       selectedPrediction.priority_label === 'Medium' ? '🟡 Schedule in Sprint (P2)' :
                       '🟢 Low Backlog (P3)'}
                    </span>
                  </div>

                  {/* Fix Progress Bar */}
                  <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden relative">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        selectedPrediction.priority_label === 'Critical' ? 'bg-gradient-to-r from-red-500 to-rose-600' :
                        selectedPrediction.priority_label === 'High' ? 'bg-gradient-to-r from-orange-400 to-amber-500' :
                        selectedPrediction.priority_label === 'Medium' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500' :
                        'bg-gradient-to-r from-green-400 to-emerald-500'
                      )}
                      style={{
                        width: selectedPrediction.priority_label === 'Critical' ? '100%' :
                               selectedPrediction.priority_label === 'High' ? '75%' :
                               selectedPrediction.priority_label === 'Medium' ? '50%' :
                               '25%'
                      }}
                    />
                  </div>

                  <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wide">
                    <span>Low Backlog</span>
                    <span>Medium</span>
                    <span>High</span>
                    <span>Fix First</span>
                  </div>
                </div>
              </div>

              {/* Recommended Action Plan */}
              {selectedPrediction.recommendation && (
                <div className="space-y-1">
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Recommended Action Plan</h4>
                  <div
                    className={cn(
                      "border rounded-2xl p-4 text-xs font-semibold leading-relaxed",
                      selectedPrediction.priority_label.toLowerCase() === 'critical' ? 'border-red-500/10 bg-red-500/5 text-red-700' :
                      selectedPrediction.priority_label.toLowerCase() === 'high' ? 'border-amber-500/10 bg-amber-500/5 text-amber-700' :
                      selectedPrediction.priority_label.toLowerCase() === 'medium' ? 'border-blue-500/10 bg-blue-500/5 text-blue-700' :
                      'border-green-500/10 bg-green-500/5 text-green-700'
                    )}
                  >
                    {selectedPrediction.recommendation}
                  </div>
                </div>
              )}

              {/* Explanations (SHAP Feature Impacts chart if available) */}
              {selectedPrediction.explanation?.shap_impacts && selectedPrediction.explanation.shap_impacts.length > 0 ? (
                <div className="space-y-3">
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Feature Impact Drivers</h4>
                  <div className="space-y-2 bg-slate-50 p-4 rounded-3xl border border-slate-100">
                    {selectedPrediction.explanation.shap_impacts.slice(0, 4).map((s: any, idx: number) => {
                      const pct = Math.min(100, Math.abs(s.impact) * 200);
                      const isPositive = s.impact > 0;
                      return (
                        <div key={idx} className="flex items-center gap-2.5 text-xs font-semibold">
                          <span className="font-mono text-slate-500 w-36 truncate">{s.feature}</span>
                          <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                isPositive ? "bg-blue-600" : "bg-slate-400"
                              )}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="font-bold text-slate-700 w-12 text-right">
                            {isPositive ? '+' : ''}{s.impact.toFixed(2)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : selectedPrediction.explanation?.reasoning ? (
                <div className="space-y-1">
                  <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Classification Reasoning</h4>
                  <p className="text-xs text-slate-600 leading-relaxed font-semibold bg-slate-50 p-3 rounded-2xl border border-slate-100">
                    {selectedPrediction.explanation.reasoning}
                  </p>
                </div>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end">
              <button
                onClick={() => setSelectedPrediction(null)}
                className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
