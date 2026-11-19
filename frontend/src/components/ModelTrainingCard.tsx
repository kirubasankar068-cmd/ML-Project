import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, CheckCircle2, AlertCircle, Play, Sliders, Database,
  TrendingUp, TrendingDown, Cpu, Activity, Clock, ShieldCheck
} from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/utils';

export interface ModelTrainingStatsData {
  auto_training_progress_pct: number;
  new_verified_samples: number;
  samples_needed_for_retrain: number;
  current_accuracy: number;
  accuracy_change: number;
  last_trained_at: string;
  total_samples_used: number;
  model_version: string;
  status: 'Idle' | 'Collecting data' | 'Training' | 'Completed' | 'Failed';
  auto_train_enabled: boolean;
}

export const ModelTrainingCard: React.FC = () => {
  const queryClient = useQueryClient();
  const [thresholdInput, setThresholdInput] = useState<number>(100);
  const [feedbackMessage, setFeedbackMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Fetch training stats from backend
  const { data: stats, isLoading, isError, refetch } = useQuery({
    queryKey: ['model-training-stats'],
    queryFn: async () => {
      const data = await api.getTrainingStats();
      if (data && data.samples_needed_for_retrain) {
        setThresholdInput(data.samples_needed_for_retrain);
      }
      return data as ModelTrainingStatsData;
    },
    refetchInterval: 5000 // auto-poll every 5 seconds to show progress updates
  });

  // Settings Mutation (Toggle Auto-train & threshold)
  const settingsMutation = useMutation({
    mutationFn: async (payload: { auto_train_enabled: boolean; samples_needed_for_retrain: number }) => {
      return await api.updateTrainingSettings(payload);
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['model-training-stats'], data);
      setFeedbackMessage({ text: 'Auto-training settings updated successfully.', type: 'success' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    },
    onError: (err: any) => {
      setFeedbackMessage({ text: err.message || 'Failed to update settings.', type: 'error' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  });

  // Train Now Mutation
  const trainNowMutation = useMutation({
    mutationFn: async () => {
      return await api.trainNow();
    },
    onSuccess: () => {
      refetch();
      setFeedbackMessage({ text: 'Background training job initiated!', type: 'success' });
      setTimeout(() => setFeedbackMessage(null), 3000);
    },
    onError: (err: any) => {
      setFeedbackMessage({ text: err.message || 'Failed to start retraining.', type: 'error' });
      setTimeout(() => setFeedbackMessage(null), 4000);
    }
  });

  const handleToggleAutoTrain = () => {
    if (!stats) return;
    settingsMutation.mutate({
      auto_train_enabled: !stats.auto_train_enabled,
      samples_needed_for_retrain: thresholdInput
    });
  };

  const handleSaveThreshold = () => {
    if (!stats) return;
    settingsMutation.mutate({
      auto_train_enabled: stats.auto_train_enabled,
      samples_needed_for_retrain: thresholdInput
    });
  };

  if (isLoading) {
    return (
      <div className="p-8 border border-slate-100 bg-slate-50/50 rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
        <RefreshCw className="animate-spin text-indigo-600" size={16} />
        <span>Loading model training metrics from backend...</span>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="p-6 border border-red-200 bg-red-50/50 rounded-2xl text-xs font-semibold text-red-600 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertCircle size={16} />
          <span>Failed to load training statistics. Ensure backend server is running.</span>
        </div>
        <button
          onClick={() => refetch()}
          className="px-3 py-1.5 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // Format date safely
  const formattedDate = stats.last_trained_at
    ? new Date(stats.last_trained_at).toLocaleString()
    : 'Not trained yet';

  const progressPct = Math.min(100, Math.max(0, stats.auto_training_progress_pct));
  const isTraining = stats.status === 'Training' || trainNowMutation.isPending;

  // Status Badge styling
  const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
    Idle: { bg: 'bg-slate-100', text: 'text-slate-700', dot: 'bg-slate-400' },
    'Collecting data': { bg: 'bg-blue-50 border border-blue-200', text: 'text-blue-700', dot: 'bg-blue-500 animate-pulse' },
    Training: { bg: 'bg-amber-50 border border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500 animate-spin' },
    Completed: { bg: 'bg-emerald-50 border border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    Failed: { bg: 'bg-rose-50 border border-rose-200', text: 'text-rose-700', dot: 'bg-rose-500' }
  };

  const statusStyle = statusStyles[stats.status] || statusStyles['Idle'];

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <div className="flex items-center gap-2">
            <Cpu className="text-indigo-600" size={18} />
            <h3 className="text-sm font-bold text-slate-900">Auto-Training Progress & Pipeline Stats</h3>
          </div>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Monitors new verified sample threshold and automatically retrains model in the background.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => trainNowMutation.mutate()}
            disabled={isTraining}
            className={cn(
              "h-9 px-4 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer shadow-sm",
              isTraining
                ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200"
                : "bg-slate-950 text-white hover:bg-indigo-600 shadow-slate-900/10"
            )}
          >
            <RefreshCw size={13} className={cn(isTraining && "animate-spin")} />
            <span>{isTraining ? 'Training...' : 'Train now'}</span>
          </button>
        </div>
      </div>

      {/* Alert / Feedback message */}
      {feedbackMessage && (
        <div className={cn(
          "p-3 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
          feedbackMessage.type === 'success'
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-rose-50 text-rose-700 border border-rose-200"
        )}>
          {feedbackMessage.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          <span>{feedbackMessage.text}</span>
        </div>
      )}

      {/* Main Stats Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Accuracy Card */}
        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Current Model Accuracy
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-xl font-extrabold text-slate-900">
              {stats.current_accuracy}%
            </span>
            <span className={cn(
              "text-xs font-extrabold flex items-center gap-0.5 px-2 py-0.5 rounded-full border",
              stats.accuracy_change >= 0
                ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                : "text-rose-600 bg-rose-50 border-rose-200"
            )}>
              {stats.accuracy_change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {stats.accuracy_change >= 0 ? `+${stats.accuracy_change}%` : `${stats.accuracy_change}%`}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Change since last training run
          </span>
        </div>

        {/* 2. Model Version */}
        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Active Model Version
          </span>
          <div className="text-base font-extrabold text-indigo-600 font-mono">
            {stats.model_version}
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Total Samples: <strong className="text-slate-700">{stats.total_samples_used.toLocaleString()}</strong>
          </span>
        </div>

        {/* 3. Last Trained */}
        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Last Trained Date/Time
          </span>
          <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400 shrink-0" />
            <span className="truncate">{formattedDate}</span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Continuous learning timestamp
          </span>
        </div>

        {/* 4. Pipeline Status */}
        <div className="p-4 bg-slate-50/70 border border-slate-100 rounded-2xl space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Pipeline Status
          </span>
          <div>
            <span className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold",
              statusStyle.bg,
              statusStyle.text
            )}>
              <span className={cn("w-2 h-2 rounded-full", statusStyle.dot)} />
              {stats.status}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-medium block">
            Auto-retrain trigger monitoring
          </span>
        </div>
      </div>

      {/* Progress Bar & Config Section */}
      <div className="p-5 border border-slate-100 bg-slate-50/50 rounded-2xl space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <span className="text-xs font-bold text-slate-900 block">
              Auto-Training Progress
            </span>
            <span className="text-[11px] text-slate-500 font-medium">
              Verified samples collected: <strong className="text-indigo-600 font-bold">{stats.new_verified_samples}</strong> / {stats.samples_needed_for_retrain} needed for next retrain
            </span>
          </div>
          <span className="text-sm font-extrabold text-indigo-600 font-mono">
            {progressPct.toFixed(1)}%
          </span>
        </div>

        {/* Smooth Animated Progress Bar */}
        <div className="w-full bg-slate-200 h-3 rounded-full overflow-hidden p-0.5">
          <div
            className="bg-gradient-to-r from-indigo-500 to-blue-600 h-full rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        {/* Configurable Controls */}
        <div className="pt-4 border-t border-slate-200/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Toggle Switch */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleAutoTrain}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                stats.auto_train_enabled ? "bg-indigo-600" : "bg-slate-300"
              )}
            >
              <span className={cn(
                "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ease-in-out",
                stats.auto_train_enabled ? "translate-x-5" : "translate-x-0"
              )} />
            </button>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-slate-900">
                Automatic Background Training
              </span>
              <span className="text-[10px] text-slate-400 font-medium">
                {stats.auto_train_enabled ? 'Auto-retrain is ON' : 'Auto-retrain is OFF (Manual only)'}
              </span>
            </div>
          </div>

          {/* Threshold Config Input */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
              Retrain Threshold:
            </span>
            <input
              type="number"
              min={1}
              max={10000}
              value={thresholdInput}
              onChange={(e) => setThresholdInput(parseInt(e.target.value) || 100)}
              className="w-24 h-9 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="button"
              onClick={handleSaveThreshold}
              className="h-9 px-3 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
