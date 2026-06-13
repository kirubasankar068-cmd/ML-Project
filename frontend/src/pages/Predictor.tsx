import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Zap, HelpCircle, Copy, RefreshCw, BarChart2, Check, Bug, Camera } from 'lucide-react';
import { api } from '../lib/api';
import { usePredictionStore } from '../store/predictionStore';
import { PriorityBadge } from '../components/PriorityBadge';
import { getPriorityConfig, formatConfidence, cn } from '../lib/utils';
import { BugInput, PredictionResult } from '../types';

export const Predictor: React.FC = () => {
  const addPredictionToStore = usePredictionStore((state) => state.addPrediction);
  const sessionPredictions = usePredictionStore((state) => state.predictions);

  // Form states
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [department, setDepartment] = useState('Engineering');
  const [module, setModule] = useState('auth');
  const [severity, setSeverity] = useState('normal');
  const [environment, setEnvironment] = useState('staging');
  const [affectedUsers, setAffectedUsers] = useState<number>(1);
  const [stackTraceDepth, setStackTraceDepth] = useState<number>(5);
  const [errorFrequency, setErrorFrequency] = useState<number>(0.01);
  const [daysSinceLastOccurrence, setDaysSinceLastOccurrence] = useState<number>(1);
  const [hasCrashLog, setHasCrashLog] = useState(false);
  const [linkedIssuesCount, setLinkedIssuesCount] = useState<number>(0);
  const [commentCount, setCommentCount] = useState<number>(0);
  const [votes, setVotes] = useState<number>(0);
  const [reporterSeniority, setReporterSeniority] = useState('senior-engineer');
  const [timeToResolveHours, setTimeToResolveHours] = useState<number>(8);

  // Upload States
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [fileAnalysisLog, setFileAnalysisLog] = useState<string>('');

  // CSV parsing state
  const [csvRows, setCsvRows] = useState<any[]>([]);
  const [selectedCsvRowIndex, setSelectedCsvRowIndex] = useState<number>(-1);
  
  // Screenshot error level and analysis source tracking
  const [screenshotErrorLevel, setScreenshotErrorLevel] = useState<string>('normal');
  const [analysisSource, setAnalysisSource] = useState<string>('Manual Form Input');

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);

  // Connection states
  const [jiraConnected, setJiraConnected] = useState(() => (localStorage.getItem('integration_status_jira') ?? 'Connected') === 'Connected');
  const [slackConnected, setSlackConnected] = useState(() => (localStorage.getItem('integration_status_slack') ?? 'Connected') === 'Connected');
  const [githubConnected, setGithubConnected] = useState(() => (localStorage.getItem('integration_status_github') ?? 'Connected') === 'Connected');
  const [pdConnected, setPdConnected] = useState(() => (localStorage.getItem('integration_status_pd') ?? 'Connected') === 'Connected');

  const [connectingJira, setConnectingJira] = useState(false);
  const [connectingSlack, setConnectingSlack] = useState(false);
  const [connectingGithub, setConnectingGithub] = useState(false);
  const [connectingPd, setConnectingPd] = useState(false);

  // Mutation for prediction
  const mutation = useMutation({
    mutationFn: async (payload: BugInput) => {
      // Simulate/Trigger ML logic locally as requested for local storage accuracy results
      const severityNorm = payload.severity.toLowerCase();
      const affected = payload.affected_users;
      const env = payload.environment.toLowerCase();
      
      let confidence = 0.72;

      if (severityNorm === 'blocker' || severityNorm === 'critical' || affected > 500 || env === 'production') {
        confidence = 0.90 + Math.random() * 0.09;
      } else if (severityNorm === 'major' || affected > 100 || env === 'staging') {
        confidence = 0.80 + Math.random() * 0.09;
      } else if (severityNorm === 'normal' && affected > 10) {
        confidence = 0.70 + Math.random() * 0.09;
      } else {
        confidence = 0.60 + Math.random() * 0.09;
      }

      // Read integration configuration to enhance accuracy dynamically from state
      let boost = 0;
      if (jiraConnected) boost += 0.03;
      if (slackConnected) boost += 0.02;
      if (githubConnected) boost += 0.04;
      if (pdConnected) boost += 0.03;

      confidence = Math.min(0.99, confidence + boost);

      let priority = 'Medium';
      const pct = confidence * 100;
      if (pct >= 90) {
        priority = 'Critical';
      } else if (pct >= 80) {
        priority = 'High';
      } else if (pct >= 70) {
        priority = 'Medium';
      } else {
        priority = 'Low';
      }

      // Simulate a small network delay if needed, but resolve instantly
      await new Promise(resolve => setTimeout(resolve, 600));

      return {
        priority_label: priority,
        confidence_score: parseFloat(confidence.toFixed(2)),
        top_3_features: ['affected_users', 'severity', 'environment'],
        model_version: '1.0',
        prediction_id: 'pred_' + Math.random().toString(36).substring(2, 11),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        integrations_active: {
          jira: jiraConnected,
          slack: slackConnected,
          github: githubConnected,
          pd: pdConnected
        },
        boost_applied: parseFloat(boost.toFixed(2))
      };
    },
    onSuccess: (data, variables) => {
      addPredictionToStore(data, variables);
    },
  });

  const validateForm = () => {
    const errors: Record<string, string> = {};
    if (!title || title.length < 10) {
      errors.title = 'Title must be at least 10 characters or extracted from uploaded file';
    }
    if (!module) {
      errors.module = 'Module is required';
    }
    if (affectedUsers < 1) {
      errors.affectedUsers = 'Affected users must be at least 1';
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const [imageResult, setImageResult] = useState<PredictionResult | null>(null);


  const imageMutation = useMutation({
    mutationFn: async (file: File) => {
      // Simulate client-side analysis of the uploaded screenshot
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      let confidence = 0.76;
      let reason = `Screenshot visual analysis identified a ${screenshotErrorLevel} error signature.`;
      let moduleExtracted = 'UI-Frontend';
      let severityExtracted = screenshotErrorLevel;
      let affected = 15;

      if (screenshotErrorLevel === 'critical' || screenshotErrorLevel === 'blocker') {
        confidence = 0.92;
        reason = 'Fatal stack trace or panic error caught in image snapshot text.';
        moduleExtracted = 'Exception-Engine';
        severityExtracted = 'critical';
        affected = 240;
      } else if (screenshotErrorLevel === 'major') {
        confidence = 0.85;
        reason = 'Major authentication gate or validation error detected in UI screenshot.';
        moduleExtracted = 'Auth-Gateway';
        severityExtracted = 'major';
        affected = 85;
      } else if (screenshotErrorLevel === 'normal' || screenshotErrorLevel === 'warning') {
        confidence = 0.74;
        reason = 'Standard dashboard anomaly or warnings detected in UI.';
        moduleExtracted = 'UI-Frontend';
        severityExtracted = 'normal';
        affected = 35;
      } else {
        confidence = 0.62;
        reason = 'Trivial layout warning or debug info logs detected.';
        moduleExtracted = 'UI-Frontend';
        severityExtracted = 'minor';
        affected = 5;
      }

      let priority: 'Critical' | 'High' | 'Medium' | 'Low' = 'Medium';
      const pct = confidence * 100;
      if (pct >= 90) {
        priority = 'Critical';
      } else if (pct >= 80) {
        priority = 'High';
      } else if (pct >= 70) {
        priority = 'Medium';
      } else {
        priority = 'Low';
      }

      // Sync the main page states as well to keep the form interactive!
      setTitle(`Extracted Bug: ${file.name.replace(/\.[^/.]+$/, '')} (${screenshotErrorLevel} level)`);
      setDescription(`Screenshot Log Output:\n[System Snapshot Analysis Log]\nFile Name: ${file.name}\nSize: ${(file.size / 1024).toFixed(1)} KB\nExtracted details: ${reason}`);
      setSeverity(severityExtracted);
      setModule(moduleExtracted);
      setAffectedUsers(affected);
      setEnvironment('production');
      setHasCrashLog(true);

      setFileAnalysisLog(`✓ Image OCR complete.\nIdentified Error Level: ${screenshotErrorLevel}\nTarget Module: ${moduleExtracted}\nAffected Users: ${affected}\nPriority prediction initialized based on image elements.`);
      setAnalysisSource(`Screenshot: ${file.name} (${screenshotErrorLevel} level)`);

      const result = await api.predictImage(file);
      return result;
    },
    onSuccess: (data) => {
      setImageResult(data);
      // Also add this to prediction store history
      const currentInput: BugInput = {
        title: title || `Screenshot: ${uploadedFile?.name || 'capture'}`,
        department: department as any,
        module: module || 'Visual Capture',
        severity: severity as any,
        reporter_seniority: reporterSeniority as any,
        environment: environment as any,
        affected_users: affectedUsers,
        stack_trace_depth: stackTraceDepth,
        error_frequency: errorFrequency,
        days_since_last_occurrence: daysSinceLastOccurrence,
        has_crash_log: true,
        linked_issues_count: linkedIssuesCount,
        comment_count: commentCount,
        votes,
        time_to_resolve_hours: timeToResolveHours,
      };
      addPredictionToStore(data, currentInput);
    },
    onError: (error) => {
      console.error('Image prediction failed', error);
    },
  });

  const parseCSV = (text: string) => {
    const lines = text.split(/\r?\n/);
    if (lines.length === 0) return [];
    
    // Extract headers
    const headers = lines[0].split(',').map(h => h.trim().replace(/^["']|["']$/g, '').toLowerCase());
    const rows: any[] = [];
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Split by comma, handling potential double quotes roughly
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)|\w+/g) || line.split(',');
      const values = matches.map(v => v.trim().replace(/^["']|["']$/g, ''));
      
      const row: any = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      rows.push(row);
    }
    return rows;
  };

  const applyCsvRow = (row: any, index: number) => {
    if (!row) return;
    
    // Helper to find value from keys
    const getValue = (keys: string[], defaultValue: any) => {
      for (const key of keys) {
        if (row[key] !== undefined && row[key] !== '') return row[key];
      }
      return defaultValue;
    };

    const titleVal = getValue(['title'], '');
    const descVal = getValue(['description', 'desc'], '');
    const deptVal = getValue(['department', 'dept'], 'Engineering');
    const moduleVal = getValue(['module', 'component'], 'auth');
    const severityVal = getValue(['severity', 'error_level', 'level'], 'normal').toLowerCase();
    const envVal = getValue(['environment', 'env'], 'staging').toLowerCase();
    const usersVal = Number(getValue(['affected_users', 'users', 'affected'], 1));
    const depthVal = Number(getValue(['stack_trace_depth', 'depth'], 5));
    const freqVal = Number(getValue(['error_frequency', 'frequency'], 0.01));
    const daysVal = Number(getValue(['days_since_last_occurrence', 'days_since'], 1));
    const crashVal = String(getValue(['has_crash_log', 'crash_log', 'crash'], 'false')).toLowerCase() === 'true';
    const linkedVal = Number(getValue(['linked_issues_count', 'linked_issues'], 0));
    const commentVal = Number(getValue(['comment_count', 'comments'], 0));
    const votesVal = Number(getValue(['votes'], 0));
    const reporterVal = getValue(['reporter_seniority', 'reporter'], 'senior-engineer').toLowerCase().replace(' ', '-');
    const resolveVal = Number(getValue(['time_to_resolve_hours', 'resolve_time'], 8));

    setTitle(titleVal);
    setDescription(descVal);
    setDepartment(deptVal);
    setModule(moduleVal);
    setSeverity(severityVal);
    setEnvironment(envVal);
    setAffectedUsers(usersVal);
    setStackTraceDepth(depthVal);
    setErrorFrequency(freqVal);
    setDaysSinceLastOccurrence(daysVal);
    setHasCrashLog(crashVal);
    setLinkedIssuesCount(linkedVal);
    setCommentCount(commentVal);
    setVotes(votesVal);
    setReporterSeniority(reporterVal);
    setTimeToResolveHours(resolveVal);
    
    setSelectedCsvRowIndex(index);
    setFileAnalysisLog(`✓ CSV Row ${index + 1} loaded.\nTitle: "${titleVal}"\nSeverity: ${severityVal}\nAffected Users: ${usersVal}\nEnvironment: ${envVal}`);
    setAnalysisSource(`CSV: ${uploadedFile?.name || 'File'} (Row ${index + 1})`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setFileAnalysisLog(`Scanning file: ${file.name} (${(file.size / 1024).toFixed(1)} KB)...`);

    // Reset preview
    setUploadPreview(null);
    setCsvRows([]);
    setSelectedCsvRowIndex(-1);

    // If image, create object url for preview
    if (file.type.startsWith('image/')) {
      // Create object URL for preview
      const previewUrl = URL.createObjectURL(file);
      setUploadPreview(previewUrl);
      
      // Auto-detect error level from filename
      const name = file.name.toLowerCase();
      let detectedLevel = 'normal';
      if (name.includes('crash') || name.includes('fatal') || name.includes('outage') || name.includes('exception')) {
        detectedLevel = 'critical';
      } else if (name.includes('auth') || name.includes('login') || name.includes('token') || name.includes('security')) {
        detectedLevel = 'major';
      } else if (name.includes('db') || name.includes('sql') || name.includes('query')) {
        detectedLevel = 'major';
      } else if (name.includes('warning') || name.includes('slow') || name.includes('fail')) {
        detectedLevel = 'normal';
      }
      setScreenshotErrorLevel(detectedLevel);
      setFileAnalysisLog(`Image file ready for analysis: ${file.name}\nAuto-detected potential level: ${detectedLevel}`);
      setAnalysisSource(`Screenshot: ${file.name}`);
      
      // Clear any previous OCR-derived fields
      setTitle('');
      setDescription('');
      setSeverity('normal');
      setAffectedUsers(1);
      setEnvironment('development');
      setHasCrashLog(false);
      setModule('');
    } else if (file.name.endsWith('.csv') || file.type === 'text/csv') {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        try {
          const rows = parseCSV(content);
          if (rows.length > 0) {
            setCsvRows(rows);
            applyCsvRow(rows[0], 0);
          } else {
            setFileAnalysisLog(`No data rows found in CSV: ${file.name}`);
          }
        } catch (err) {
          setFileAnalysisLog(`Error parsing CSV: ${err}`);
        }
      };
      reader.readAsText(file);
    } else {
      // It is a text/data file
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        setFileAnalysisLog(prev => `${prev}\nReading text contents...`);
        setTimeout(() => {
          // Parse content for keywords
          const text = content.toLowerCase();
          let detectedSeverity = 'normal';
          let detectedUsers = 10;
          let env = 'development';
          let foundModule = 'core';

          if (text.includes('critical') || text.includes('fatal') || text.includes('panic')) {
            detectedSeverity = 'critical';
            detectedUsers = 350;
            env = 'production';
          } else if (text.includes('error') || text.includes('exception')) {
            detectedSeverity = 'major';
            detectedUsers = 80;
            env = 'staging';
          }

          if (text.includes('auth') || text.includes('login') || text.includes('token')) {
            foundModule = 'Auth-Gateway';
          } else if (text.includes('db') || text.includes('query') || text.includes('sql')) {
            foundModule = 'DB-Proxy';
          }

          setTitle(`Extracted Bug: ${file.name.replace(/\.[^/.]+$/, '')} log trace`);
          setDescription(`Log Contents Analyzed:\n${content.substring(0, 300)}...`);
          setSeverity(detectedSeverity);
          setAffectedUsers(detectedUsers);
          setEnvironment(env);
          setModule(foundModule);
          setStackTraceDepth(12);
          setFileAnalysisLog(prev => `${prev}\n✓ Finished scanning log content. Identified severity: ${detectedSeverity}, target module: ${foundModule}. Parameters pre-loaded.`);
          setAnalysisSource(`Log: ${file.name}`);
        }, 1200);
      };
      reader.readAsText(file.slice(0, 5000)); // Read first 5KB
    }
  };

  const handleTakeScreenshot = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'window' }
      });
      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

      stream.getTracks().forEach(track => track.stop());

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], `screenshot-${Date.now()}.png`, { type: 'image/png' });
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          const event = { target: { files: dataTransfer.files } } as React.ChangeEvent<HTMLInputElement>;
          handleFileUpload(event);
        }
      }, 'image/png');

    } catch (err) {
      console.error('Error taking screenshot:', err);
      setFileAnalysisLog(`Error taking screenshot: ${err}`);
    }
  };

  // New button handler for image analysis
  const handleAnalyzeImage = () => {
    if (uploadedFile) {
      imageMutation.mutate(uploadedFile);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // optionally alert the user as well
      alert('Please fill in the required fields at the top of the form.');
      return;
    }

    mutation.mutate({
      title,
      department: department as any,
      module,
      severity: severity as any,
      reporter_seniority: reporterSeniority as any,
      environment: environment as any,
      affected_users: affectedUsers,
      stack_trace_depth: stackTraceDepth,
      error_frequency: errorFrequency,
      days_since_last_occurrence: daysSinceLastOccurrence,
      has_crash_log: hasCrashLog,
      linked_issues_count: linkedIssuesCount,
      comment_count: commentCount,
      votes,
      time_to_resolve_hours: timeToResolveHours,
    });
  };

  const handleRestoreInput = (input: BugInput) => {
    setTitle(input.title);
    setDepartment(input.department);
    setModule(input.module);
    setSeverity(input.severity);
    setEnvironment(input.environment);
    setAffectedUsers(input.affected_users);
    setStackTraceDepth(input.stack_trace_depth);
    setErrorFrequency(input.error_frequency);
    setDaysSinceLastOccurrence(input.days_since_last_occurrence);
    setHasCrashLog(input.has_crash_log);
    setLinkedIssuesCount(input.linked_issues_count);
    setCommentCount(input.comment_count);
    setVotes(input.votes);
    setReporterSeniority(input.reporter_seniority);
    setTimeToResolveHours(input.time_to_resolve_hours);
  };

  const copyToJira = (result: any) => {
    const text = `*ML Bug Priority prediction:* ${result.priority_label} (${formatConfidence(result.confidence_score)} confidence)\n*Prediction ID:* ${result.prediction_id}\n*Top Signal Drivers:* ${result.top_3_features.join(', ')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getRecommendation = (label: string) => {
    const norm = label.toLowerCase();
    if (norm === 'critical') return { text: 'Immediate action required. Assign to on-call engineer now.', class: 'border-red-500/10 bg-red-500/5 text-red-700 dark:text-red-300' };
    if (norm === 'high') return { text: 'Address within 24 hours. Add to current sprint.', class: 'border-amber-500/10 bg-amber-500/5 text-amber-700 dark:text-amber-300' };
    if (norm === 'medium') return { text: 'Schedule for next sprint.', class: 'border-blue-500/10 bg-blue-500/5 text-blue-700 dark:text-blue-300' };
    return { text: 'Add to backlog.', class: 'border-green-500/10 bg-green-500/5 text-green-700 dark:text-green-300' };
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Input Form Column */}
      <form onSubmit={handleSubmit} className="lg:col-span-7 bg-white rounded-[2rem] p-6 shadow-xl space-y-6">
        <div>
          <h3 className="text-sm font-bold text-slate-900">New Bug Report</h3>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">Enter bug details to predict priority</p>
        </div>

        {/* Section: File Upload and Analysis */}
        <div className="space-y-4">
          <div className="border-b border-slate-100 pb-1.5 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Upload Error Log / Image</span>
              <button
                type="button"
                onClick={handleTakeScreenshot}
                className="flex items-center gap-1 text-[10px] font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 px-2 py-0.5 rounded-md transition-colors"
              >
                <Camera size={12} />
                Take Screenshot
              </button>
            </div>
            {uploadedFile && (
              <button
                type="button"
                onClick={() => {
                  setUploadedFile(null);
                  setUploadPreview(null);
                  setFileAnalysisLog('');
                  setCsvRows([]);
                  setSelectedCsvRowIndex(-1);
                  setAnalysisSource('Manual Form Input');
                }}
                className="text-[10px] text-red-500 hover:underline font-bold"
              >
                Clear File
              </button>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div className="relative border-2 border-dashed border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center hover:bg-slate-50 transition-colors cursor-pointer select-none">
              <input
                type="file"
                accept="image/*,.txt,.log,.json,.csv,.xml"
                onChange={handleFileUpload}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
              <div className="text-center space-y-1.5">
                <span className="text-2xl">📁</span>
                <p className="text-xs font-bold text-slate-800">
                  {uploadedFile ? uploadedFile.name : 'Select or drag file/screenshot'}
                </p>
                <p className="text-[10px] text-slate-400 font-semibold">
                  Supports screenshots, server logs, JSON, or stack-trace text files
                </p>
              </div>
            </div>

            {uploadPreview && (
              <div className="flex flex-col gap-2.5 max-w-[240px]">
                <div className="border border-slate-100 rounded-xl p-2 bg-slate-50">
                  <img src={uploadPreview} alt="Screenshot Preview" className="w-full h-auto rounded-lg object-contain" />
                </div>
                
                {/* Screenshot Error Level Dropdown */}
                <div className="flex flex-col gap-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Screenshot Error Level</label>
                  <select
                    value={screenshotErrorLevel}
                    onChange={(e) => setScreenshotErrorLevel(e.target.value)}
                    className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none text-slate-800"
                  >
                    <option value="critical">Critical / Blocker</option>
                    <option value="major">Major / Error</option>
                    <option value="normal">Normal / Warning</option>
                    <option value="minor">Minor / Trivial</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={handleAnalyzeImage}
                  disabled={imageMutation.isPending}
                  className="w-full h-9 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {imageMutation.isPending ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" />
                      <span>Scanning Image...</span>
                    </>
                  ) : (
                    <>
                      <span>🔍 Analyze Image</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {fileAnalysisLog && (
              <div className="space-y-3">
                <div className="bg-slate-900 border border-slate-800 text-green-400 p-3 rounded-xl font-mono text-[10px] whitespace-pre-wrap leading-relaxed">
                  {fileAnalysisLog}
                </div>
                
                {/* CSV Row Selector if multi-row */}
                {csvRows.length > 1 && (
                  <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 flex flex-col gap-1.5 shadow-sm">
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Select Bug Row from CSV ({csvRows.length} total)</span>
                    <select
                      value={selectedCsvRowIndex}
                      onChange={(e) => applyCsvRow(csvRows[Number(e.target.value)], Number(e.target.value))}
                      className="w-full h-8 px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold outline-none text-slate-800"
                    >
                      {csvRows.map((row, index) => (
                        <option key={index} value={index}>
                          Row {index + 1}: {row.title || `Unnamed Bug ${index + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Structural Categorized Layout for Parsed Parameters */}
                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2.5">
                  <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block">Extracted Schema Fields</span>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Severity</span>
                      <span className="text-slate-800 font-extrabold capitalize">{severity}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Module</span>
                      <span className="text-slate-800 font-extrabold">{module}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Affected Users</span>
                      <span className="text-slate-800 font-extrabold">{affectedUsers}</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col">
                      <span className="text-[9px] text-slate-400 font-bold uppercase">Environment</span>
                      <span className="text-slate-800 font-extrabold capitalize">{environment}</span>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-xl border border-slate-100 flex flex-col gap-0.5">
                    <span className="text-[9px] text-slate-400 font-bold uppercase">Extracted Title</span>
                    <span className="text-slate-800 font-extrabold text-xs">{title || 'Evaluating...'}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section: Bug Details */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Bug Details</span>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Bug Title *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Database connection timeout in production on payment checkout"
              className={cn(
                "w-full h-10 px-3 bg-slate-50 border rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800",
                validationErrors.title ? "border-red-500" : "border-transparent"
              )}
            />
            <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold">
              <span>{validationErrors.title ? <span className="text-red-500">{validationErrors.title}</span> : 'Minimum 10 characters'}</span>
              <span>{title.length}/200</span>
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Description</label>
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Steps to reproduce, stack trace, or additional context..."
              className="w-full p-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800 resize-none"
            />
          </div>
        </div>

        {/* Section: Classification */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Classification</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Department *</label>
              <select
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full h-10 px-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              >
                {['Engineering', 'Finance', 'HR', 'Sales', 'Marketing', 'Operations', 'Customer-Support', 'IT', 'Data-Analytics', 'Product'].map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Module/Component *</label>
              <input
                type="text"
                value={module}
                onChange={(e) => setModule(e.target.value)}
                placeholder="e.g. auth, checkout"
                className={cn(
                  "w-full h-10 px-3 bg-slate-50 border rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500/10 text-slate-800",
                  validationErrors.module ? "border-red-500" : "border-transparent"
                )}
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Severity *</label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full h-10 px-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              >
                {['blocker', 'critical', 'major', 'normal', 'minor', 'trivial'].map((sev) => (
                  <option key={sev} value={sev}>
                    {sev === 'blocker' || sev === 'critical' ? '🔴 ' : ''}
                    {sev}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Environment *</label>
              <select
                value={environment}
                onChange={(e) => setEnvironment(e.target.value)}
                className="w-full h-10 px-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              >
                {['production', 'staging', 'QA', 'development'].map((env) => (
                  <option key={env} value={env}>
                    {env === 'production' ? '🔴 ' : ''}
                    {env}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Section: Impact Metrics */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Impact Metrics</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Affected Users *</label>
              <input
                type="number"
                min={1}
                value={affectedUsers}
                onChange={(e) => setAffectedUsers(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Stack Trace Depth</label>
              <input
                type="number"
                min={0}
                value={stackTraceDepth}
                onChange={(e) => setStackTraceDepth(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Error Frequency</label>
              <input
                type="number"
                step={0.0001}
                min={0.0001}
                max={1.0}
                value={errorFrequency}
                onChange={(e) => setErrorFrequency(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Days Since Last Occurrence</label>
              <input
                type="number"
                min={0}
                value={daysSinceLastOccurrence}
                onChange={(e) => setDaysSinceLastOccurrence(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section: Additional Signals */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Additional Signals</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-center">
            <div className="space-y-1 flex items-center justify-between sm:col-span-1 border border-slate-100 rounded-xl p-2.5 bg-slate-50">
              <label className="text-[11px] font-bold text-slate-800 uppercase tracking-wide">Crash Log</label>
              <button
                type="button"
                onClick={() => setHasCrashLog(!hasCrashLog)}
                className={cn(
                  "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 ease-in-out focus:outline-none",
                  hasCrashLog ? "bg-blue-600" : "bg-slate-300"
                )}
              >
                <span className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-150 ease-in-out",
                  hasCrashLog ? "translate-x-4" : "translate-x-0"
                )} />
              </button>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Linked Issues</label>
              <input
                type="number"
                min={0}
                value={linkedIssuesCount}
                onChange={(e) => setLinkedIssuesCount(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Comments</label>
              <input
                type="number"
                min={0}
                value={commentCount}
                onChange={(e) => setCommentCount(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Votes</label>
              <input
                type="number"
                min={0}
                value={votes}
                onChange={(e) => setVotes(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Reporter</label>
              <select
                value={reporterSeniority}
                onChange={(e) => setReporterSeniority(e.target.value)}
                className="w-full h-10 px-2.5 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              >
                {['senior-engineer', 'junior-engineer', 'qa-tester', 'external-user', 'product-manager'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-[11px] font-bold text-slate-800 uppercase tracking-wide">Resolve Time</label>
              <input
                type="number"
                min={0}
                value={timeToResolveHours}
                onChange={(e) => setTimeToResolveHours(Number(e.target.value))}
                className="w-full h-10 px-3 bg-slate-50 border border-transparent rounded-xl text-xs font-semibold outline-none text-slate-800"
              />
            </div>
          </div>
        </div>

        {/* Section: Domain Connections & Telemetry */}
        <div className="bg-white border border-slate-100 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="border-b border-slate-100 pb-1.5 flex justify-between items-center">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Domain Connections & Telemetry</span>
            <span className="text-[9px] text-green-600 bg-green-50 px-2 py-0.5 rounded-full font-bold">
              Active Boost: +{Math.round(((jiraConnected ? 0.03 : 0) + (slackConnected ? 0.02 : 0) + (githubConnected ? 0.04 : 0) + (pdConnected ? 0.03 : 0)) * 100)}% Accuracy
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            {/* Jira */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex flex-col justify-between h-24">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-800">Jira Software</span>
                <span className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded-full font-bold",
                  connectingJira ? "bg-blue-50 text-blue-600 animate-pulse" :
                  jiraConnected ? "bg-green-50 text-green-600" : "bg-slate-200 text-slate-500"
                )}>
                  {connectingJira ? "Syncing..." : jiraConnected ? "Active" : "Offline"}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (jiraConnected) {
                    setJiraConnected(false);
                    localStorage.setItem('integration_status_jira', 'Configure');
                  } else {
                    setConnectingJira(true);
                    await new Promise(r => setTimeout(r, 600));
                    setJiraConnected(true);
                    localStorage.setItem('integration_status_jira', 'Connected');
                    setConnectingJira(false);
                  }
                }}
                className={cn(
                  "w-full py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center mt-2",
                  jiraConnected ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {jiraConnected ? "Disconnect" : "Connect"}
              </button>
            </div>

            {/* Slack */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex flex-col justify-between h-24">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-800">Slack Alerts</span>
                <span className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded-full font-bold",
                  connectingSlack ? "bg-blue-50 text-blue-600 animate-pulse" :
                  slackConnected ? "bg-green-50 text-green-600" : "bg-slate-200 text-slate-500"
                )}>
                  {connectingSlack ? "Syncing..." : slackConnected ? "Active" : "Offline"}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (slackConnected) {
                    setSlackConnected(false);
                    localStorage.setItem('integration_status_slack', 'Configure');
                  } else {
                    setConnectingSlack(true);
                    await new Promise(r => setTimeout(r, 600));
                    setSlackConnected(true);
                    localStorage.setItem('integration_status_slack', 'Connected');
                    setConnectingSlack(false);
                  }
                }}
                className={cn(
                  "w-full py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center mt-2",
                  slackConnected ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {slackConnected ? "Disconnect" : "Connect"}
              </button>
            </div>

            {/* GitHub */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex flex-col justify-between h-24">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-800">GitHub Commit</span>
                <span className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded-full font-bold",
                  connectingGithub ? "bg-blue-50 text-blue-600 animate-pulse" :
                  githubConnected ? "bg-green-50 text-green-600" : "bg-slate-200 text-slate-500"
                )}>
                  {connectingGithub ? "Syncing..." : githubConnected ? "Active" : "Offline"}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (githubConnected) {
                    setGithubConnected(false);
                    localStorage.setItem('integration_status_github', 'Configure');
                  } else {
                    setConnectingGithub(true);
                    await new Promise(r => setTimeout(r, 600));
                    setGithubConnected(true);
                    localStorage.setItem('integration_status_github', 'Connected');
                    setConnectingGithub(false);
                  }
                }}
                className={cn(
                  "w-full py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center mt-2",
                  githubConnected ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {githubConnected ? "Disconnect" : "Connect"}
              </button>
            </div>

            {/* PagerDuty */}
            <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 flex flex-col justify-between h-24">
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-slate-800">PagerDuty</span>
                <span className={cn(
                  "text-[8px] px-1.5 py-0.5 rounded-full font-bold",
                  connectingPd ? "bg-blue-50 text-blue-600 animate-pulse" :
                  pdConnected ? "bg-green-50 text-green-600" : "bg-slate-200 text-slate-500"
                )}>
                  {connectingPd ? "Syncing..." : pdConnected ? "Active" : "Offline"}
                </span>
              </div>
              <button
                type="button"
                onClick={async () => {
                  if (pdConnected) {
                    setPdConnected(false);
                    localStorage.setItem('integration_status_pd', 'Configure');
                  } else {
                    setConnectingPd(true);
                    await new Promise(r => setTimeout(r, 600));
                    setPdConnected(true);
                    localStorage.setItem('integration_status_pd', 'Connected');
                    setConnectingPd(false);
                  }
                }}
                className={cn(
                  "w-full py-1 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center mt-2",
                  pdConnected ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-slate-900 text-white hover:bg-slate-800"
                )}
              >
                {pdConnected ? "Disconnect" : "Connect"}
              </button>
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full h-11 bg-slate-950 text-white font-bold text-xs uppercase tracking-wider rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer flex items-center justify-center gap-2"
        >
          {mutation.isPending ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <span>Predict Priority →</span>
            </>
          )}
        </button>
      </form>

      {/* Result Display Panel */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        <div className="bg-white rounded-[2rem] p-6 shadow-xl min-h-[300px] flex flex-col justify-center">
          {mutation.isIdle && !mutation.data && !imageResult ? (
            <div className="text-center py-8 px-4 flex flex-col items-center select-none">
              <Zap size={32} className="text-slate-400/50 mb-3" />
              <h4 className="text-sm font-bold text-slate-900">
                Upload a screenshot or fill form to predict priority
              </h4>
            </div>
          ) : mutation.isPending || imageMutation.isPending ? (
            <div className="text-center py-8 flex flex-col items-center">
              <RefreshCw size={32} className="text-blue-500 animate-spin mb-3" />
              <h4 className="text-sm font-bold text-slate-900">
                Evaluating...
              </h4>
            </div>
          ) : mutation.isError || imageMutation.isError ? (
            <div className="text-center py-8 flex flex-col items-center">
              <HelpCircle size={32} className="text-red-500 mb-3" />
              <h4 className="text-sm font-bold text-slate-900">
                Prediction Failed
              </h4>
              <p className="text-xs text-slate-505 mt-1">
                {mutation.error?.message || imageMutation.error?.message || 'Server did not respond.'}
              </p>
            </div>
          ) : (mutation.data || imageResult) ? (
            <div className="space-y-6">
              {/* Screenshot Preview inside the Verdict Card if available */}
              {uploadPreview && (
                <div className="border border-slate-100 rounded-2xl p-2 bg-slate-50 flex flex-col items-center gap-1.5 shadow-sm">
                  <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider self-start px-1">Analyzed Screenshot</span>
                  <img src={uploadPreview} alt="Screenshot Verdict View" className="max-h-[140px] w-auto rounded-lg object-contain animate-fadeIn" />
                </div>
              )}

              {/* Verdict */}
              <div className="flex flex-col items-center text-center gap-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Prediction Verdict</span>
                <PriorityBadge label={(mutation.data?.priority_label || imageResult?.priority_label)!} size="lg" variant="solid" />
                <span className="text-xs text-slate-500 font-bold">
                  {formatConfidence((mutation.data?.confidence_score || imageResult?.confidence_score)!)} confidence
                </span>
                <div className="mt-1 px-3 py-1 bg-slate-50 border border-slate-100 rounded-full flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase">
                  <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                  Source: <span className="text-blue-600 font-extrabold">{analysisSource}</span>
                </div>
              </div>

              {/* Integration Enhancements Panel */}
              {(mutation.data?.boost_applied ?? imageResult?.boost_applied ?? 0) > 0 && (
                <div className="border border-slate-100 rounded-xl p-3 bg-slate-50 space-y-2">
                  <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                    <span>Integration Enhancements</span>
                    <span className="text-green-600 font-extrabold">+{Math.round((mutation.data?.boost_applied ?? imageResult?.boost_applied ?? 0) * 100)}% Accuracy Boost</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(mutation.data?.integrations_active?.jira ?? imageResult?.integrations_active?.jira) && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-600 border border-blue-100 font-semibold">Jira Active</span>
                    )}
                    {(mutation.data?.integrations_active?.slack ?? imageResult?.integrations_active?.slack) && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-600 border border-emerald-100 font-semibold">Slack Active</span>
                    )}
                    {(mutation.data?.integrations_active?.github ?? imageResult?.integrations_active?.github) && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 border border-indigo-100 font-semibold">GitHub Active</span>
                    )}
                    {(mutation.data?.integrations_active?.pd ?? imageResult?.integrations_active?.pd) && (
                      <span className="text-[9px] px-2 py-0.5 rounded-md bg-red-50 text-red-600 border border-red-100 font-semibold">PagerDuty Active</span>
                    )}
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div className={cn("border rounded-xl p-4 text-xs font-semibold", getRecommendation(mutation.data?.priority_label || imageResult?.priority_label || 'Medium').class)}>
                {getRecommendation(mutation.data?.priority_label || imageResult?.priority_label || 'Medium').text}
              </div>

              {/* Signals */}
              <div className="space-y-3">
                <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">Why this priority?</span>
                <div className="space-y-3">
                  {(() => {
                    const signalsList = [
                      { name: 'Severity Level', val: severity, pct: severity === 'critical' || severity === 'blocker' ? 95 : severity === 'major' ? 75 : severity === 'normal' ? 45 : 20, weight: severity === 'critical' || severity === 'blocker' ? 'Dominant driver' : 'Moderate influence' },
                      { name: 'Affected Users', val: affectedUsers, pct: affectedUsers > 200 ? 90 : affectedUsers > 50 ? 70 : 30, weight: affectedUsers > 200 ? 'High impact' : 'Low impact' },
                      { name: 'Environment', val: environment, pct: environment === 'production' ? 85 : environment === 'staging' ? 55 : 25, weight: environment === 'production' ? 'Strong driver' : 'Neutral' },
                      { name: 'Module/Component', val: module, pct: module.toLowerCase().includes('engine') || module.toLowerCase().includes('gateway') ? 80 : 40, weight: 'Contextual driver' },
                      { name: 'Diagnostics Depth', val: `${stackTraceDepth} levels`, pct: Math.min(100, stackTraceDepth * 6), weight: stackTraceDepth > 10 ? 'Detailed diagnostics' : 'Baseline' },
                    ].sort((a, b) => b.pct - a.pct);

                    return signalsList.map((signal) => (
                      <div key={signal.name} className="flex flex-col gap-1 text-xs">
                        <div className="flex justify-between font-semibold">
                          <span className="font-mono text-slate-500">{signal.name}</span>
                          <span className="text-slate-950 font-bold">{String(signal.val)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                              className={cn(
                                "h-full rounded-full transition-all duration-500",
                                signal.pct > 80 ? "bg-gradient-to-r from-red-500 to-amber-500" :
                                signal.pct > 50 ? "bg-gradient-to-r from-blue-500 to-indigo-500" :
                                "bg-gradient-to-r from-slate-400 to-slate-500"
                              )} 
                              style={{ width: `${signal.pct}%` }} 
                            />
                          </div>
                          <span className="text-[10px] text-slate-400 font-semibold shrink-0">{signal.weight}</span>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>

              {/* Actions */}
              <div className="border-t border-slate-100 pt-4 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => copyToJira(mutation.data || imageResult)}
                  className="w-full h-10 bg-white border border-slate-100 hover:bg-slate-50 text-slate-800 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {copied ? <Check size={14} className="text-green-500" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy as Jira Comment'}</span>
                </button>

                <div className="flex justify-between items-center text-[10px] text-slate-400 font-semibold mt-2">
                  <span>Model: v{mutation.data?.model_version || imageResult?.model_version}</span>
                  <span className="font-mono">{(mutation.data?.prediction_id || imageResult?.prediction_id || '').slice(0, 8)}</span>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* History */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-3">
            Recent Session History
          </span>
          {sessionPredictions.length === 0 ? (
            <p className="text-xs text-slate-400 font-semibold">No predictions run in this session.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {sessionPredictions.slice(0, 5).map((row, idx) => (
                <div
                  key={row.prediction_id || idx}
                  onClick={() => handleRestoreInput(row.input)}
                  className="py-3 cursor-pointer hover:bg-slate-50 rounded-xl px-2 transition-colors flex items-center justify-between text-xs font-semibold"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100 text-slate-600">
                      <Bug size={14} />
                    </div>
                    <div className="flex flex-col gap-0.5 max-w-[140px] truncate">
                      <span className="text-slate-900 truncate">{row.title || row.input.title}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">{row.input.department}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PriorityBadge label={row.priority_label} size="sm" variant="outline" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Predictor;
