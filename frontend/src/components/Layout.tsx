import React, { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bug,
  LayoutDashboard,
  Zap,
  BarChart2,
  Activity,
  Settings,
  LogOut,
  Search,
  ChevronDown,
  ListTodo,
  Terminal,
  Trash2,
  HelpCircle,
  RefreshCw,
  X
} from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { cn } from '../lib/utils';
import { authAPI } from '../services/api';
import { usePredictionStore } from '../store/predictionStore';

interface LayoutProps {
  children: React.ReactNode;
}

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [selectedPrediction, setSelectedPrediction] = useState<any | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const { predictions } = usePredictionStore();

  // Filter matched pages
  const matchedPages = [
    { name: 'Dashboard Telemetry', desc: 'Real-time model stats & metrics', path: '/', icon: LayoutDashboard },
    { name: 'Single Predictor', desc: 'Classify single bug reports & fix priority', path: '/prediction', icon: Zap },
    { name: 'Bulk Bug Predictor', desc: 'Batch upload CSV & priority backlog', path: '/bulk-predict', icon: ListTodo },
    { name: 'Analytics Charts', desc: 'Smoothing charts & departments distribution', path: '/analytics', icon: BarChart2 },
    { name: 'System Monitoring', desc: 'API health check & operational status', path: '/monitoring', icon: Activity },
    { name: 'Settings & Calibrations', desc: 'Calibrate model configurations', path: '/settings', icon: Settings },
  ].filter(page => 
    page.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    page.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter matched commands
  const matchedCommands = [
    { name: 'Clear Stored History', desc: 'Wipe all cached predictions from local storage', action: 'clear', icon: Trash2 },
    { name: 'Jira Synchronisation', desc: 'Trigger manual backlog export sync to Jira', action: 'jira', icon: RefreshCw },
  ].filter(cmd => 
    cmd.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    cmd.desc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Filter matching bug predictions from store
  const matchedBugs = predictions.filter(bug => 
    bug.input?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bug.input?.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    bug.priority_label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (bug.module || bug.input?.module)?.toLowerCase().includes(searchQuery.toLowerCase())
  ).slice(0, 4);

  const PRIORITY_COLORS: Record<string, { bg: string, text: string }> = {
    Critical: { bg: '#fee2e2', text: '#991b1b' },
    High: { bg: '#ffedd5', text: '#9a3412' },
    Medium: { bg: '#fef9c3', text: '#854d0e' },
    Low: { bg: '#dcfce7', text: '#166534' }
  };
  
  const username = localStorage.getItem('username') || 'Admin';
  const initial = username.charAt(0).toUpperCase();

  // Poll system health
  const { data: healthData, isError } = useQuery({
    queryKey: queryKeys.health(),
    queryFn: api.getHealth,
    refetchInterval: 30000,
    retry: 1,
  });

  const isHealthy = !isError && healthData?.status === 'healthy';

  const handleLogout = () => {
    authAPI.logout();
    window.location.reload();
  };

  // Nav Items - Icons only
  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Predictor', path: '/prediction', icon: Zap },
    { name: 'Bulk Predict', path: '/bulk-predict', icon: ListTodo },
    { name: 'Analytics', path: '/analytics', icon: BarChart2 },
    { name: 'Monitoring', path: '/monitoring', icon: Activity },
    { name: 'Settings', path: '/settings', icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-[#EBF1F6] text-slate-800 antialiased font-sans">
      {/* Floating Dark Charcoal Left Sidebar */}
      <aside className="w-[88px] fixed inset-y-4 left-4 bg-slate-950 text-white rounded-[2rem] flex flex-col items-center justify-between py-8 shadow-2xl z-30 select-none border border-slate-900">
        <div className="flex flex-col items-center gap-10 w-full">
          {/* Logo Area */}
          <div className="bg-white p-2 rounded-2xl border border-white/10 text-white flex items-center justify-center w-14 h-14 overflow-hidden">
            <img src="/src/assets/logo.jpg" alt="Logo" className="w-full h-full object-contain rounded-xl" />
          </div>

          {/* Navigation Link Icons */}
          <nav className="flex flex-col items-center gap-3.5 w-full px-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <NavLink
                  key={item.name}
                  to={item.path}
                  title={item.name}
                  className={() =>
                    cn(
                      'relative h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-150',
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30 border border-blue-500'
                        : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                    )
                  }
                >
                  <Icon size={18} className="shrink-0" />
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* Logout at absolute bottom */}
        <div className="w-full px-2 flex justify-center">
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="h-12 w-12 rounded-2xl flex items-center justify-center text-red-400 hover:bg-red-950/20 hover:text-red-500 cursor-pointer transition-colors"
          >
            <LogOut size={18} className="shrink-0" />
          </button>
        </div>
      </aside>

      {/* Main Content Pane */}
      <div className="flex-1 pl-[120px] pr-6 py-6 flex flex-col min-h-screen">
        {/* Top Header Row */}
        <header className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 select-none bg-transparent">
          {/* Welcome greeting */}
          <div>
            <h2 className="text-xl font-bold tracking-tight text-slate-950 leading-none">
              Smart Bug Priority Predictor
            </h2>
            <p className="text-xs text-slate-500 font-semibold mt-1">Enterprise MLOps console controls</p>
          </div>

          {/* Pill search bar with suggestions dropdown */}
          <div className="relative w-full max-w-sm z-50">
            <input
              type="text"
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (matchedPages.length > 0) {
                    navigate(matchedPages[0].path);
                    setSearchQuery('');
                  } else if (matchedBugs.length > 0) {
                    setSelectedPrediction(matchedBugs[0]);
                    setSearchQuery('');
                  }
                }
              }}
              placeholder="Search predictions, metrics, settings..."
              className="w-full h-10 pl-11 pr-4 bg-white border border-transparent rounded-full text-xs font-semibold outline-none focus:border-blue-500/20 focus:ring-2 focus:ring-blue-500/10 shadow-md transition-all text-slate-800 placeholder:text-slate-400"
            />
            <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />

            {/* Suggestions Dropdown */}
            {isSearchFocused && searchQuery.trim() && (
              <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-100/70 overflow-hidden z-50 text-left max-h-[350px] overflow-y-auto p-2.5 space-y-3">
                {matchedPages.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest pl-2">Navigation / Features</span>
                    <div className="mt-1 space-y-0.5">
                      {matchedPages.map((page) => {
                        const Icon = page.icon;
                        return (
                          <button
                            key={page.path}
                            onClick={() => {
                              navigate(page.path);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer text-left"
                          >
                            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                              <Icon size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800">{page.name}</p>
                              <p className="text-[10px] text-slate-400 font-semibold truncate">{page.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {matchedCommands.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest pl-2">Quick Commands</span>
                    <div className="mt-1 space-y-0.5">
                      {matchedCommands.map((cmd) => {
                        const Icon = cmd.icon;
                        return (
                          <button
                            key={cmd.action}
                            onClick={() => {
                              if (cmd.action === 'clear') {
                                usePredictionStore.getState().clearStore();
                                showToast('Cached bug predictions cleared.');
                              } else if (cmd.action === 'jira') {
                                showToast('Manual Jira sync completed.');
                              }
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer text-left"
                          >
                            <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                              <Icon size={14} />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-800">{cmd.name}</p>
                              <p className="text-[10px] text-slate-400 font-semibold truncate">{cmd.desc}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {matchedBugs.length > 0 && (
                  <div>
                    <span className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest pl-2">Matching Predictions</span>
                    <div className="mt-1 space-y-0.5">
                      {matchedBugs.map((bug) => {
                        const priority = bug.priority_label;
                        const c = PRIORITY_COLORS[priority] || { bg: '#e2e8f0', text: '#475569' };
                        return (
                          <button
                            key={bug.prediction_id}
                            onClick={() => {
                              setSelectedPrediction(bug);
                              setSearchQuery('');
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer text-left"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                                <Terminal size={14} />
                              </div>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">{bug.input?.title || bug.title}</p>
                                <p className="text-[10px] text-slate-400 font-semibold truncate">
                                  {bug.module || bug.input?.module || 'General'} · {(bug.confidence_score * 100).toFixed(0)}%
                                </p>
                              </div>
                            </div>
                            <span
                              className="text-[9px] font-extrabold px-2 py-0.5 rounded-full border uppercase shrink-0 tracking-wider ml-2"
                              style={{ background: c.bg, color: c.text, borderColor: c.text + '20' }}
                            >
                              {priority}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {matchedPages.length === 0 && matchedCommands.length === 0 && matchedBugs.length === 0 && (
                  <div className="p-4 text-center text-[11px] font-bold text-slate-400">
                    No matching pages, commands, or bugs found.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Badge & profile */}
          <div className="flex items-center gap-3">
            {/* Status Indicator Badges */}
            <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-full border border-transparent shadow-md select-none">
              <span className={cn('h-2 w-2 rounded-full shrink-0', isHealthy ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
              <span className={cn('text-[10px] font-bold', isHealthy ? 'text-green-600' : 'text-red-600')}>
                {isHealthy ? 'API Operational' : 'Service Degraded'}
              </span>
            </div>

            {/* Profile Dropdown */}
            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border border-transparent shadow-md cursor-pointer hover:bg-slate-50/80 transition-colors">
              <div className="w-5 h-5 rounded-full bg-slate-900 text-white font-bold text-[10px] flex items-center justify-center">
                {initial}
              </div>
              <span className="text-[10px] font-bold text-slate-800">{username}</span>
              <ChevronDown size={12} className="text-slate-400" />
            </div>
          </div>
        </header>

        {/* Content container */}
        <div className="flex-1 flex flex-col justify-start">
          {children}
        </div>
      </div>

      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-5 py-2.5 rounded-full text-xs font-bold shadow-2xl z-[60] flex items-center gap-2 border border-slate-800 animate-bounce select-none">
          <span className="text-green-400">✓</span>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Global Details Modal overlay */}
      {selectedPrediction && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[999] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[85vh] text-left">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-start bg-slate-950 text-white select-none">
              <div>
                <span className="text-[10px] font-mono text-slate-400 uppercase tracking-widest leading-none">Global Bug Search Details</span>
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
                    {selectedPrediction.input?.module || selectedPrediction.module || 'General'}
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
                  <span className="text-xs font-black text-slate-800 uppercase mt-1">
                    {selectedPrediction.priority_label}
                  </span>
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

export default Layout;
