import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  Zap, HelpCircle, Copy, RefreshCw, FileText, Camera, ShieldAlert,
  CheckCircle2, AlertTriangle, ChevronRight, Terminal, Code2, Sparkles,
  Layers, Check, Bug, Eye, SlidersHorizontal
} from 'lucide-react';
import { predictorAPI } from '../services/api';
import { usePredictionStore } from '../store/predictionStore';
import { cn } from '../lib/utils';
import { mapSeverityScore } from '../utils/severityMapper';
import { RecommendedSolutionPanel } from '../components/RecommendedSolutionPanel';


interface SolutionData {
  has_sufficient_info: boolean;
  message: string;
  problem: string;
  root_cause: string;
  recommended_fix: string;
  steps_to_fix: string[];
  code_fix?: string | null;
  verification_steps: string[];
}

interface AnalysisResult {
  bug_id: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'REVIEW REQUIRED';
  confidence: number;
  reasons: string[];
  error_type: string;
  affected_component: string;
  impact: string;
  solution: SolutionData;
  ocr_text?: string;
  extracted_file_text?: string;
  model_version: string;
  created_at: string;
}

export const Predictor: React.FC = () => {
  const addPredictionToStore = usePredictionStore((state) => state.addPrediction);

  // Active Input Mode Tab
  const [activeTab, setActiveTab] = useState<'manual' | 'files' | 'screenshots'>('manual');

  // 1. Manual Form States
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [component, setComponent] = useState('Backend');
  const [bugType, setBugType] = useState('Bug');
  const [expectedResult, setExpectedResult] = useState('');
  const [actualResult, setActualResult] = useState('');
  const [stepsToReproduce, setStepsToReproduce] = useState('');
  const [affectedUsers, setAffectedUsers] = useState<number>(1);
  const [isReproducible, setIsReproducible] = useState(true);

  // 2. Uploaded Files & Flexible Column Mapping State
  const [files, setFiles] = useState<File[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({
    summary: '',
    description: '',
    severity: '',
    component: '',
    priority: ''
  });
  const [isScanningFile, setIsScanningFile] = useState(false);
  const [filePreviewText, setFilePreviewText] = useState<string>('');

  // 3. Uploaded Screenshots & OCR Preview State
  const [screenshots, setScreenshots] = useState<{ file: File; preview: string }[]>([]);
  const [ocrTextPreview, setOcrTextPreview] = useState<string>('');
  const [ocrWarning, setOcrWarning] = useState<string | null>(null);
  const [isScanningScreenshot, setIsScanningScreenshot] = useState(false);

  // Status Flow State
  const [processingStatus, setProcessingStatus] = useState<string>('');

  // Results & Verification State
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [verifiedPriority, setVerifiedPriority] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Helper for multi-step status flow
  const updateProgressFlow = async () => {
    setProcessingStatus('Uploading...');
    await new Promise(r => setTimeout(r, 200));
    setProcessingStatus('Extracting...');
    await new Promise(r => setTimeout(r, 250));
    if (screenshots.length > 0) {
      setProcessingStatus('OCR Processing...');
      await new Promise(r => setTimeout(r, 300));
    }
    setProcessingStatus('Analyzing...');
    await new Promise(r => setTimeout(r, 250));
    setProcessingStatus('Predicting...');
    await new Promise(r => setTimeout(r, 250));
    setProcessingStatus('Generating Solution...');
  };

  // Main Multi-Source Analysis Mutation
  const analyzeMutation = useMutation({
    mutationFn: async () => {
      setValidationError(null);

      // Validate title if no files or screenshots attached
      if (!title.trim() && files.length === 0 && screenshots.length === 0) {
        throw new Error('Please enter bug summary details or attach logs/screenshots.');
      }

      await updateProgressFlow();

      const formData = new FormData();
      const effTitle = title.trim() || (files.length > 0 ? `Uploaded File Bug (${files[0].name})` : 'Screenshot Error Bug');
      formData.append('summary', effTitle);
      formData.append('description', description);
      formData.append('severity', severity);
      formData.append('component', component);
      formData.append('bug_type', bugType);
      formData.append('expected_result', expectedResult);
      formData.append('actual_result', actualResult);
      formData.append('steps_to_reproduce', stepsToReproduce);
      formData.append('affected_users', affectedUsers.toString());
      formData.append('is_reproducible', isReproducible ? 'true' : 'false');

      if (Object.keys(columnMappings).some(k => columnMappings[k])) {
        formData.append('column_mapping', JSON.stringify(columnMappings));
      }

      files.forEach((file) => {
        formData.append('files', file);
      });

      screenshots.forEach((item) => {
        formData.append('screenshots', item.file);
      });

      const res = await predictorAPI.analyzeBugMultiSource(formData);
      return res as AnalysisResult;
    },
    onSuccess: (data) => {
      setProcessingStatus('Completed');
      setAnalysisResult(data);
      setVerifiedPriority(null);
      setVerificationMessage(null);

      addPredictionToStore(
        {
          priority_label: data.priority,
          confidence_score: data.confidence / 100,
          top_3_features: data.reasons,
          model_version: data.model_version,
          prediction_id: data.bug_id,
          timestamp: new Date().toLocaleTimeString()
        },
        {
          title: title || data.bug_id,
          department: 'Engineering',
          module: component,
          severity: severity as any,
          reporter_seniority: 'senior-engineer',
          environment: 'production',
          affected_users: affectedUsers,
          stack_trace_depth: 5,
          error_frequency: 0.01,
          days_since_last_occurrence: 1,
          has_crash_log: files.length > 0,
          linked_issues_count: 0,
          comment_count: 0,
          votes: 0,
          time_to_resolve_hours: 8
        }
      );
    },
    onError: (err: any) => {
      setProcessingStatus('');
      const msg = err?.response?.data?.detail || err.message || 'Analysis failed. Please try again.';
      setValidationError(msg);
    }
  });

  // Verification Mutation
  const verifyMutation = useMutation({
    mutationFn: async (actualPriority: string) => {
      if (!analysisResult) return;
      const res = await predictorAPI.verifyPrediction(analysisResult.bug_id, actualPriority, 'Admin');
      return res;
    },
    onSuccess: (res, actualPriority) => {
      setVerifiedPriority(actualPriority);
      const cl = res?.continuous_learning;
      if (cl?.triggered) {
        setVerificationMessage(`Verified as ${actualPriority}! Continuous learning auto-retraining triggered (${cl.retrain_result?.candidate_version || 'New version'}).`);
      } else {
        setVerificationMessage(`Verified as ${actualPriority}! Stored for continuous learning auto-retraining.`);
      }
    }
  });

  // File Upload & Preview Handler
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);
    
    const invalid = selected.find(f => f.size > 10 * 1024 * 1024);
    if (invalid) {
      setValidationError(`File '${invalid.name}' exceeds the 10 MB limit.`);
      return;
    }
    
    const updatedFiles = [...files, ...selected].slice(0, 10);
    setFiles(updatedFiles);

    // Auto-preview first structured dataset or log file for column detection
    if (selected.length > 0) {
      setIsScanningFile(true);
      try {
        const formData = new FormData();
        formData.append('file', selected[0]);
        const preview = await predictorAPI.scanFilePreview(formData);
        if (preview?.detected_columns && preview.detected_columns.length > 0) {
          setDetectedColumns(preview.detected_columns);
          // Auto-map matching columns
          const autoMap: Record<string, string> = { ...columnMappings };
          preview.detected_columns.forEach((col: string) => {
            const lower = col.toLowerCase();
            if (['title', 'summary', 'bug_title', 'name'].includes(lower)) autoMap.summary = col;
            if (['desc', 'description', 'bug_description', 'details'].includes(lower)) autoMap.description = col;
            if (['severity', 'sev', 'level'].includes(lower)) autoMap.severity = col;
            if (['component', 'module', 'system'].includes(lower)) autoMap.component = col;
            if (['priority', 'prio', 'target'].includes(lower)) autoMap.priority = col;
          });
          setColumnMappings(autoMap);
        }
        if (preview?.extracted_text) {
          setFilePreviewText(preview.extracted_text.slice(0, 800));
        }
      } catch (err) {
        console.warn('File preview scan warning:', err);
      } finally {
        setIsScanningFile(false);
      }
    }
  };

  // Screenshot Upload & OCR Preview Handler
  const handleScreenshotChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const selected = Array.from(e.target.files);

    const newScreenshots = selected.map(file => ({
      file,
      preview: URL.createObjectURL(file)
    }));

    const updatedScreenshots = [...screenshots, ...newScreenshots].slice(0, 5);
    setScreenshots(updatedScreenshots);

    // Run OCR scan preview on newly added screenshot
    if (selected.length > 0) {
      setIsScanningScreenshot(true);
      setOcrWarning(null);
      try {
        const formData = new FormData();
        formData.append('file', selected[0]);
        const ocrRes = await predictorAPI.scanScreenshotPreview(formData);
        if (ocrRes?.ocr_text && ocrRes.ocr_text.trim().length > 10) {
          setOcrTextPreview(ocrRes.ocr_text);
        } else {
          setOcrWarning("Unable to detect sufficient error information. Please upload a clearer screenshot or provide the error details manually.");
        }
      } catch (err) {
        setOcrWarning("Unable to detect sufficient error information. Please upload a clearer screenshot or provide the error details manually.");
      } finally {
        setIsScanningScreenshot(false);
      }
    }
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    if (files.length <= 1) {
      setDetectedColumns([]);
      setFilePreviewText('');
    }
  };

  const removeScreenshot = (index: number) => {
    setScreenshots(prev => prev.filter((_, i) => i !== index));
    if (screenshots.length <= 1) {
      setOcrTextPreview('');
      setOcrWarning(null);
    }
  };

  const copyCodeToClipboard = () => {
    if (analysisResult?.solution?.code_fix) {
      navigator.clipboard.writeText(analysisResult.solution.code_fix);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const triggerUnifiedAnalysis = (sourceTab: 'manual' | 'files' | 'screenshots') => {
    setActiveTab(sourceTab);
    analyzeMutation.mutate();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-2xl text-white shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-indigo-500/30 flex items-center gap-1">
              <Sparkles size={12} className="text-indigo-400" />
              Multi-Source Intelligence Engine
            </span>
            <span className="bg-emerald-500/20 text-emerald-300 text-xs px-2.5 py-0.5 rounded-full font-semibold border border-emerald-500/30">
              SBP Model Active
            </span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Smart Bug Analyzer</h1>
          <p className="text-slate-400 text-sm mt-1">
            Combine manual details, error logs/datasets, and screenshot OCR to predict priority, analyze root causes, and generate step-by-step solutions.
          </p>
        </div>

        <button
          onClick={() => analyzeMutation.mutate()}
          disabled={analyzeMutation.isPending}
          className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-xl font-bold text-sm shadow-lg shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 shrink-0 disabled:opacity-50"
        >
          {analyzeMutation.isPending ? (
            <>
              <RefreshCw className="animate-spin" size={18} />
              {processingStatus || 'Analyzing Evidence...'}
            </>
          ) : (
            <>
              <Zap size={18} />
              Analyze Bug & Predict Priority
            </>
          )}
        </button>
      </div>

      {/* Progress & Processing States Bar */}
      {analyzeMutation.isPending && (
        <div className="bg-indigo-900 text-white p-4 rounded-xl shadow-lg border border-indigo-700 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <RefreshCw className="animate-spin text-indigo-300" size={20} />
            <div>
              <p className="text-xs text-indigo-300 font-bold uppercase tracking-wider">Analysis Status</p>
              <p className="text-sm font-bold text-white">{processingStatus || 'Processing...'}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-indigo-200">
            <span className={cn("px-2 py-0.5 rounded font-mono", processingStatus === 'Uploading...' && "bg-indigo-500 text-white font-bold")}>Upload</span> →
            <span className={cn("px-2 py-0.5 rounded font-mono", processingStatus === 'Extracting...' && "bg-indigo-500 text-white font-bold")}>Extract</span> →
            <span className={cn("px-2 py-0.5 rounded font-mono", processingStatus === 'OCR Processing...' && "bg-indigo-500 text-white font-bold")}>OCR</span> →
            <span className={cn("px-2 py-0.5 rounded font-mono", processingStatus === 'Analyzing...' && "bg-indigo-500 text-white font-bold")}>Analyze</span> →
            <span className={cn("px-2 py-0.5 rounded font-mono", processingStatus === 'Predicting...' && "bg-indigo-500 text-white font-bold")}>Predict</span>
          </div>
        </div>
      )}

      {validationError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl flex items-center gap-3 text-sm">
          <AlertTriangle className="shrink-0 text-red-500" size={20} />
          <p className="font-semibold">{validationError}</p>
        </div>
      )}

      {/* Main Grid: Input Panels (Left) + Result Display (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: 3 Input Tabs */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Input Source Selector Tabs */}
            <div className="flex border-b border-slate-100 bg-slate-50/50 p-1.5 gap-1">
              <button
                onClick={() => setActiveTab('manual')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all",
                  activeTab === 'manual'
                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Bug size={14} />
                1. Bug Details
              </button>

              <button
                onClick={() => setActiveTab('files')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all",
                  activeTab === 'files'
                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <FileText size={14} />
                2. Files / Logs {files.length > 0 && `(${files.length})`}
              </button>

              <button
                onClick={() => setActiveTab('screenshots')}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-bold rounded-xl transition-all",
                  activeTab === 'screenshots'
                    ? "bg-white text-indigo-600 shadow-sm border border-slate-200/80"
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                <Camera size={14} />
                3. Screenshots (OCR) {screenshots.length > 0 && `(${screenshots.length})`}
              </button>
            </div>

            <div className="p-6">
              {/* TAB 1: Manual Bug Details */}
              {activeTab === 'manual' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Bug Summary / Title *
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Critical NullPointerException during user payment checkout"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Severity
                      </label>
                      <select
                        value={severity}
                        onChange={(e) => setSeverity(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Component
                      </label>
                      <select
                        value={component}
                        onChange={(e) => setComponent(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      >
                        <option value="Backend">Backend API</option>
                        <option value="Frontend">Frontend UI</option>
                        <option value="Database">Database Engine</option>
                        <option value="Auth">Authentication</option>
                        <option value="Payments">Payments & Billing</option>
                        <option value="General">General System</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Bug Description
                    </label>
                    <textarea
                      rows={3}
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Describe what happened, error logs, or observed failure..."
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Expected Result
                      </label>
                      <input
                        type="text"
                        value={expectedResult}
                        onChange={(e) => setExpectedResult(e.target.value)}
                        placeholder="Expected behavior..."
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Actual Result
                      </label>
                      <input
                        type="text"
                        value={actualResult}
                        onChange={(e) => setActualResult(e.target.value)}
                        placeholder="Actual observed output..."
                        className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Steps to Reproduce
                    </label>
                    <textarea
                      rows={2}
                      value={stepsToReproduce}
                      onChange={(e) => setStepsToReproduce(e.target.value)}
                      placeholder="1. Login to application&#10;2. Click checkout&#10;3. Observe crash"
                      className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isReproducible}
                        onChange={(e) => setIsReproducible(e.target.checked)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                      />
                      Easily Reproducible
                    </label>

                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                      <span>Affected Users:</span>
                      <input
                        type="number"
                        min={1}
                        value={affectedUsers}
                        onChange={(e) => setAffectedUsers(parseInt(e.target.value) || 1)}
                        className="w-20 px-2 py-1 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  {/* Section-Specific Analyze Button 1 */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => triggerUnifiedAnalysis('manual')}
                      disabled={analyzeMutation.isPending}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                    >
                      <Zap size={16} />
                      Analyze Bug Details →
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: Files / Datasets / Logs */}
              {activeTab === 'files' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50/50 transition-all cursor-pointer relative">
                    <input
                      type="file"
                      multiple
                      accept=".csv,.txt,.log,.json,.pdf,.doc,.docx,.zip,.xlsx,.xls"
                      onChange={handleFileChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <FileText size={32} className="mx-auto text-indigo-500 mb-2" />
                    <p className="text-sm font-bold text-slate-800">
                      Upload Datasets, Error Logs, or Stack Traces
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Supports CSV, LOG, TXT, JSON, PDF, DOCX, XLSX, ZIP (Max 10 MB per file, Max 10 files)
                    </p>
                  </div>

                  {isScanningFile && (
                    <p className="text-xs text-indigo-600 font-semibold animate-pulse flex items-center gap-1.5">
                      <RefreshCw className="animate-spin" size={14} />
                      Scanning file structure & detecting dataset columns...
                    </p>
                  )}

                  {/* Flexible Column Mapping UI for Structured Datasets */}
                  {detectedColumns.length > 0 && (
                    <div className="bg-indigo-50/60 border border-indigo-200 p-4 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                          <SlidersHorizontal size={14} className="text-indigo-600" />
                          Flexible Dataset Column Mapper
                        </span>
                        <span className="text-[11px] bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded font-bold">
                          {detectedColumns.length} columns detected
                        </span>
                      </div>
                      <p className="text-xs text-indigo-700">
                        Review or update detected column names for dataset priority prediction:
                      </p>
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          { key: 'summary', label: 'Title / Summary' },
                          { key: 'description', label: 'Description' },
                          { key: 'severity', label: 'Severity' },
                          { key: 'component', label: 'Component' },
                          { key: 'priority', label: 'Target Priority' },
                        ].map((item) => (
                          <div key={item.key} className="bg-white p-2 rounded-lg border border-indigo-100 flex items-center justify-between gap-1">
                            <span className="font-semibold text-slate-700 truncate">{item.label}:</span>
                            <select
                              value={columnMappings[item.key] || ''}
                              onChange={(e) => setColumnMappings(prev => ({ ...prev, [item.key]: e.target.value }))}
                              className="px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50 font-mono"
                            >
                              <option value="">-- Auto-Detect --</option>
                              {detectedColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                              ))}
                            </select>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {filePreviewText && (
                    <div className="bg-slate-900 text-slate-200 p-3 rounded-xl border border-slate-800 text-xs font-mono max-h-32 overflow-y-auto">
                      <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Extracted File Content Preview</p>
                      <pre className="whitespace-pre-wrap">{filePreviewText}</pre>
                    </div>
                  )}

                  {files.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Attached Files ({files.length})
                      </p>
                      {files.map((f, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <FileText size={16} className="text-indigo-600 shrink-0" />
                            <span className="font-semibold text-slate-700 truncate">{f.name}</span>
                            <span className="text-slate-400">({(f.size / 1024).toFixed(1)} KB)</span>
                          </div>
                          <button
                            onClick={() => removeFile(idx)}
                            className="text-red-500 hover:text-red-700 font-bold text-xs px-2"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Section-Specific Analyze Button 2 */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => triggerUnifiedAnalysis('files')}
                      disabled={analyzeMutation.isPending || files.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                    >
                      <FileText size={16} />
                      Analyze Files →
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: Screenshots OCR */}
              {activeTab === 'screenshots' && (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-slate-300 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-50/50 transition-all cursor-pointer relative">
                    <input
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg"
                      onChange={handleScreenshotChange}
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    />
                    <Camera size={32} className="mx-auto text-indigo-500 mb-2" />
                    <p className="text-sm font-bold text-slate-800">
                      Upload Screenshots for OCR Error Extraction
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Upload PNG/JPG of IDE errors, stack traces, terminal output, or UI crashes
                    </p>
                  </div>

                  {isScanningScreenshot && (
                    <p className="text-xs text-indigo-600 font-semibold animate-pulse flex items-center gap-1.5">
                      <RefreshCw className="animate-spin" size={14} />
                      Running OCR text extraction on uploaded screenshot...
                    </p>
                  )}

                  {/* Required OCR Warning Banner */}
                  {ocrWarning && (
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3.5 rounded-xl text-xs flex items-start gap-2.5 font-medium">
                      <AlertTriangle className="shrink-0 text-amber-600 mt-0.5" size={16} />
                      <p>{ocrWarning}</p>
                    </div>
                  )}

                  {/* OCR Extracted Text Display */}
                  {ocrTextPreview && (
                    <div className="bg-slate-900 text-emerald-400 p-3.5 rounded-xl border border-slate-800 font-mono text-xs space-y-1">
                      <div className="flex items-center justify-between text-slate-400 text-[10px] uppercase font-bold">
                        <span className="flex items-center gap-1">
                          <Eye size={12} className="text-indigo-400" />
                          Extracted OCR Text Preview
                        </span>
                        <span>{ocrTextPreview.length} characters</span>
                      </div>
                      <p className="whitespace-pre-wrap leading-relaxed max-h-32 overflow-y-auto">{ocrTextPreview}</p>
                    </div>
                  )}

                  {screenshots.length > 0 && (
                    <div className="grid grid-cols-3 gap-3">
                      {screenshots.map((s, idx) => (
                        <div key={idx} className="relative group border border-slate-200 rounded-xl overflow-hidden bg-slate-100">
                          <img src={s.preview} alt="ocr-preview" className="h-24 w-full object-cover" />
                          <button
                            onClick={() => removeScreenshot(idx)}
                            className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 shadow-md opacity-90 hover:opacity-100"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Section-Specific Analyze Button 3 */}
                  <div className="pt-3">
                    <button
                      type="button"
                      onClick={() => triggerUnifiedAnalysis('screenshots')}
                      disabled={analyzeMutation.isPending || screenshots.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-indigo-600/20 disabled:opacity-50"
                    >
                      <Camera size={16} />
                      Analyze Screenshot →
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: BUG RECTIFICATION & RESULT CARD UI */}
        <div className="lg:col-span-5">
          {analysisResult ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden sticky top-6">
              
              {/* Card Header Banner */}
              <div className="bg-slate-900 p-5 text-white flex items-center justify-between border-b border-slate-800">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                    BUG ANALYSIS RESULT
                  </span>
                  <h3 className="text-lg font-bold flex items-center gap-2">
                    {analysisResult.bug_id}
                  </h3>
                </div>
                <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-1 rounded-full font-mono font-bold">
                  {analysisResult.model_version}
                </span>
              </div>

              <div className="p-6 space-y-5">
                {/* Priority & Confidence Row */}
                <div className="flex items-center justify-between bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <div>
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Predicted Priority</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={cn(
                        "text-lg font-extrabold px-3 py-0.5 rounded-lg border uppercase tracking-wider",
                        analysisResult.priority === 'CRITICAL' && "bg-purple-100 text-purple-900 border-purple-300",
                        analysisResult.priority === 'HIGH' && "bg-red-100 text-red-800 border-red-300",
                        analysisResult.priority === 'MEDIUM' && "bg-yellow-100 text-yellow-800 border-yellow-300",
                        analysisResult.priority === 'LOW' && "bg-green-100 text-green-800 border-green-300",
                        analysisResult.priority === 'REVIEW REQUIRED' && "bg-amber-100 text-amber-900 border-amber-400"
                      )}>
                        {analysisResult.priority}
                      </span>
                    </div>
                  </div>

                  <div className="text-right">
                    <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">Confidence</p>
                    <p className="text-2xl font-extrabold text-slate-900">{analysisResult.confidence}%</p>
                  </div>
                </div>

                {/* Important Reasons */}
                {analysisResult.reasons && analysisResult.reasons.length > 0 && (
                  <div>
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                      <Layers size={14} className="text-indigo-600" />
                      Important Factors & Evidence
                    </p>
                    <ul className="space-y-1 text-xs text-slate-600 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                      {analysisResult.reasons.map((r, i) => (
                        <li key={i} className="flex items-start gap-2 font-medium">
                          <span className="text-indigo-600 font-bold">•</span>
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Error & Root Cause */}
                <div className="space-y-2">
                  <div className="bg-slate-900 text-slate-100 p-3.5 rounded-xl border border-slate-800">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Detected Error / Exception</p>
                    <p className="text-xs font-mono font-bold text-red-400 mt-0.5">
                      {analysisResult.error_type}
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-slate-200 bg-white">
                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                      <ShieldAlert size={14} className="text-amber-500" />
                      Likely Root Cause
                    </p>
                    <p className="text-xs text-slate-700 leading-relaxed font-medium">
                      {analysisResult.solution?.root_cause || 'Cause under investigation.'}
                    </p>
                  </div>
                </div>

                {/* Solution & Fix Rectification */}
                {analysisResult.solution && (
                  <div className="space-y-3 pt-1">
                    <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/40">
                      <p className="text-xs font-bold text-emerald-900 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        Recommended Fix / Solution
                      </p>
                      <p className="text-xs text-emerald-950 font-semibold leading-relaxed">
                        {analysisResult.solution.recommended_fix}
                      </p>
                    </div>

                    {/* Step by step fix */}
                    {analysisResult.solution.steps_to_fix && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Step-by-Step Fix Steps
                        </p>
                        <div className="space-y-1.5 text-xs text-slate-700">
                          {analysisResult.solution.steps_to_fix.map((step, idx) => (
                            <div key={idx} className="bg-slate-50 p-2 rounded-lg border border-slate-200 font-medium">
                              {step}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Example Code Fix */}
                    {analysisResult.solution.code_fix && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1">
                            <Code2 size={14} className="text-indigo-600" />
                            Example Code Fix
                          </p>
                          <button
                            onClick={copyCodeToClipboard}
                            className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold flex items-center gap-1"
                          >
                            {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                            {copiedCode ? 'Copied!' : 'Copy Code'}
                          </button>
                        </div>
                        <pre className="bg-slate-950 text-emerald-400 p-3 rounded-xl text-xs font-mono overflow-x-auto border border-slate-800">
                          <code>{analysisResult.solution.code_fix}</code>
                        </pre>
                      </div>
                    )}

                    {/* Verification Steps */}
                    {analysisResult.solution.verification_steps && (
                      <div>
                        <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                          Verification Steps
                        </p>
                        <ul className="space-y-1 text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
                          {analysisResult.solution.verification_steps.map((v, i) => (
                            <li key={i} className="flex items-center gap-2">
                              <span className="text-emerald-500 font-bold">✓</span>
                              {v}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Human Verification Action Bar */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Human Verification (Train SBP Model)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Verify actual priority to automatically trigger continuous learning retraining:
                  </p>

                  <div className="flex gap-2 pt-1">
                    {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((prio) => (
                      <button
                        key={prio}
                        onClick={() => verifyMutation.mutate(prio)}
                        disabled={verifyMutation.isPending}
                        className={cn(
                          "flex-1 py-2 rounded-xl text-xs font-bold border transition-all",
                          verifiedPriority === prio
                            ? "bg-indigo-600 text-white border-indigo-600 shadow-md"
                            : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                        )}
                      >
                        Verify {prio}
                      </button>
                    ))}
                  </div>

                  {verificationMessage && (
                    <p className="text-xs text-emerald-700 font-semibold bg-emerald-50 p-2 rounded-lg border border-emerald-200 mt-2">
                      {verificationMessage}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-sm">
              <Bug size={48} className="mx-auto text-indigo-400 mb-3 opacity-80" />
              <h3 className="text-base font-bold text-slate-800">Ready for Analysis</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Fill in bug details, upload error logs or screenshots, and click <strong>Analyze Bug</strong> to view the unified analysis result card.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Predictor;
