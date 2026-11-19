import React, { useState } from 'react';
import { Sliders, Key, Bell, Cpu, Link2, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

import { ModelTrainingCard } from '../components/ModelTrainingCard';

export const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'general' | 'api' | 'notifications' | 'model' | 'training' | 'integrations'>('general');
  const [orgName, setOrgName] = useState('Smart Bug Analyzer Org');
  const [refreshInterval, setRefreshInterval] = useState('30s');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [apiUrl, setApiUrl] = useState('http://localhost:8000');
  
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'failed'>('idle');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(0.85);

  const testConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    try {
      const response = await fetch(`${apiUrl}/health`);
      const data = await response.json();
      if (data.status === 'healthy') {
        setConnectionStatus('success');
      } else {
        setConnectionStatus('failed');
      }
    } catch {
      setConnectionStatus('failed');
    } finally {
      setTestingConnection(false);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: Sliders },
    { id: 'api', name: 'API Configuration', icon: Key },
    { id: 'notifications', name: 'Notifications', icon: Bell },
    { id: 'model', name: 'Model Parameter', icon: Cpu },
    { id: 'training', name: 'Model Training', icon: RefreshCw },
    { id: 'integrations', name: 'Integrations', icon: Link2 },
  ];


  return (
    <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden flex flex-col md:flex-row min-h-[520px] border border-transparent">
      {/* Sidebar Navigation */}
      <aside className="w-full md:w-56 border-r border-slate-100 bg-slate-50/50 p-4 flex flex-col gap-1 select-none shrink-0 rounded-l-[2rem]">
        <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider px-3 mb-3 block">
          Settings Panel
        </span>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-bold cursor-pointer transition-colors text-left",
                activeTab === tab.id
                  ? "bg-slate-950 text-white shadow-md"
                  : "text-slate-400 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <Icon size={14} className="shrink-0" />
              <span>{tab.name}</span>
            </button>
          );
        })}
      </aside>

      {/* Content panel */}
      <div className="flex-1 p-6 space-y-6">
        {/* Tab 1: General Options */}
        {activeTab === 'general' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">General Settings</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Customize global workspace settings and browser preferences</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Organization Name</label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full h-10 max-w-sm px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 text-slate-800"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Refresh Rate</label>
                <select
                  value={refreshInterval}
                  onChange={(e) => setRefreshInterval(e.target.value)}
                  className="w-full h-10 max-w-sm px-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
                >
                  {['10s', '30s', '1m', '5m'].map((rate) => (
                    <option key={rate} value={rate}>{rate}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <button className="h-9 px-5 bg-slate-950 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 transition-opacity cursor-pointer">
              Save Changes
            </button>
          </div>
        )}

        {/* Tab 2: API Config */}
        {activeTab === 'api' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">API Connection</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Configure endpoints to connect dashboard charts to data backend services</p>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">FastAPI Endpoint URL</label>
                <div className="flex gap-2 max-w-md">
                  <input
                    type="text"
                    value={apiUrl}
                    onChange={(e) => setApiUrl(e.target.value)}
                    className="flex-1 h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={testConnection}
                    disabled={testingConnection}
                    className="h-10 px-4 border border-slate-100 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 shrink-0 shadow-sm"
                  >
                    {testingConnection ? <RefreshCw size={12} className="animate-spin" /> : null}
                    <span>Test Connection</span>
                  </button>
                </div>
              </div>

              {connectionStatus === 'success' && (
                <div className="p-3 border border-green-500/10 bg-green-500/5 rounded-xl text-xs font-semibold text-green-600 flex items-center gap-2 max-w-md">
                  <Check size={14} className="shrink-0" />
                  <span>Connection Successful! Target endpoint is operational.</span>
                </div>
              )}

              {connectionStatus === 'failed' && (
                <div className="p-3 border border-red-500/10 bg-red-500/5 rounded-xl text-xs font-semibold text-red-600 flex items-center gap-2 max-w-md">
                  <AlertCircle size={14} className="shrink-0" />
                  <span>Connection Failed! Verify that the FastAPI backend server is running.</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Tab 3: Notifications */}
        {activeTab === 'notifications' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Webhook Notifications</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Toggle slack alerts, emails, and pager duty parameters</p>
            </div>

            <div className="space-y-3.5 divide-y divide-slate-100">
              {[
                { title: 'Drift Warning alerts', desc: 'Trigger Slack notification when features KS drift score exceeds 0.2' },
                { title: 'Model Retrain alerts', desc: 'Notify team via email when weekly retraining DAG is completed or failed' },
                { title: 'Jira Auto-priority logs', desc: 'Comment automatically with model prediction score on newly indexed Jira cards' },
                { title: 'Service Degradation metrics', desc: 'Alert DevOps engineers via PagerDuty when uvicorn threads are unresponsive' },
              ].map((row, idx) => (
                <div key={idx} className="flex justify-between items-center py-3.5 first:pt-0">
                  <div className="flex flex-col gap-0.5 pr-4">
                    <span className="text-xs font-bold text-slate-900">{row.title}</span>
                    <span className="text-[10px] text-slate-400 font-semibold">{row.desc}</span>
                  </div>
                  
                  <button className="relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent bg-blue-600 focus:outline-none">
                    <span className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white translate-x-4 transition duration-150 ease-in-out" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Model Params */}
        {activeTab === 'model' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Model Parameters</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Configure model confidence tolerances and hard override constraints</p>
            </div>

            <div className="space-y-4 max-w-md">
              <div className="space-y-2 select-none">
                <div className="flex justify-between text-xs font-bold">
                  <span>Confidence Threshold</span>
                  <span className="text-blue-600 font-extrabold">{(confidenceThreshold * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="1.0"
                  step="0.05"
                  value={confidenceThreshold}
                  onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                  className="w-full h-1 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                />
                <span className="block text-[10px] text-slate-400 font-semibold">
                  Below this threshold, predictions show a low confidence warning banner.
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Model Training */}
        {activeTab === 'training' && (
          <ModelTrainingCard />
        )}

        {/* Tab 5: integrations */}

        {activeTab === 'integrations' && (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Integrations Configuration</h3>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">Configure OAuth or webhook secrets credentials for 3rd party apps</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { id: 'jira', name: 'Jira Software', status: 'Connected', defaultKey: 'BUG', desc: 'Sync bug priorities directly in issue tracking lists' },
                { id: 'slack', name: 'Slack Alerts', status: 'Connected', defaultKey: '#mlops-alerts', desc: 'Broadcast drift logs to alerting channels' },
                { id: 'github', name: 'GitHub Integration', status: 'Connected', defaultKey: 'main', desc: 'Link branch commits to pipeline drift checks' },
                { id: 'pd', name: 'PagerDuty Integration', status: 'Connected', defaultKey: 'routing-key-1', desc: 'Trigger on-call pings during api degradation' },
              ].map((card) => (
                <IntegrationCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface IntegrationCardProps {
  card: {
    id: string;
    name: string;
    status: string;
    defaultKey: string;
    desc: string;
  };
}

const IntegrationCard: React.FC<IntegrationCardProps> = ({ card }) => {
  const [targetKey, setTargetKey] = useState(() => {
    const saved = localStorage.getItem(`integration_key_${card.id}`);
    return saved !== null ? saved : card.defaultKey;
  });
  const [status, setStatus] = useState(() => {
    const saved = localStorage.getItem(`integration_status_${card.id}`);
    return saved !== null ? saved : card.status;
  });
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    setConnecting(true);
    // Simulate real network checking verification delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    localStorage.setItem(`integration_status_${card.id}`, 'Connected');
    setStatus('Connected');
    setConnecting(false);
  };

  const handleDisconnect = () => {
    setStatus('Configure');
    localStorage.setItem(`integration_status_${card.id}`, 'Configure');
  };

  return (
    <div className="border border-slate-100 rounded-2xl p-4 bg-slate-50/50 space-y-4 flex flex-col justify-between transition-all">
      <div className="space-y-1">
        <div className="flex justify-between items-center text-xs font-bold text-slate-900">
          <span>{card.name}</span>
          <span className={cn(
            'text-[10px] px-2 py-0.5 rounded-full border border-solid font-bold',
            connecting ? 'text-blue-600 bg-blue-500/5 border-blue-500/10 animate-pulse' :
            status === 'Connected' ? 'text-green-600 bg-green-500/5 border-green-500/10' : 'text-slate-400 border-slate-200 bg-slate-100'
          )}>
            {connecting ? 'Connecting...' : status}
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-semibold">{card.desc}</p>
      </div>

      <div className="flex justify-between items-center text-[10px] font-mono text-slate-500 pt-2 border-t border-slate-100">
        <span>{targetKey !== 'None' ? `Target: ${targetKey}` : 'Not configured'}</span>
        <div>
          {status === 'Connected' ? (
            <button
              type="button"
              onClick={handleDisconnect}
              className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer"
            >
              Disconnect
            </button>
          ) : (
            <button
              type="button"
              disabled={connecting}
              onClick={handleConnect}
              className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer disabled:opacity-50"
            >
              Connect
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
