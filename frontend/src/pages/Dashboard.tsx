import React, { useState } from 'react';
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
  X,
  Search,
  Filter,
  CheckCircle2,
  Code2
} from 'lucide-react';
import { predictorAPI } from '../services/api';
import { ConfidenceTrend } from '../components/Charts/ConfidenceTrend';
import { ClassDistribution } from '../components/Charts/ClassDistribution';
import { PriorityBadge } from '../components/PriorityBadge';
import { formatRelativeTime, formatConfidence, cn } from '../lib/utils';
import { usePredictionStore } from '../store/predictionStore';
import { Link } from 'react-router-dom';

export const Dashboard: React.FC = () => {
  const { predictions, getDashboardStats, getDashboardHistory } = usePredictionStore();
  const [selectedPrediction, setSelectedPrediction] = useState<any | null>(null);
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | 'HIGH' | 'MEDIUM'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch real prediction history from backend DB if store is empty
  const { data: dbHistoryData, isLoading: isLoadingDb } = useQuery({
    queryKey: ['prediction-history-dashboard'],
    queryFn: () => predictorAPI.getHistory(100),
    enabled: predictions.length === 0,
  });

  // Calculate live stats directly from real analyzed predictions
  const stats = getDashboardStats();
  const history = getDashboardHistory();

  // Combine store predictions or fallback to database query history
  const allBugItems = React.useMemo(() => {
    if (predictions && predictions.length > 0) {
      return predictions.map(p => ({
        id: p.prediction_id,
        bug_id: p.prediction_id,
        title: p.input?.title || p.title || 'Untitled Bug',
        description: p.input?.description || p.description || '',
        module: p.input?.module || p.module || 'General',
        priority: (p.priority_label || p.prediction?.priority || 'MEDIUM').toUpperCase(),
        confidence: (p.confidence_score ?? p.prediction?.confidence ?? 0.85) * 100,
        time: p.timestamp || new Date().toISOString(),
        raw: p
      }));
    }

    if (dbHistoryData && dbHistoryData.history && dbHistoryData.history.length > 0) {
      return dbHistoryData.history.map((h: any) => ({
        id: h.bug_id,
        bug_id: h.bug_id,
        title: h.title || 'Untitled Bug',
        description: h.description || '',
        module: h.component || 'General',
        priority: (h.predicted_priority || h.priority || 'MEDIUM').toUpperCase(),
        confidence: (h.confidence || 0.85) * (h.confidence <= 1 ? 100 : 1),
        time: h.created_at || new Date().toISOString(),
        raw: h
      }));
    }

    return [];
  }, [predictions, dbHistoryData]);

  // Compute dynamic counts directly from analyzed bugs
  const dynamicCounts = React.useMemo(() => {
    let critical = 0;
    let high = 0;
    let medium = 0;
    allBugItems.forEach(item => {
      const prio = item.priority;
      if (prio === 'CRITICAL') critical++;
      else if (prio === 'HIGH') high++;
      else if (prio === 'MEDIUM' || prio === 'LOW') medium++;
    });
    return {
      total: allBugItems.length,
      critical,
      high,
      medium
    };
  }, [allBugItems]);

  // Filter & Search Bug Items
  const filteredBugs = React.useMemo(() => {
    return allBugItems.filter(bug => {
      const matchesFilter = activeFilter === 'ALL' || bug.priority === activeFilter;
      const matchesSearch = !searchQuery.trim() || 
        bug.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bug.bug_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bug.module.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [allBugItems, activeFilter, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Dashboard Header */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 shadow-xl text-white flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-500/30 flex items-center gap-1">
              <Activity size={12} className="text-indigo-400" />
              Dynamic Prediction Console
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/30">
              Real Analyzed Telemetry
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Smart Bug Analyzer Dashboard</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time classification counts, dynamic priority lists, and automated rectification solutions.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/prediction"
            className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2"
          >
            <Zap size={16} />
            New Bug Analysis
          </Link>
        </div>
      </div>

      {/* DYNAMIC PRIORITY COUNTS CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* TOTAL BUGS */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Bugs</span>
            <Bug size={18} className="text-slate-600" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-slate-900">{dynamicCounts.total}</span>
            <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Combined multi-source records</p>
          </div>
        </div>

        {/* CRITICAL BUGS */}
        <div className="bg-red-50/60 p-5 rounded-2xl border border-red-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-red-800 uppercase tracking-wider">Critical Bugs</span>
            <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse"></span>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-red-950">{dynamicCounts.critical}</span>
            <p className="text-[11px] text-red-700 mt-0.5 font-medium">Outages & severe failures</p>
          </div>
        </div>

        {/* HIGH BUGS */}
        <div className="bg-orange-50/60 p-5 rounded-2xl border border-orange-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-orange-800 uppercase tracking-wider">High Bugs</span>
            <AlertTriangle size={18} className="text-orange-600" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-orange-950">{dynamicCounts.high}</span>
            <p className="text-[11px] text-orange-700 mt-0.5 font-medium">Major feature disruptions</p>
          </div>
        </div>

        {/* MEDIUM BUGS */}
        <div className="bg-yellow-50/60 p-5 rounded-2xl border border-yellow-200 shadow-sm flex flex-col justify-between">
          <div className="flex justify-between items-start">
            <span className="text-xs font-bold text-yellow-800 uppercase tracking-wider">Medium Bugs</span>
            <ShieldAlert size={18} className="text-yellow-600" />
          </div>
          <div className="mt-3">
            <span className="text-3xl font-extrabold text-yellow-950">{dynamicCounts.medium}</span>
            <p className="text-[11px] text-yellow-700 mt-0.5 font-medium">Limited functional issues</p>
          </div>
        </div>
      </div>

      {/* MAIN DASHBOARD SECTION */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Dynamic Bugs List & Filter Tabs (8 Cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900">Analyzed Bug Priority Directory</h3>
                <p className="text-xs text-slate-500">Live priority classifications from trained SmartBugPriority model</p>
              </div>

              {/* Search input */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search bug title, ID, component..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs w-64 focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* PRIORITY FILTER TABS (All, CRITICAL, HIGH, MEDIUM) */}
            <div className="flex gap-2">
              {[
                { key: 'ALL', label: `All (${dynamicCounts.total})` },
                { key: 'CRITICAL', label: `CRITICAL (${dynamicCounts.critical})` },
                { key: 'HIGH', label: `HIGH (${dynamicCounts.high})` },
                { key: 'MEDIUM', label: `MEDIUM (${dynamicCounts.medium})` },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => setActiveFilter(tab.key as any)}
                  className={cn(
                    "px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all border",
                    activeFilter === tab.key
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-sm"
                      : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* BUGS LIST TABLE / CARDS */}
            {filteredBugs.length > 0 ? (
              <div className="space-y-2.5 pt-1">
                {filteredBugs.map((bug) => (
                  <div
                    key={bug.id}
                    onClick={() => setSelectedPrediction(bug.raw)}
                    className="p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer bg-slate-50/40 flex items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-9 w-9 rounded-xl bg-indigo-50 flex items-center justify-center border border-indigo-100 shrink-0">
                        <Bug size={18} className="text-indigo-600" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-indigo-600">{bug.bug_id}</span>
                          <span className="text-xs text-slate-400">•</span>
                          <span className="text-xs font-bold text-slate-700">{bug.module}</span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900 truncate mt-0.5">{bug.title}</h4>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Confidence</span>
                        <span className="text-xs font-bold text-slate-800">{bug.confidence.toFixed(0)}%</span>
                      </div>
                      <span className={cn(
                        "text-xs font-extrabold px-3 py-1 rounded-lg border uppercase tracking-wider",
                        bug.priority === 'CRITICAL' && "bg-purple-100 text-purple-900 border-purple-300",
                        bug.priority === 'HIGH' && "bg-red-100 text-red-800 border-red-300",
                        bug.priority === 'MEDIUM' && "bg-yellow-100 text-yellow-800 border-yellow-300",
                        bug.priority === 'LOW' && "bg-green-100 text-green-800 border-green-300",
                        bug.priority === 'REVIEW REQUIRED' && "bg-amber-100 text-amber-900 border-amber-400"
                      )}>
                        {bug.priority}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <Bug size={36} className="mx-auto text-slate-400" />
                <h4 className="text-sm font-bold text-slate-700">No Bugs Found</h4>
                <p className="text-xs text-slate-500 max-w-xs mx-auto">
                  No bug predictions match the selected filter category ({activeFilter}).
                </p>
              </div>
            )}
          </div>

          {/* Confidence Score Trends Chart */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900 mb-1">Confidence Score Trends</h3>
            <p className="text-xs text-slate-500 mb-4">Historical confidence metrics across latest predictions</p>
            <ConfidenceTrend data={history || { timestamps: ['09:00', '10:00'], confidences: [0.85, 0.88] }} />
          </div>
        </div>

        {/* Right Column: Class Distribution & Quick Actions (4 Cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-900">Priority Distribution</h3>
            <ClassDistribution
              data={stats || { critical: dynamicCounts.critical, high: dynamicCounts.high, medium: dynamicCounts.medium, low: 0, total_predictions: dynamicCounts.total, avg_confidence: 0.85, service_status: 'healthy' }}
            />
          </div>

          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white rounded-2xl p-5 shadow-lg space-y-3">
            <h3 className="text-sm font-bold flex items-center gap-1.5">
              <Zap size={16} className="text-indigo-400" />
              Quick Actions
            </h3>
            <p className="text-xs text-indigo-200 leading-relaxed">
              Run manual multi-source bug analysis or upload bulk datasets to populate the dashboard telemetries.
            </p>
            <div className="pt-2 flex flex-col gap-2">
              <Link
                to="/prediction"
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-3 rounded-xl text-xs transition-all text-center"
              >
                Analyze Bug Details / Files / Screenshot →
              </Link>
              <button
                onClick={() => usePredictionStore.getState().clearStore()}
                className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold py-2 px-3 rounded-xl text-xs transition-all text-center border border-slate-700"
              >
                Clear Local Telemetry History
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Details & Rectification Modal */}
      {selectedPrediction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-900 text-white flex justify-between items-center">
              <div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider">BUG RECTIFICATION & FIX</span>
                <h3 className="text-base font-bold text-white mt-0.5">
                  {selectedPrediction.input?.title || selectedPrediction.title || selectedPrediction.bug_id || 'Bug Detail'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedPrediction(null)}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Predicted Priority</span>
                  <span className="font-extrabold text-sm text-indigo-600">{selectedPrediction.priority_label || selectedPrediction.priority || 'MEDIUM'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Component</span>
                  <span className="font-bold text-slate-800">{selectedPrediction.input?.module || selectedPrediction.component || 'General'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold uppercase text-[10px] block">Confidence</span>
                  <span className="font-bold text-slate-800">{((selectedPrediction.confidence_score ?? selectedPrediction.confidence ?? 0.85) * (selectedPrediction.confidence_score <= 1 ? 100 : 1)).toFixed(0)}%</span>
                </div>
              </div>

              {selectedPrediction.description && (
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <span className="font-bold text-slate-700 uppercase text-[10px] block mb-1">Description</span>
                  <p className="text-slate-600 leading-relaxed">{selectedPrediction.description}</p>
                </div>
              )}

              {selectedPrediction.recommendation && (
                <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950">
                  <span className="font-bold text-emerald-900 uppercase text-[10px] block mb-1 flex items-center gap-1">
                    <CheckCircle2 size={14} className="text-emerald-600" />
                    Recommended Fix
                  </span>
                  <p className="font-semibold leading-relaxed">
                    {typeof selectedPrediction.recommendation === 'string' ? selectedPrediction.recommendation : JSON.stringify(selectedPrediction.recommendation)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
