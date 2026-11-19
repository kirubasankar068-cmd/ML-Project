import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  UploadCloud,
  FileText,
  Image as ImageIcon,
  Play,
  Pause,
  Square,
  Copy,
  Check,
  Search,
  Filter,
  Download,
  Moon,
  Sun,
  ShieldAlert,
  Zap,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Volume2,
  Code,
  Layers,
  Sparkles,
  ArrowRight,
  Clock,
  RefreshCw,
  FileCode
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line
} from 'recharts';

import { api } from '../lib/api';
import { cn } from '../lib/utils';

export interface AnalysisResult {
  id?: string;
  bug_title: string;
  category: string;
  severity: string;
  priority: string;
  priority_reason: string;
  confidence: number;
  root_cause: string;
  exact_solution: {
    steps: string[];
    code_fix: string;
  };
  alternative_solutions: Array<{
    approach: string;
    pros: string;
    cons: string;
  }>;
  prevention_tips: string[];
  voice_summary: string;
  created_at?: string;
}

export const SolutionDashboard: React.FC = () => {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(true);

  // Input states
  const [textInput, setTextInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Analysis result state
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeAltTab, setActiveAltTab] = useState<number>(0);

  // History & Filter states
  const [historyList, setHistoryList] = useState<AnalysisResult[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [severityFilter, setSeverityFilter] = useState('ALL');

  // Voice Player states
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speechRate, setSpeechRate] = useState<number>(1.0);
  const [selectedLang, setSelectedLang] = useState<string>('en-US');
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Load history on mount
  const { data: historyData, refetch: refetchHistory } = useQuery({
    queryKey: ['ai-analyzer-history'],
    queryFn: () => api.getAnalyzerHistory(50),
  });

  useEffect(() => {
    if (historyData && historyData.length > 0) {
      setHistoryList(historyData);
      if (!currentAnalysis) {
        setCurrentAnalysis(historyData[0]);
      }
    }
  }, [historyData]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      const name = droppedFile.name.toLowerCase();

      if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) {
        setSelectedImage(droppedFile);
      } else {
        setSelectedFile(droppedFile);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, type: 'file' | 'image') => {
    if (e.target.files && e.target.files[0]) {
      if (type === 'file') setSelectedFile(e.target.files[0]);
      else setSelectedImage(e.target.files[0]);
    }
  };

  // Run AI Analysis
  const handleAnalyze = async () => {
    if (!textInput.trim() && !selectedFile && !selectedImage) {
      setErrorMsg('Please enter text, attach a document file, or upload a photo.');
      return;
    }

    setErrorMsg(null);
    setAnalyzing(true);
    stopSpeech();

    try {
      const result = await api.analyzeBugWithAI({
        text_input: textInput || undefined,
        file: selectedFile || undefined,
        image: selectedImage || undefined,
      });

      setCurrentAnalysis(result);
      setHistoryList((prev) => [result, ...prev]);
      refetchHistory();
    } catch (err: any) {
      setErrorMsg(err.message || 'Analysis failed. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  // Copy Code Handler
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Speech Handlers
  const playSpeech = () => {
    if (!currentAnalysis?.voice_summary) return;
    if (!('speechSynthesis' in window)) {
      alert('Text-to-Speech is not supported in your browser.');
      return;
    }

    if (isPaused) {
      window.speechSynthesis.resume();
      setIsPlaying(true);
      setIsPaused(false);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(currentAnalysis.voice_summary);
    utterance.rate = speechRate;
    utterance.lang = selectedLang;

    utterance.onend = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utterance.onerror = () => {
      setIsPlaying(false);
      setIsPaused(false);
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
    setIsPlaying(true);
    setIsPaused(false);
  };

  const pauseSpeech = () => {
    if ('speechSynthesis' in window && isPlaying) {
      window.speechSynthesis.pause();
      setIsPlaying(false);
      setIsPaused(true);
    }
  };

  const stopSpeech = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsPlaying(false);
      setIsPaused(false);
    }
  };

  // Export PDF Report Handler
  const handleExportPDF = () => {
    if (!currentAnalysis) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Smart Bug Analyzer - ${currentAnalysis.bug_title}</title>
          <style>
            body { font-family: sans-serif; padding: 30px; color: #1e293b; }
            h1 { color: #0f172a; border-bottom: 2px solid #3b82f6; padding-bottom: 8px; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 6px; font-weight: bold; font-size: 12px; margin-right: 8px; }
            .critical { background: #fee2e2; color: #991b1b; }
            .high { background: #ffedd5; color: #9a3412; }
            .medium { background: #fef9c3; color: #854d0e; }
            .low { background: #dcfce7; color: #166534; }
            .section { margin-top: 24px; padding: 16px; background: #f8fafc; border-radius: 12px; border: 1px solid #e2e8f0; }
            pre { background: #0f172a; color: #38bdf8; padding: 14px; border-radius: 8px; overflow-x: auto; }
            ul { padding-left: 20px; }
          </style>
        </head>
        <body>
          <h1>Smart Bug Analyzer - Triage Report</h1>
          <p><strong>Report ID:</strong> ${currentAnalysis.id || 'ANALYSIS-001'}</p>
          <p><strong>Date:</strong> ${currentAnalysis.created_at ? new Date(currentAnalysis.created_at).toLocaleString() : new Date().toLocaleString()}</p>
          <h2>${currentAnalysis.bug_title}</h2>
          <div>
            <span class="badge ${currentAnalysis.severity.toLowerCase()}">${currentAnalysis.severity} Severity</span>
            <span class="badge medium">Priority ${currentAnalysis.priority}</span>
            <span class="badge low">Category: ${currentAnalysis.category}</span>
            <span class="badge low">Confidence: ${currentAnalysis.confidence}%</span>
          </div>

          <div class="section">
            <h3>Root Cause Analysis</h3>
            <p>${currentAnalysis.root_cause}</p>
          </div>

          <div class="section">
            <h3>Exact Solution Steps</h3>
            <ul>
              ${currentAnalysis.exact_solution.steps.map((s) => `<li>${s}</li>`).join('')}
            </ul>
            ${currentAnalysis.exact_solution.code_fix ? `<h4>Code Fix / Command</h4><pre><code>${currentAnalysis.exact_solution.code_fix}</code></pre>` : ''}
          </div>

          <div class="section">
            <h3>Alternative Approaches</h3>
            ${currentAnalysis.alternative_solutions.map((a) => `
              <p><strong>${a.approach}</strong></p>
              <p><em>Pros:</em> ${a.pros}</p>
              <p><em>Cons:</em> ${a.cons}</p>
            `).join('')}
          </div>

          <div class="section">
            <h3>Prevention Best Practices</h3>
            <ul>
              ${currentAnalysis.prevention_tips.map((t) => `<li>${t}</li>`).join('')}
            </ul>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 500);
  };

  // Filtered History
  const filteredHistory = historyList.filter((item) => {
    const matchesSearch =
      !searchTerm ||
      item.bug_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.root_cause.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || item.category === categoryFilter;
    const matchesSeverity = severityFilter === 'ALL' || item.severity === severityFilter;
    return matchesSearch && matchesCategory && matchesSeverity;
  });

  // Chart Data Calculations
  const categoryCounts = historyList.reduce((acc: Record<string, number>, item) => {
    acc[item.category] = (acc[item.category] || 0) + 1;
    return acc;
  }, {});

  const categoryChartData = Object.keys(categoryCounts).map((cat) => ({
    name: cat,
    count: categoryCounts[cat],
  }));

  const severityCounts = historyList.reduce((acc: Record<string, number>, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});

  const severityChartData = [
    { name: 'Critical', count: severityCounts['Critical'] || 0, color: '#ef4444' },
    { name: 'High', count: severityCounts['High'] || 0, color: '#f97316' },
    { name: 'Medium', count: severityCounts['Medium'] || 0, color: '#eab308' },
    { name: 'Low', count: severityCounts['Low'] || 0, color: '#22c55e' },
  ];

  return (
    <div className={cn("min-h-screen transition-colors duration-200 pb-16", isDarkMode ? "bg-slate-950 text-slate-100" : "bg-slate-50 text-slate-800")}>
      
      {/* ── Top Header Controls ── */}
      <div className={cn("border-b px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none", isDarkMode ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-white")}>
        <div>
          <div className="flex items-center gap-2">
            <span className="bg-blue-500/20 text-blue-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-blue-500/30 flex items-center gap-1">
              <Sparkles size={12} />
              AI Solution Engine
            </span>
            <span className="bg-emerald-500/20 text-emerald-400 text-xs px-2.5 py-0.5 rounded-full font-bold border border-emerald-500/30">
              Active Triage Engine
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight mt-1">Smart Bug Analyzer — Solution Dashboard</h1>
          <p className="text-xs text-slate-400 font-medium">
            Multi-modal file & photo bug identification, step-by-step fix recommendations, and voice narration.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            className={cn("p-2.5 rounded-xl border transition-colors cursor-pointer flex items-center gap-2 text-xs font-bold", isDarkMode ? "bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700" : "bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200")}
          >
            {isDarkMode ? <Sun size={16} className="text-amber-400" /> : <Moon size={16} className="text-slate-600" />}
            <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
          </button>

          {currentAnalysis && (
            <button
              onClick={handleExportPDF}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 shadow-lg shadow-blue-600/30 cursor-pointer"
            >
              <Download size={14} />
              <span>Export PDF Report</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 pt-6 space-y-8">
        
        {/* ── Section 1: Drag & Drop Multi-Modal File & Photo Input Panel ── */}
        <div className={cn("p-6 rounded-3xl border shadow-xl transition-all", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
          <h2 className="text-sm font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2 mb-4">
            <UploadCloud size={18} />
            <span>1. File, Photo & Text Bug Intake</span>
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Text Input Area */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-3">
              <label className="text-xs font-bold text-slate-400">Paste Error Log, Stack Trace, or Description</label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder="Paste code snippet, stack trace log, or error details here... (e.g. Exception in thread 'main' java.lang.NullPointerException at com.example.App.main)"
                rows={6}
                className={cn("w-full p-4 rounded-2xl border font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-colors", isDarkMode ? "bg-slate-950 border-slate-800 text-slate-200 placeholder-slate-600" : "bg-slate-50 border-slate-200 text-slate-800 placeholder-slate-400")}
              />
            </div>

            {/* Right: Drag & Drop Dropzone for Files & Photos */}
            <div className="lg:col-span-5 flex flex-col justify-between space-y-3">
              <label className="text-xs font-bold text-slate-400">Upload Files & Photos (.txt, .log, .json, .csv, .pdf, .docx, .png, .jpg)</label>

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onLeave={handleDrag}
                onDrop={handleDrop}
                className={cn(
                  "border-2 border-dashed rounded-2xl p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer relative min-h-[140px]",
                  dragActive ? "border-blue-500 bg-blue-500/10" : isDarkMode ? "border-slate-800 bg-slate-950 hover:border-slate-700" : "border-slate-200 bg-slate-50 hover:border-slate-300"
                )}
              >
                <UploadCloud size={32} className="text-blue-500 mb-2 animate-bounce" />
                <p className="text-xs font-bold text-slate-300">Drag & drop files or photos here</p>
                <p className="text-[10px] text-slate-500 mt-1">Supports: .log, .txt, .pdf, .docx, .json, .csv, .png, .jpg</p>

                <div className="flex gap-2 mt-3">
                  <label className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1">
                    <FileText size={12} />
                    <span>Attach File</span>
                    <input type="file" accept=".txt,.log,.json,.csv,.pdf,.docx" onChange={(e) => handleFileChange(e, 'file')} className="hidden" />
                  </label>

                  <label className="bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1">
                    <ImageIcon size={12} />
                    <span>Upload Photo</span>
                    <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => handleFileChange(e, 'image')} className="hidden" />
                  </label>
                </div>
              </div>

              {/* Selected File Badges */}
              {(selectedFile || selectedImage) && (
                <div className="flex flex-wrap gap-2 text-xs font-semibold">
                  {selectedFile && (
                    <span className="bg-blue-500/20 text-blue-300 px-3 py-1 rounded-lg border border-blue-500/30 flex items-center gap-1.5">
                      <FileText size={12} />
                      {selectedFile.name}
                      <button onClick={() => setSelectedFile(null)} className="ml-1 text-red-400 hover:text-red-300">×</button>
                    </span>
                  )}
                  {selectedImage && (
                    <span className="bg-purple-500/20 text-purple-300 px-3 py-1 rounded-lg border border-purple-500/30 flex items-center gap-1.5">
                      <ImageIcon size={12} />
                      {selectedImage.name}
                      <button onClick={() => setSelectedImage(null)} className="ml-1 text-red-400 hover:text-red-300">×</button>
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          {errorMsg && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs font-bold flex items-center gap-2">
              <AlertTriangle size={16} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="mt-5 flex justify-end">
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={cn(
                "px-8 py-3.5 rounded-2xl font-bold text-xs shadow-xl transition-all flex items-center gap-2 cursor-pointer",
                analyzing ? "bg-slate-700 text-slate-400 cursor-not-allowed" : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-600/30"
              )}
            >
              {analyzing ? (
                <>
                  <RefreshCw size={16} className="animate-spin" />
                  <span>Executing Multi-Modal AI Analysis...</span>
                </>
              ) : (
                <>
                  <Zap size={16} />
                  <span>Analyze Bug & Generate Solution</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* ── Section 2: Bug Summary Card & Analytics Section ── */}
        {currentAnalysis && (
          <div className="space-y-6">
            
            {/* Header Summary Card */}
            <div className={cn("p-6 rounded-3xl border shadow-xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-center", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
              <div className="lg:col-span-8 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn(
                    "text-xs px-3 py-1 rounded-full font-black border uppercase tracking-wider",
                    currentAnalysis.severity === 'Critical' ? "bg-red-500/20 text-red-400 border-red-500/30" :
                    currentAnalysis.severity === 'High' ? "bg-orange-500/20 text-orange-400 border-orange-500/30" :
                    currentAnalysis.severity === 'Medium' ? "bg-amber-500/20 text-amber-400 border-amber-500/30" :
                    "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                  )}>
                    {currentAnalysis.severity} Severity
                  </span>

                  <span className="bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full font-black border border-indigo-500/30">
                    Priority {currentAnalysis.priority}
                  </span>

                  <span className="bg-slate-800 text-slate-300 text-xs px-3 py-1 rounded-full font-bold border border-slate-700">
                    {currentAnalysis.category}
                  </span>
                </div>

                <h2 className="text-xl font-black text-slate-100">{currentAnalysis.bug_title}</h2>
                <p className="text-xs text-slate-400 font-semibold">{currentAnalysis.priority_reason}</p>
              </div>

              {/* Confidence Meter Box */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-950/60 rounded-2xl border border-slate-800 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">AI Confidence Score</span>
                <div className="text-3xl font-black text-blue-400 mt-1 font-mono">{currentAnalysis.confidence}%</div>
                <div className="w-full bg-slate-800 h-2 rounded-full mt-2 overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      currentAnalysis.confidence >= 80 ? "bg-emerald-500" : currentAnalysis.confidence >= 70 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${currentAnalysis.confidence}%` }}
                  />
                </div>
                {currentAnalysis.confidence < 70 && (
                  <p className="text-[10px] text-amber-400 font-bold mt-1.5 flex items-center gap-1">
                    <AlertTriangle size={10} />
                    <span>Confidence &lt; 70%: Review required</span>
                  </p>
                )}
              </div>
            </div>

            {/* ── Section 3: Root Cause & Solution Details Grid ── */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Column: Root Cause & Exact Solution (8 Cols) */}
              <div className="lg:col-span-8 space-y-6">
                
                {/* Root Cause Card */}
                <div className={cn("p-6 rounded-3xl border shadow-xl space-y-3", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                    <HelpCircle size={16} />
                    <span>2. Identified Root Cause & Assumptions</span>
                  </h3>
                  <p className="text-xs font-medium text-slate-300 leading-relaxed whitespace-pre-line">
                    {currentAnalysis.root_cause}
                  </p>
                </div>

                {/* Exact Solution Card */}
                <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <CheckCircle2 size={16} />
                    <span>3. Exact Step-by-Step Fix Solution</span>
                  </h3>

                  {/* Steps List */}
                  <div className="space-y-2">
                    {currentAnalysis.exact_solution.steps.map((step, idx) => (
                      <div key={idx} className="flex items-start gap-3 p-3 bg-slate-950/40 rounded-xl border border-slate-800/80 text-xs font-semibold text-slate-200">
                        <span className="h-5 w-5 rounded-full bg-blue-500/20 text-blue-400 text-[10px] font-bold flex items-center justify-center shrink-0 border border-blue-500/30">
                          {idx + 1}
                        </span>
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>

                  {/* Copyable Code Fix Block */}
                  {currentAnalysis.exact_solution.code_fix && (
                    <div className="mt-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                          <Code size={14} className="text-blue-400" />
                          <span>Corrected Code / Configuration Fix</span>
                        </span>
                        <button
                          onClick={() => handleCopyCode(currentAnalysis.exact_solution.code_fix)}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                          <span>{copied ? 'Copied!' : 'Copy Code'}</span>
                        </button>
                      </div>

                      <pre className="p-4 rounded-2xl bg-slate-950 border border-slate-800 font-mono text-xs text-blue-300 overflow-x-auto">
                        <code>{currentAnalysis.exact_solution.code_fix}</code>
                      </pre>
                    </div>
                  )}
                </div>

                {/* Alternative Solutions Card */}
                {currentAnalysis.alternative_solutions && currentAnalysis.alternative_solutions.length > 0 && (
                  <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-2">
                      <Layers size={16} />
                      <span>4. Alternative Solution Approaches</span>
                    </h3>

                    {/* Tab selection */}
                    <div className="flex gap-2 border-b border-slate-800 pb-2">
                      {currentAnalysis.alternative_solutions.map((alt, idx) => (
                        <button
                          key={idx}
                          onClick={() => setActiveAltTab(idx)}
                          className={cn(
                            "px-4 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer",
                            activeAltTab === idx ? "bg-purple-600 text-white shadow-md shadow-purple-600/30" : "bg-slate-800/60 text-slate-400 hover:text-slate-200"
                          )}
                        >
                          Approach #{idx + 1}
                        </button>
                      ))}
                    </div>

                    {/* Tab content */}
                    {currentAnalysis.alternative_solutions[activeAltTab] && (
                      <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3 text-xs">
                        <h4 className="font-bold text-purple-300 text-sm">{currentAnalysis.alternative_solutions[activeAltTab].approach}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-emerald-400">Pros / Benefits</span>
                            <p className="font-semibold text-emerald-200">{currentAnalysis.alternative_solutions[activeAltTab].pros}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 space-y-1">
                            <span className="text-[10px] uppercase font-bold text-red-400">Cons / Tradeoffs</span>
                            <p className="font-semibold text-red-200">{currentAnalysis.alternative_solutions[activeAltTab].cons}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right Column: Voice Player & Prevention Best Practices (4 Cols) */}
              <div className="lg:col-span-4 space-y-6">
                
                {/* Voice Player Widget */}
                <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                    <Volume2 size={16} />
                    <span>5. AI Audio Voice Summary</span>
                  </h3>

                  <p className="text-xs font-medium text-slate-300 bg-slate-950/60 p-3 rounded-2xl border border-slate-800 leading-relaxed italic">
                    "{currentAnalysis.voice_summary}"
                  </p>

                  {/* Player Controls */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-center gap-3">
                      {!isPlaying ? (
                        <button
                          onClick={playSpeech}
                          className="h-12 w-12 rounded-full bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 cursor-pointer transition-transform hover:scale-105"
                        >
                          <Play size={18} className="ml-0.5" />
                        </button>
                      ) : (
                        <button
                          onClick={pauseSpeech}
                          className="h-12 w-12 rounded-full bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center shadow-lg shadow-amber-600/30 cursor-pointer transition-transform hover:scale-105"
                        >
                          <Pause size={18} />
                        </button>
                      )}

                      <button
                        onClick={stopSpeech}
                        className="h-10 w-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center border border-slate-700 cursor-pointer"
                      >
                        <Square size={14} />
                      </button>
                    </div>

                    {/* Speed & Language Pickers */}
                    <div className="grid grid-cols-2 gap-2 text-xs pt-2">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Speed</label>
                        <select
                          value={speechRate}
                          onChange={(e) => setSpeechRate(parseFloat(e.target.value))}
                          className="w-full mt-1 p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold focus:outline-none"
                        >
                          <option value={0.75}>0.75x</option>
                          <option value={1.0}>1.0x (Normal)</option>
                          <option value={1.25}>1.25x</option>
                          <option value={1.5}>1.5x</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Language</label>
                        <select
                          value={selectedLang}
                          onChange={(e) => setSelectedLang(e.target.value)}
                          className="w-full mt-1 p-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold focus:outline-none"
                        >
                          <option value="en-US">English (US)</option>
                          <option value="es-ES">Spanish</option>
                          <option value="fr-FR">French</option>
                          <option value="de-DE">German</option>
                          <option value="ja-JP">Japanese</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Prevention Tips */}
                <div className={cn("p-6 rounded-3xl border shadow-xl space-y-3", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                    <ShieldAlert size={16} />
                    <span>6. Prevention Best Practices</span>
                  </h3>
                  <div className="space-y-2">
                    {currentAnalysis.prevention_tips.map((tip, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 text-xs font-medium text-slate-300">
                        <CheckCircle2 size={14} className="text-emerald-400 shrink-0 mt-0.5" />
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Section 3.5: Error Category & Level Separation Layout Cards ── */}
        <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4 select-none", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                <Layers size={16} />
                <span>Error Level & Category Separator Console</span>
              </h3>
              <p className="text-xs text-slate-400 font-semibold mt-0.5">Filter & group triage reports by Error Level (Critical/High/Med/Low) or Category type.</p>
            </div>

            {/* Category Quick Filter Pills */}
            <div className="flex flex-wrap gap-1.5">
              {['ALL', 'Syntax', 'Runtime', 'Logic', 'Performance', 'Security', 'UI/UX', 'Database', 'Network', 'Configuration', 'Dependency'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setCategoryFilter(cat)}
                  className={cn(
                    "text-[10px] font-bold px-3 py-1 rounded-full transition-all cursor-pointer border",
                    categoryFilter === cat
                      ? "bg-blue-600 text-white border-blue-500 shadow-sm"
                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* 4 Error Level Layout Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-2">
            {/* Critical Level Card */}
            <div
              onClick={() => setSeverityFilter(severityFilter === 'Critical' ? 'ALL' : 'Critical')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between",
                severityFilter === 'Critical' ? "bg-red-500/20 border-red-500/50 shadow-lg shadow-red-500/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-red-400 tracking-wider">Critical Level (P1)</span>
                <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse"></span>
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-red-300">{severityCounts['Critical'] || 0}</span>
                <p className="text-[10px] text-slate-400 mt-0.5">System outage & fatal crashes</p>
              </div>
            </div>

            {/* High Level Card */}
            <div
              onClick={() => setSeverityFilter(severityFilter === 'High' ? 'ALL' : 'High')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between",
                severityFilter === 'High' ? "bg-orange-500/20 border-orange-500/50 shadow-lg shadow-orange-500/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-orange-400 tracking-wider">High Level (P2)</span>
                <ShieldAlert size={16} className="text-orange-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-orange-300">{severityCounts['High'] || 0}</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Major feature disruptions</p>
              </div>
            </div>

            {/* Medium Level Card */}
            <div
              onClick={() => setSeverityFilter(severityFilter === 'Medium' ? 'ALL' : 'Medium')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between",
                severityFilter === 'Medium' ? "bg-amber-500/20 border-amber-500/50 shadow-lg shadow-amber-500/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider">Medium Level (P3)</span>
                <AlertTriangle size={16} className="text-amber-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-amber-300">{severityCounts['Medium'] || 0}</span>
                <p className="text-[10px] text-slate-400 mt-0.5">UI glitches & non-blocking bugs</p>
              </div>
            </div>

            {/* Low Level Card */}
            <div
              onClick={() => setSeverityFilter(severityFilter === 'Low' ? 'ALL' : 'Low')}
              className={cn(
                "p-4 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between",
                severityFilter === 'Low' ? "bg-emerald-500/20 border-emerald-500/50 shadow-lg shadow-emerald-500/10" : "bg-slate-950/40 border-slate-800 hover:border-slate-700"
              )}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Low Level (P4)</span>
                <CheckCircle2 size={16} className="text-emerald-400" />
              </div>
              <div className="mt-3">
                <span className="text-2xl font-black text-emerald-300">{severityCounts['Low'] || 0}</span>
                <p className="text-[10px] text-slate-400 mt-0.5">Cosmetic issues & info logs</p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Section 4: Analytics Charts & Historical Bugs List ── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Charts (5 Cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-blue-400 flex items-center gap-2">
                <FileCode size={16} />
                <span>Bugs Distribution by Category</span>
              </h3>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={categoryChartData}>
                    <XAxis dataKey="name" stroke="#64748b" fontSize={10} />
                    <YAxis stroke="#64748b" fontSize={10} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }} />
                    <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <ShieldAlert size={16} />
                <span>Bugs Breakdown by Severity</span>
              </h3>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={severityChartData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={60} label>
                      {severityChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderRadius: '8px', border: '1px solid #1e293b' }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Historical Bugs Searchable Table (7 Cols) */}
          <div className="lg:col-span-7">
            <div className={cn("p-6 rounded-3xl border shadow-xl space-y-4", isDarkMode ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200")}>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
                  <Clock size={16} />
                  <span>Analyzed Bug History ({filteredHistory.length})</span>
                </h3>

                {/* Filters */}
                <div className="flex gap-2">
                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="p-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-bold text-slate-300"
                  >
                    <option value="ALL">All Categories</option>
                    <option value="Syntax">Syntax</option>
                    <option value="Runtime">Runtime</option>
                    <option value="Logic">Logic</option>
                    <option value="Performance">Performance</option>
                    <option value="Security">Security</option>
                    <option value="UI/UX">UI/UX</option>
                    <option value="Database">Database</option>
                    <option value="Network">Network</option>
                    <option value="Configuration">Configuration</option>
                  </select>

                  <select
                    value={severityFilter}
                    onChange={(e) => setSeverityFilter(e.target.value)}
                    className="p-1.5 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-bold text-slate-300"
                  >
                    <option value="ALL">All Severities</option>
                    <option value="Critical">Critical</option>
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-3 text-slate-500" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search history by title, category, or root cause..."
                  className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs font-medium text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* History Table */}
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredHistory.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500 font-semibold">
                    No analyzed bugs found matching your query.
                  </div>
                ) : (
                  filteredHistory.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      onClick={() => setCurrentAnalysis(item)}
                      className={cn(
                        "p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4",
                        currentAnalysis?.id === item.id ? "border-blue-500 bg-blue-500/10" : "border-slate-800/80 bg-slate-950/40 hover:bg-slate-800/40"
                      )}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "text-[9px] px-2 py-0.5 rounded font-bold uppercase",
                            item.severity === 'Critical' ? "bg-red-500/20 text-red-400" :
                            item.severity === 'High' ? "bg-orange-500/20 text-orange-400" :
                            item.severity === 'Medium' ? "bg-amber-500/20 text-amber-400" :
                            "bg-emerald-500/20 text-emerald-400"
                          )}>
                            {item.severity}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">{item.priority}</span>
                          <span className="text-[10px] text-slate-500 font-bold">{item.category}</span>
                        </div>
                        <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{item.bug_title}</h4>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-mono font-bold text-blue-400">{item.confidence}%</span>
                        <ArrowRight size={14} className="text-slate-600" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default SolutionDashboard;
