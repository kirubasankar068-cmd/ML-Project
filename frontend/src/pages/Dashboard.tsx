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
  Bug
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { ConfidenceTrend } from '../components/Charts/ConfidenceTrend';
import { ClassDistribution } from '../components/Charts/ClassDistribution';
import { PriorityBadge } from '../components/PriorityBadge';
import { formatRelativeTime, formatConfidence } from '../lib/utils';
import { usePredictionStore } from '../store/predictionStore';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { predictions, getDashboardStats, getDashboardHistory } = usePredictionStore();

  // Load stats synchronously from local store
  const stats = getDashboardStats();
  const history = getDashboardHistory();

  const getRecentTableRows = () => {
    if (predictions && predictions.length > 0) {
      return predictions.slice(0, 5).map((p) => ({
        id: p.prediction_id,
        module: p.module || p.input.module,
        priority: p.priority_label,
        confidence: p.confidence_score,
        time: p.timestamp || new Date().toISOString(),
      }));
    }

    return [
      { id: '1', module: 'Auth Service', priority: 'Critical', confidence: 0.96, time: new Date(Date.now() - 660000).toISOString() },
      { id: '2', module: 'Checkout Core', priority: 'High', confidence: 0.88, time: new Date(Date.now() - 1500000).toISOString() },
      { id: '3', module: 'Database Proxy', priority: 'Medium', confidence: 0.75, time: new Date(Date.now() - 3600000).toISOString() },
      { id: '4', module: 'API Gateway', priority: 'Low', confidence: 0.64, time: new Date(Date.now() - 7200000).toISOString() },
    ];
  };

  const recentItems = getRecentTableRows();

  return (
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
                <div key={item.id} className="flex items-center justify-between text-xs font-semibold">
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
                  <PriorityBadge label={item.priority as any} size="sm" variant="outline" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
