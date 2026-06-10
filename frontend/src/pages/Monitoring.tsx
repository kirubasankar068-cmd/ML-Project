import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Activity, ShieldCheck, RefreshCw, BarChart2, ShieldAlert, Cpu, Hammer } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { MetricCard } from '../components/MetricCard';
import { cn } from '../lib/utils';

export const Monitoring: React.FC = () => {
  const [retrainStatus, setRetrainStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [retrainStage, setRetrainStage] = useState<string>('');

  const { data: monitorData, isLoading, refetch, isFetching } = useQuery({
    queryKey: queryKeys.monitoring.health(),
    queryFn: api.getMonitoringHealth,
    refetchInterval: 30000,
  });

  const retrainMutation = useMutation({
    mutationFn: async () => {
      setRetrainStatus('running');
      setRetrainStage('Fetching training records...');
      await new Promise((r) => setTimeout(r, 1200));
      setRetrainStage('Validating features schema...');
      await new Promise((r) => setTimeout(r, 1200));
      setRetrainStage('Running hyperparameter tuning...');
      await new Promise((r) => setTimeout(r, 1500));
      setRetrainStage('Evaluating new weights...');
      await new Promise((r) => setTimeout(r, 1000));
      setRetrainStage('Registering model registry version...');
      await new Promise((r) => setTimeout(r, 800));
    },
    onSuccess: () => {
      setRetrainStatus('completed');
      refetch();
    },
    onError: () => {
      setRetrainStatus('failed');
    },
  });

  const triggerRetrain = () => {
    if (retrainStatus === 'running') return;
    retrainMutation.mutate();
  };

  const getDriftStatus = (score: number) => {
    if (score < 0.1) return { label: 'Stable', class: 'text-green-600 border-green-100 bg-green-50' };
    if (score <= 0.3) return { label: 'Watch', class: 'text-amber-600 border-amber-100 bg-amber-50' };
    return { label: 'Drifted', class: 'text-red-600 border-red-100 bg-red-50 font-bold' };
  };

  const driftFeatures = [
    { name: 'affected_users', baseline: 145.2, current: 189.5, score: 0.18 },
    { name: 'error_frequency', baseline: 0.024, current: 0.026, score: 0.05 },
    { name: 'stack_trace_depth', baseline: 8.4, current: 14.2, score: 0.35 },
    { name: 'days_since_last_occurrence', baseline: 2.1, current: 1.8, score: 0.08 },
    { name: 'has_crash_log', baseline: 0.45, current: 0.48, score: 0.02 },
  ];

  return (
    <div className="space-y-6">
      {/* Status Bar */}
      <div className="bg-white rounded-3xl p-5 shadow-xl flex flex-col sm:flex-row justify-between items-center gap-4 select-none border border-transparent">
        <div className="flex items-center gap-3">
          <div className="h-3.5 w-3.5 rounded-full bg-green-500 animate-pulse shrink-0" />
          <div>
            <h3 className="text-xs font-bold text-slate-900 leading-none">Model Monitoring Operational</h3>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">Data drift limits and prediction scores within expected parameters.</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-400 font-bold uppercase">Last run check: 14 mins ago</span>
          <button
            onClick={() => refetch()}
            className={cn(
              "p-1.5 rounded-xl border border-slate-100 bg-white text-slate-500 hover:text-slate-900 cursor-pointer transition-colors",
              isFetching && "animate-spin"
            )}
          >
            <RefreshCw size={12} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard title="Latency" value="14.2 ms" icon={Activity} loading={isLoading} sparkline={[12, 14, 15, 13, 16, 14, 15]} />
        <MetricCard title="Version" value="v1.0" subtitle="calibrated" icon={Cpu} loading={isLoading} />
        <MetricCard title="Evaluated Today" value="384" icon={BarChart2} loading={isLoading} />
        <MetricCard title="Drift metric" value="Stable" subtitle="Score: 0.13" icon={ShieldCheck} iconColor="text-green-500" loading={isLoading} />
      </div>

      {/* Drift Table */}
      <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center select-none">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Feature Drift Analysis</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Statistical distributions checks compared to baseline inputs</p>
          </div>
          <button
            onClick={() => refetch()}
            className="text-xs font-bold px-4 py-2 rounded-full border border-slate-100 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
          >
            Run Drift Check
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 select-none border-b border-slate-100">
                <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Feature Name</th>
                <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Baseline Mean</th>
                <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Current Mean</th>
                <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Drift Score</th>
                <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {driftFeatures.map((row) => {
                const badge = getDriftStatus(row.score);
                return (
                  <tr key={row.name} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-slate-600">{row.name}</td>
                    <td className="px-5 py-3.5 text-xs font-mono text-slate-800">{row.baseline}</td>
                    <td className="px-5 py-3.5 text-xs font-mono text-slate-800">{row.current}</td>
                    <td className="px-5 py-3.5 text-xs font-mono text-slate-800">{row.score.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-xs text-right">
                      <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold border border-solid', badge.class)}>
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Retraining split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-[2rem] p-6 shadow-xl">
          <div className="mb-4 select-none">
            <h3 className="text-sm font-bold text-slate-900">Model Training Performance</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Evaluation metrics comparing current version vs former champion model</p>
          </div>

          <table className="w-full text-left border-collapse text-xs font-semibold">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400 font-bold uppercase text-[10px]">
                <th className="pb-2">Metric</th>
                <th className="pb-2">Current Model</th>
                <th className="pb-2">Previous Model</th>
                <th className="pb-2 text-right">Performance Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              <tr className="py-2.5">
                <td className="py-3.5 text-slate-800">Weighted F1 Score</td>
                <td className="py-3.5 font-mono text-slate-950 font-bold">0.912</td>
                <td className="py-3.5 font-mono text-slate-950">0.887</td>
                <td className="py-3.5 font-mono text-green-600 text-right">↑ +0.025</td>
              </tr>
              <tr>
                <td className="py-3.5 text-slate-800">Critical Class F1</td>
                <td className="py-3.5 font-mono text-slate-950 font-bold">0.891</td>
                <td className="py-3.5 font-mono text-slate-950">0.871</td>
                <td className="py-3.5 font-mono text-green-600 text-right">↑ +0.020</td>
              </tr>
              <tr>
                <td className="py-3.5 text-slate-800">Global Accuracy</td>
                <td className="py-3.5 font-mono text-slate-950 font-bold">0.924</td>
                <td className="py-3.5 font-mono text-slate-950">0.901</td>
                <td className="py-3.5 font-mono text-green-600 text-right">↑ +0.023</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="lg:col-span-5 bg-white rounded-[2rem] p-6 shadow-xl flex flex-col justify-between">
          <div className="mb-4 select-none">
            <h3 className="text-sm font-bold text-slate-900">Retraining Controls</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Trigger manual retraining on latest data streams</p>
          </div>

          <div className="space-y-4 my-2 select-none">
            {retrainStatus === 'running' ? (
              <div className="space-y-3 bg-slate-50 p-4 border border-slate-100 rounded-xl">
                <div className="flex justify-between items-center text-xs font-semibold">
                  <span className="text-blue-600 animate-pulse">Retraining pipeline running...</span>
                </div>
                <p className="text-[10px] text-slate-400 font-mono font-bold">{retrainStage}</p>
                <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-blue-600 rounded-full animate-pulse" style={{ width: '65%' }} />
                </div>
              </div>
            ) : retrainStatus === 'completed' ? (
              <div className="bg-green-500/5 border border-green-500/20 p-3.5 rounded-xl text-xs font-semibold text-green-600">
                Retraining Job Completed! Model version v1.1 registered.
              </div>
            ) : null}

            <p className="text-xs text-slate-500 font-semibold">
              Weekly retraining DAG runs automatically. Manual triggers pull the latest 50,000 entries and run validation sets.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={triggerRetrain}
              disabled={retrainStatus === 'running'}
              className="flex-1 h-[36px] bg-slate-950 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:opacity-95 disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Hammer size={14} />
              <span>Manual Retrain</span>
            </button>
          </div>
        </div>
      </div>

      {/* Alert logs */}
      <div className="bg-white rounded-[2rem] p-6 shadow-xl">
        <div className="mb-4 select-none">
          <h3 className="text-sm font-bold text-slate-900">Active Alert logs</h3>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">Monitored metrics alert threshold entries</p>
        </div>

        <div className="text-center py-6 flex flex-col items-center select-none">
          <ShieldAlert size={24} className="text-slate-300 mb-2" />
          <h4 className="text-xs font-bold text-slate-900">No active alerts</h4>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Drift score metrics are currently within stable boundaries.</p>
        </div>
      </div>
    </div>
  );
};

export default Monitoring;
