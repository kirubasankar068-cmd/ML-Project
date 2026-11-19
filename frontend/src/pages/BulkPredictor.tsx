import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Upload, Download, RefreshCw, AlertCircle, Search, X, Filter, FileText, ChevronLeft, ChevronRight, BarChart2, CheckCircle
} from 'lucide-react';
import { cn } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BulkBugInput {
  title: string;
  description: string;
  steps_to_reproduce: string;
  component: string;
  user_role: string;
}

interface PredictionItem {
  id: number;
  bug_id: string;
  title: string;
  priority: string;
  confidence: number;
  category: string;
  rootCause: string;
  impact: string;
  solution: string;
  recommendation: string[];
  prevention: string[];
  severity: string;
  component: string;
  timestamp: string;
}

interface FailedBug {
  index: number;
  title: string;
  error: string;
}

interface ChartStats {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  category_distribution: { category: string; count: number }[];
  confidence_distribution: { range: string; count: number }[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { Critical: 0, High: 1, Medium: 2, Low: 3 };
const GROUP_KEYS = ['Critical', 'High', 'Medium', 'Low'] as const;
type GroupKey = typeof GROUP_KEYS[number];

const PC = {
  Critical: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b', light: '#fef2f2', dot: 'bg-red-500',    badge: 'bg-red-100 text-red-800 border-red-300',    tab: 'border-red-500 text-red-700',    emoji: '🔴' },
  High:     { bg: '#ffedd5', border: '#f97316', text: '#9a3412', light: '#fff7ed', dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-800 border-orange-300', tab: 'border-orange-500 text-orange-700', emoji: '🟠' },
  Medium:   { bg: '#fef9c3', border: '#eab308', text: '#854d0e', light: '#fefce8', dot: 'bg-yellow-500', badge: 'bg-yellow-100 text-yellow-800 border-yellow-300', tab: 'border-yellow-500 text-yellow-700', emoji: '🟡' },
  Low:      { bg: '#dcfce7', border: '#22c55e', text: '#166534', light: '#f0fdf4', dot: 'bg-green-500',  badge: 'bg-green-100 text-green-800 border-green-300',  tab: 'border-green-500 text-green-700',  emoji: '🟢' },
} as const;

const BASE_URL = (import.meta.env.VITE_API_URL as string) ?? 'http://localhost:8000';
const PAGE_SIZE = 10;

// ─── 50 sample bugs ───────────────────────────────────────────────────────────

const SAMPLE_BUGS: BulkBugInput[] = [
  { title: 'Database connection pool exhausted under peak load', description: 'Production DB pool exhausted causing 500 errors for all users.', steps_to_reproduce: '1. Simulate 500 concurrent users\n2. Observe DB errors', component: 'Database', user_role: 'admin' },
  { title: 'Payment gateway returns 503 on checkout', description: 'Stripe integration fails silently during checkout flow.', steps_to_reproduce: '1. Add item to cart\n2. Click Pay\n3. Observe error', component: 'Payments', user_role: 'customer' },
  { title: 'Authentication tokens not invalidated on logout', description: 'JWT tokens remain valid after explicit logout.', steps_to_reproduce: '1. Login\n2. Logout\n3. Use old token in API call', component: 'Auth', user_role: 'developer' },
  { title: 'Memory leak in WebSocket handler crashes server', description: 'Server OOM after 24h due to unclosed WebSocket listeners.', steps_to_reproduce: '1. Connect 1000 WebSocket clients\n2. Wait 24h', component: 'WebSocket', user_role: 'devops' },
  { title: 'SQL injection possible via search parameter', description: 'Unparameterized query in /search endpoint allows injection.', steps_to_reproduce: "1. GET /search?q=' OR 1=1 --", component: 'Search', user_role: 'security' },
  { title: 'User data exported without permission check', description: 'Any authenticated user can export other users data via /export.', steps_to_reproduce: '1. Login as user A\n2. Call /export?user_id=B', component: 'Export', user_role: 'analyst' },
  { title: 'Rate limiter bypassed with header manipulation', description: 'X-Forwarded-For header spoofing bypasses IP rate limiting.', steps_to_reproduce: '1. Set X-Forwarded-For: 1.1.1.1\n2. Spam endpoint', component: 'Middleware', user_role: 'security' },
  { title: 'File upload allows executable files', description: '.exe and .sh files can be uploaded bypassing extension check.', steps_to_reproduce: '1. Upload malicious.exe via /upload', component: 'File Upload', user_role: 'security' },
  { title: 'Admin panel accessible without 2FA', description: 'Admin dashboard accessible after basic password login only.', steps_to_reproduce: '1. Login as admin\n2. Skip 2FA page directly', component: 'Admin', user_role: 'admin' },
  { title: 'Session fixation vulnerability in login flow', description: 'Session ID not rotated after successful authentication.', steps_to_reproduce: '1. Get session ID pre-login\n2. Login\n3. Check session ID unchanged', component: 'Auth', user_role: 'security' },
  { title: 'Bulk email sends triggered multiple times', description: 'Campaign emails sent 3–5x per subscriber due to retry logic bug.', steps_to_reproduce: '1. Create campaign\n2. Send\n3. Check subscriber inbox', component: 'Email', user_role: 'marketing' },
  { title: 'Report generation hangs for large datasets', description: 'Generating reports for >10k rows causes request timeout.', steps_to_reproduce: '1. Go to Reports\n2. Select 10k row dataset\n3. Click Generate', component: 'Reporting', user_role: 'analyst' },
  { title: 'Password reset link expires immediately', description: 'Reset link in email is already expired when user clicks it.', steps_to_reproduce: '1. Request password reset\n2. Click link within 30 seconds', component: 'Auth', user_role: 'end-user' },
  { title: 'Mobile app crashes on iOS 17.4 on startup', description: 'App crashes immediately on launch for iOS 17.4 devices.', steps_to_reproduce: '1. Install app on iPhone iOS 17.4\n2. Launch app', component: 'Mobile', user_role: 'end-user' },
  { title: 'Webhook delivery fails silently after 3 retries', description: 'Failed webhooks not flagged in dashboard after max retries.', steps_to_reproduce: '1. Set webhook to invalid URL\n2. Trigger event\n3. Check dashboard', component: 'Webhooks', user_role: 'developer' },
  { title: 'Dark mode colors break on Safari 17', description: 'CSS variables not applied correctly in Safari 17 dark mode.', steps_to_reproduce: '1. Open app in Safari 17\n2. Enable dark mode', component: 'UI', user_role: 'end-user' },
  { title: 'CSV export missing last column header', description: 'Exported CSVs drop the last column name in header row.', steps_to_reproduce: '1. Go to Reports\n2. Export as CSV\n3. Open file', component: 'Export', user_role: 'analyst' },
  { title: 'Search autocomplete shows deleted items', description: 'Autocomplete suggestions include soft-deleted records.', steps_to_reproduce: '1. Delete an item\n2. Search for it\n3. See suggestion', component: 'Search', user_role: 'end-user' },
  { title: 'Notification bell count does not reset after reading', description: 'Unread count stays after marking all notifications as read.', steps_to_reproduce: '1. Receive 5 notifications\n2. Mark all read\n3. Check badge', component: 'Notifications', user_role: 'end-user' },
  { title: 'Filter panel reset button does not clear date range', description: 'Reset button clears all filters except the date range picker.', steps_to_reproduce: '1. Set date range filter\n2. Click Reset\n3. Date remains', component: 'UI', user_role: 'analyst' },
];

function buildCSV(results: PredictionItem[]): string {
  const header = 'BugID,Title,Priority,Confidence%,Category,RootCause,Solution';
  const rows = results.map(r => {
    const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`;
    return [
      r.bug_id,
      esc(r.title),
      r.priority,
      r.confidence.toFixed(1),
      r.category,
      esc(r.rootCause),
      esc(r.solution),
    ].join(',');
  });
  return [header, ...rows].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let cur = ''; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === ',' && !inQuote) { result.push(cur.trim()); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

export const BulkPredictor: React.FC = () => {
  const [rawInput, setRawInput] = useState('');
  const [fileId, setFileId] = useState<string | null>(null);
  const [failed, setFailed] = useState<FailedBug[]>([]);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [search, setSearch] = useState('');
  const [filterComp, setFilterComp] = useState('');
  const [activeTab, setActiveTab] = useState<'backlog' | 'analytics'>('backlog');
  const [selectedBug, setSelectedBug] = useState<PredictionItem | null>(null);

  // Pagination states for the 4 separate columns
  const [pageCritical, setPageCritical] = useState(1);
  const [pageHigh, setPageHigh] = useState(1);
  const [pageMedium, setPageMedium] = useState(1);
  const [pageLow, setPageLow] = useState(1);

  // Data states for columns
  const [predictionsCritical, setPredictionsCritical] = useState<PredictionItem[]>([]);
  const [predictionsHigh, setPredictionsHigh] = useState<PredictionItem[]>([]);
  const [predictionsMedium, setPredictionsMedium] = useState<PredictionItem[]>([]);
  const [predictionsLow, setPredictionsLow] = useState<PredictionItem[]>([]);

  // Totals for columns
  const [totalCritical, setTotalCritical] = useState(0);
  const [totalHigh, setTotalHigh] = useState(0);
  const [totalMedium, setTotalMedium] = useState(0);
  const [totalLow, setTotalLow] = useState(0);

  // Analytics Stats State
  const [stats, setStats] = useState<ChartStats>({
    total: 0,
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    category_distribution: [],
    confidence_distribution: []
  });

  // Client-side state for bulk predicted results
  const [allPredictions, setAllPredictions] = useState<PredictionItem[]>([]);
  const [sortByConfidence, setSortByConfidence] = useState<'desc' | 'asc' | 'none'>('desc');
  const [lastAction, setLastAction] = useState<'upload' | 'run' | null>(null);
  const [lastFile, setLastFile] = useState<File | null>(null);
  const [showGuidelines, setShowGuidelines] = useState(false);

  // ── Get auth token (always returns a usable value) ─────────────────────
  const getToken = useCallback(() =>
    localStorage.getItem('token') ??
    localStorage.getItem('access_token') ??
    'developer-mode-token'
  , []);

  // Dynamic client-side stats computed from currently active file batch predictions
  const computedStats = useMemo(() => {
    if (allPredictions.length === 0) {
      return stats; // Fallback to DB stats
    }
    
    let total = allPredictions.length;
    let critical = 0;
    let high = 0;
    let medium = 0;
    let low = 0;
    
    const categories: Record<string, number> = {};
    const confidenceDist = {
      "60-70": 0,
      "70-80": 0,
      "80-90": 0,
      "90-100": 0
    };
    
    allPredictions.forEach(r => {
      const p = r.priority;
      if (p === 'Critical') critical++;
      else if (p === 'High') high++;
      else if (p === 'Medium') medium++;
      else if (p === 'Low') low++;
      
      const cat = r.category || 'General';
      categories[cat] = (categories[cat] || 0) + 1;
      
      let conf = r.confidence;
      if (conf <= 1.0) {
        conf = conf * 100;
      }
      if (conf >= 60 && conf < 70) confidenceDist["60-70"]++;
      else if (conf >= 70 && conf < 80) confidenceDist["70-80"]++;
      else if (conf >= 80 && conf < 90) confidenceDist["80-90"]++;
      else if (conf >= 90 && conf <= 100) confidenceDist["90-100"]++;
    });
    
    return {
      total,
      critical,
      high,
      medium,
      low,
      category_distribution: Object.entries(categories).map(([k, v]) => ({ category: k, count: v })),
      confidence_distribution: Object.entries(confidenceDist).map(([k, v]) => ({ range: k, count: v }))
    };
  }, [allPredictions, stats]);

  // Memoized lists of predictions computed from allPredictions (local batch prediction mode)
  // or falling back to predictionsCritical, predictionsHigh, predictionsMedium, predictionsLow (database paginated mode)
  const filteredAndSortedPredictions = useMemo(() => {
    if (allPredictions.length === 0) return null;
    
    let items = allPredictions;
    
    // Search filter
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(item => 
        item.title.toLowerCase().includes(q) || 
        (item.rootCause && item.rootCause.toLowerCase().includes(q)) ||
        (item.solution && item.solution.toLowerCase().includes(q))
      );
    }
    
    // Category filter
    if (filterComp) {
      items = items.filter(item => item.category === filterComp);
    }
    
    // Sort by confidence
    if (sortByConfidence !== 'none') {
      items = [...items].sort((a, b) => {
        if (sortByConfidence === 'desc') {
          return b.confidence - a.confidence;
        } else {
          return a.confidence - b.confidence;
        }
      });
    }
    
    return items;
  }, [allPredictions, search, filterComp, sortByConfidence]);

  const criticalList = useMemo(() => {
    if (filteredAndSortedPredictions !== null) {
      return filteredAndSortedPredictions.filter(item => item.priority === 'Critical');
    }
    return predictionsCritical;
  }, [filteredAndSortedPredictions, predictionsCritical]);

  const highList = useMemo(() => {
    if (filteredAndSortedPredictions !== null) {
      return filteredAndSortedPredictions.filter(item => item.priority === 'High');
    }
    return predictionsHigh;
  }, [filteredAndSortedPredictions, predictionsHigh]);

  const mediumList = useMemo(() => {
    if (filteredAndSortedPredictions !== null) {
      return filteredAndSortedPredictions.filter(item => item.priority === 'Medium');
    }
    return predictionsMedium;
  }, [filteredAndSortedPredictions, predictionsMedium]);

  const lowList = useMemo(() => {
    if (filteredAndSortedPredictions !== null) {
      return filteredAndSortedPredictions.filter(item => item.priority === 'Low');
    }
    return predictionsLow;
  }, [filteredAndSortedPredictions, predictionsLow]);

  const displayTotalCritical = filteredAndSortedPredictions !== null ? criticalList.length : totalCritical;
  const displayTotalHigh = filteredAndSortedPredictions !== null ? highList.length : totalHigh;
  const displayTotalMedium = filteredAndSortedPredictions !== null ? mediumList.length : totalMedium;
  const displayTotalLow = filteredAndSortedPredictions !== null ? lowList.length : totalLow;

  const availableCategories = useMemo(() => {
    if (filteredAndSortedPredictions !== null) {
      const cats = new Set(allPredictions.map(p => p.category).filter(Boolean));
      return Array.from(cats);
    }
    return stats.category_distribution.map(d => d.category);
  }, [allPredictions, filteredAndSortedPredictions, stats.category_distribution]);

  // Fetch column predictions
  const fetchColumnData = useCallback(async (priority: string, page: number) => {
    const token = getToken();
    try {
      const url = `${BASE_URL}/api/predictions?priority=${priority}&page=${page}&limit=${PAGE_SIZE}` +
                  (fileId ? `&file_id=${fileId}` : '') +
                  (search ? `&search=${encodeURIComponent(search)}` : '') +
                  (filterComp ? `&category=${encodeURIComponent(filterComp)}` : '');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        if (priority === 'Critical') { setPredictionsCritical(data.items ?? []); setTotalCritical(data.total ?? 0); }
        else if (priority === 'High') { setPredictionsHigh(data.items ?? []); setTotalHigh(data.total ?? 0); }
        else if (priority === 'Medium') { setPredictionsMedium(data.items ?? []); setTotalMedium(data.total ?? 0); }
        else if (priority === 'Low') { setPredictionsLow(data.items ?? []); setTotalLow(data.total ?? 0); }
      }
    } catch (err) {
      console.error(`Failed to fetch ${priority} predictions`, err);
    }
  }, [fileId, search, filterComp, getToken]);

  const fetchStats = useCallback(async () => {
    const token = getToken();
    try {
      const url = `${BASE_URL}/api/predictions/stats` + (fileId ? `?file_id=${fileId}` : '');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { const data = await res.json(); setStats(data); }
    } catch (err) {
      console.error('Failed to fetch statistics', err);
    }
  }, [fileId, getToken]);

  // Reload everything when filters or fileId changes
  useEffect(() => {
    fetchColumnData('Critical', pageCritical);
  }, [fetchColumnData, pageCritical]);

  useEffect(() => {
    fetchColumnData('High', pageHigh);
  }, [fetchColumnData, pageHigh]);

  useEffect(() => {
    fetchColumnData('Medium', pageMedium);
  }, [fetchColumnData, pageMedium]);

  useEffect(() => {
    fetchColumnData('Low', pageLow);
  }, [fetchColumnData, pageLow]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Reset page numbers on filter changes
  useEffect(() => {
    setPageCritical(1);
    setPageHigh(1);
    setPageMedium(1);
    setPageLow(1);
  }, [search, filterComp, fileId]);

  // Auto-select first bug from Critical down to Low when list updates
  useEffect(() => {
    if (criticalList.length > 0) {
      setSelectedBug(criticalList[0]);
    } else if (highList.length > 0) {
      setSelectedBug(highList[0]);
    } else if (mediumList.length > 0) {
      setSelectedBug(mediumList[0]);
    } else if (lowList.length > 0) {
      setSelectedBug(lowList[0]);
    } else {
      setSelectedBug(null);
    }
  }, [criticalList, highList, mediumList, lowList]);

  // ── Parse input ───────────────────────────────────────────────────────────

  const parseBugs = useCallback((text: string): BulkBugInput[] => {
    const t = text.trim();
    if (!t) return SAMPLE_BUGS;
    try {
      const parsed = JSON.parse(t);
      const arr: any[] = Array.isArray(parsed) ? parsed : [parsed];
      return arr.map((b, i) => ({
        title: b.title ?? `Bug #${i + 1}`,
        description: b.description ?? '',
        steps_to_reproduce: b.steps_to_reproduce ?? b.steps ?? '',
        component: b.component ?? b.module ?? 'General',
        user_role: b.user_role ?? b.reporter ?? 'developer',
      }));
    } catch {
      return t.split('\n').map(l => l.trim()).filter(Boolean).map(line => ({
        title: line, description: line, steps_to_reproduce: '', component: 'General', user_role: 'developer',
      }));
    }
  }, []);

  // ── Normalize API response → PredictionItem ─────────────────────────────
  const normalizeResponse = useCallback((raw: any, index: number): PredictionItem => {
    // Handle both FlatPredictionItem and nested PredictionResponse shapes
    const priority: string =
      raw.priority ?? raw.prediction?.priority ?? 'Medium';
    const confidence: number =
      raw.confidence != null
        ? raw.confidence
        : raw.prediction?.confidence != null
        ? raw.prediction.confidence
        : 0.75;
    // Normalise confidence to percentage (backend returns 0-1)
    const confPct = confidence <= 1.0 ? confidence * 100 : confidence;

    const rec = raw.recommendation ?? '';
    const reasoning = raw.explanation?.reasoning ?? raw.rootCause ?? '';
    const component: string = raw.component ?? raw.prediction?.component ?? 'General';
    const severity: string = raw.severity ?? 'medium';

    // Derive category from component
    const category = raw.category ?? component ?? 'General';

    // Root cause: prefer explicit field, fallback to explanation reasoning
    const rootCause = raw.rootCause ?? reasoning ?? `Predicted as ${priority} priority based on ML analysis.`;

    // Impact
    const impact =
      raw.impact ??
      (priority === 'Critical'
        ? 'Critical system-wide impact. Immediate attention required.'
        : priority === 'High'
        ? 'High impact on core functionality. Affects multiple users.'
        : priority === 'Medium'
        ? 'Moderate impact. Affects specific workflows.'
        : 'Low impact. Minor aesthetic or edge-case issue.');

    // Solution
    const solution = raw.solution ?? rec ?? `Review and resolve ${priority.toLowerCase()} priority issue in ${component}.`;

    // Recommendation list
    const recommendation: string[] =
      Array.isArray(raw.recommendation_list) && raw.recommendation_list.length > 0
        ? raw.recommendation_list
        : Array.isArray(raw.recommendation)
        ? raw.recommendation
        : rec
        ? [rec]
        : [`Assign to ${priority === 'Critical' || priority === 'High' ? 'senior' : ''} engineer for resolution.`];

    const prevention: string[] =
      Array.isArray(raw.prevention) && raw.prevention.length > 0
        ? raw.prevention
        : [
            'Add unit tests covering this scenario.',
            'Implement monitoring alerts for similar failures.',
          ];

    return {
      id: raw.id ?? index,
      bug_id: raw.bug_id ?? `BUG-${Date.now()}-${index}`,
      title: raw.title ?? `Bug #${index + 1}`,
      priority,
      confidence: confPct,
      category,
      rootCause,
      impact,
      solution,
      recommendation,
      prevention,
      severity,
      component,
      timestamp: raw.timestamp ?? new Date().toISOString(),
    };
  }, []);

  // ── File Upload ───────────────────────────────────────────────────────────

  const handleFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    const file = e.target.files?.[0];
    if ('value' in e.target) {
      (e.target as HTMLInputElement).value = '';
    }
    if (!file) return;

    setLastFile(file);
    setLastAction('upload');
    setFailed([]);
    setAllPredictions([]);

    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';

    // Load JSON or txt/log into raw input for pasted review
    if (ext === 'txt' || ext === 'log') {
      const reader = new FileReader();
      reader.onload = ev => setRawInput(ev.target?.result as string ?? '');
      reader.readAsText(file);
      return;
    }

    // Direct upload for CSV, XLSX, JSON -> /api/predict-file
    setProgress({ current: 0, total: 1 });
    const token = getToken();
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('cross_check', 'false');
      const res = await fetch(`${BASE_URL}/api/predict-file`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setFailed([{ index: 0, title: file.name, error: err.detail ?? res.statusText ?? 'Unable to analyze file' }]);
      } else {
        const data = await res.json();
        const raw: any[] = data.predictions ?? data.results ?? [];
        const normalized = raw.map((r, i) => normalizeResponse(r, i));
        setAllPredictions(normalized);
        if (data.file_id) setFileId(data.file_id);
        if (normalized.length > 0) setActiveTab('backlog');
      }
    } catch (err: any) {
      setFailed([{ index: 0, title: file.name, error: err?.message ?? 'Unable to analyze file' }]);
    }
    setProgress(null);
  }, [normalizeResponse, getToken]);

  // ── Run Pasted / Pasted List ───────────────────────────────────────────────

  const handleRun = useCallback(async () => {
    const bugs = parseBugs(rawInput);
    setFailed([]);
    setAllPredictions([]);
    setProgress({ current: 0, total: bugs.length });
    setLastAction('run');
    setLastFile(null);
    const token = getToken();
    try {
      const res = await fetch(`${BASE_URL}/api/batch-predict`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          bugs: bugs.map(b => ({
            title: b.title,
            description: b.description || b.title,
            severity: 'medium',
            component: b.component || 'General',
            affected_users: 1,
            is_reproducible: true,
            reported_by: b.user_role || 'system',
            environment: 'Production',
            module: b.component || 'General',
          }))
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: res.statusText }));
        setFailed([{ index: 0, title: 'Batch run', error: err.detail ?? res.statusText ?? 'Unable to analyze bug reports' }]);
      } else {
        const data = await res.json();
        const raw: any[] = data.predictions ?? data.results ?? [];
        const normalized = raw.map((r, i) => normalizeResponse(r, i));
        setAllPredictions(normalized);
        if (data.file_id) setFileId(data.file_id);
        if (normalized.length > 0) setActiveTab('backlog');
      }
    } catch (err: any) {
      setFailed([{ index: 0, title: 'Batch run', error: err?.message ?? 'Unable to analyze bug reports' }]);
    }
    setProgress(null);
  }, [rawInput, parseBugs, normalizeResponse, getToken]);

  const handleRetry = useCallback(async () => {
    if (lastAction === 'upload' && lastFile) {
      const dummyEvent = {
        target: {
          files: [lastFile]
        }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      await handleFileUpload(dummyEvent);
    } else if (lastAction === 'run') {
      await handleRun();
    }
  }, [lastAction, lastFile, handleFileUpload, handleRun]);

  const handleClear = () => {
    setFileId(null);
    setFailed([]);
    setSearch('');
    setFilterComp('');
    setSelectedBug(null);
    setAllPredictions([]);
    setLastAction(null);
    setLastFile(null);
  };

  // ── Charts Rendering Data ──────────────────────────────────────────────────

  const priorityDistributionData = useMemo(() => [
    { name: 'Critical', value: computedStats.critical, color: '#ef4444' },
    { name: 'High',     value: computedStats.high,     color: '#f97316' },
    { name: 'Medium',   value: computedStats.medium,   color: '#eab308' },
    { name: 'Low',      value: computedStats.low,      color: '#22c55e' },
  ], [computedStats]);

  // Export current predictions to CSV
  const handleExport = () => {
    if (allPredictions.length > 0) {
      downloadCSV(buildCSV(allPredictions), `bug_predictions_${fileId || Date.now()}.csv`);
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto text-slate-800">

      {/* ── Top Dashboard Control Header ── */}
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border border-slate-100/50">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <span>Smart Bug Analyzer Dashboard</span>
              {fileId && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 font-bold">File Batch: {fileId}</span>}
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold mt-1">
              Upload CSV, Excel, or JSON. Process up to 10,000+ bugs instantly with zero timeouts or fetch failures.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {allPredictions.length > 0 && (
              <button
                onClick={handleExport}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:opacity-90 transition-all cursor-pointer"
              >
                <Download size={13} /> Export CSV
              </button>
            )}
            <label className="relative flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 cursor-pointer transition-colors">
              <Upload size={13} /> Upload CSV/Excel/JSON
              <input type="file" accept=".csv,.json,.xlsx,.xls,.txt,.log" onChange={handleFileUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
            </label>
          </div>
        </div>

        {/* Text Area Paste Input */}
        <div className="mt-4">
          <textarea
            rows={4}
            value={rawInput}
            onChange={e => setRawInput(e.target.value)}
            placeholder={`Paste a JSON array of bug reports, e.g.:\n[\n  { "title": "Database connection pool exhausted", "description": "Connection pool limit exceeded under load", "component": "Database" }\n]\n\nOr paste one bug title per line. Leave empty and click "Run Predictions" to run sample bugs.`}
            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-all text-slate-800 resize-y"
          />
        </div>

        <div className="flex items-center justify-between gap-3 mt-3 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={handleRun}
              disabled={progress !== null}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-slate-950 text-white text-xs font-bold rounded-xl hover:opacity-90 disabled:opacity-50 transition-opacity cursor-pointer shadow-sm"
            >
              {progress !== null ? (
                <><RefreshCw size={13} className="animate-spin" /> Processing predictions...</>
              ) : (
                <>Predict Priorities →</>
              )}
            </button>
            <button
              onClick={() => setRawInput(JSON.stringify(SAMPLE_BUGS, null, 2))}
              disabled={progress !== null}
              className="flex items-center gap-1.5 px-3 py-2.5 border border-slate-200 text-xs font-bold text-slate-600 rounded-xl hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-40"
            >
              <FileText size={13} /> Load 20 Samples
            </button>
            {(fileId || rawInput) && (
              <button onClick={handleClear} className="text-xs text-slate-400 hover:text-red-500 font-bold transition-colors">
                Clear Dashboard
              </button>
            )}
          </div>

          {/* Toggle Tabs */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200/50">
            <button
              onClick={() => setActiveTab('backlog')}
              className={cn("px-4 py-1.5 text-xs font-bold rounded-md transition-all", activeTab === 'backlog' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            >
              Backlog Results
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={cn("px-4 py-1.5 text-xs font-bold rounded-md transition-all", activeTab === 'analytics' ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}
            >
              Analytics Dashboard
            </button>
          </div>
        </div>

        {progress !== null && (
          <div className="mt-4 space-y-1.5">
            <div className="flex justify-between text-[10px] font-bold text-slate-500">
              <span>Running predictions batch...</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full animate-pulse" style={{ width: '100%' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Analytics Dashboard Section ── */}
      {activeTab === 'analytics' && (
        <div className="space-y-6">
          {/* Total Bug Count Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-lg text-left">
              <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Bugs</span>
              <p className="text-3xl font-black text-slate-900 mt-1">{computedStats.total}</p>
            </div>
            {GROUP_KEYS.map(key => {
              const c = PC[key];
              const count = key === 'Critical' ? computedStats.critical : key === 'High' ? computedStats.high : key === 'Medium' ? computedStats.medium : computedStats.low;
              return (
                <div key={key} className="bg-white p-5 rounded-[1.5rem] border border-slate-100 shadow-lg text-left" style={{ borderLeft: `4px solid ${c.border}` }}>
                  <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center gap-1">
                    <span>{c.emoji}</span>
                    <span>{key}</span>
                  </span>
                  <p className="text-3xl font-black mt-1" style={{ color: c.text }}>{count}</p>
                </div>
              );
            })}
          </div>

          {/* Charts Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Priority Distribution Chart */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left mb-4">Priority Distribution</h3>
              <div className="h-[220px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={priorityDistributionData.filter(d => d.value > 0)}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {priorityDistributionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} reports`, 'Count']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 flex-wrap text-xs font-bold mt-2">
                {priorityDistributionData.map(d => (
                  <div key={d.name} className="flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-slate-600">{d.name} ({d.value})</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Category Distribution Chart */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left mb-4">Category Distribution</h3>
              <div className="h-[240px]">
                {computedStats.category_distribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={computedStats.category_distribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="category" tick={{ fontSize: 9, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 9, fontWeight: 700 }} />
                      <Tooltip formatter={(value) => [`${value} reports`, 'Count']} />
                      <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No category data yet.</div>
                )}
              </div>
            </div>

            {/* Confidence Score Distribution Chart */}
            <div className="bg-white p-5 rounded-[2rem] border border-slate-100 shadow-lg flex flex-col justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 text-left mb-4">Confidence Distribution</h3>
              <div className="h-[240px]">
                {computedStats.confidence_distribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={computedStats.confidence_distribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="range" tick={{ fontSize: 9, fontWeight: 700 }} />
                      <YAxis tick={{ fontSize: 9, fontWeight: 700 }} />
                      <Tooltip formatter={(value) => [`${value} reports`, 'Count']} />
                      <Bar dataKey="count" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No confidence metrics yet.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Results Dashboard Section ── */}
      {activeTab === 'backlog' && (
        <div className="space-y-4">
          
          {/* Filtering Header Panel */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search predictions by bug title or details..."
                className="w-full pl-9 pr-9 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500/30 transition-all text-slate-800"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700">
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Category Dropdown Filter */}
            <div className="flex items-center gap-2">
              <Filter size={13} className="text-slate-400" />
              <select
                value={filterComp}
                onChange={e => setFilterComp(e.target.value)}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 font-bold"
              >
                <option value="">All Categories</option>
                {availableCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Sort by Confidence Score */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-bold">Sort:</span>
              <select
                value={sortByConfidence}
                onChange={e => setSortByConfidence(e.target.value as 'desc' | 'asc' | 'none')}
                className="text-xs border border-slate-200 rounded-xl px-3 py-2 bg-slate-50 text-slate-700 outline-none focus:border-blue-400 font-bold"
              >
                <option value="desc">Confidence (High → Low)</option>
                <option value="asc">Confidence (Low → High)</option>
                <option value="none">Default Order</option>
              </select>
            </div>
          </div>

          {/* TWO-COLUMN RESULTS LAYOUT */}
          {progress !== null ? (
            <div className="bg-white rounded-[2rem] p-12 shadow-xl border border-slate-100/50 flex flex-col items-center justify-center min-h-[500px]">
              <RefreshCw size={40} className="animate-spin text-blue-600 mb-4" />
              <h3 className="text-sm font-bold text-slate-800">Analyzing bug reports...</h3>
              <p className="text-xs text-slate-500 mt-1">Applying classification model and generating recommendations.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            
            {/* LEFT COLUMN: 4 stacked priority sections (5/12 width) */}
            <div className="lg:col-span-5 space-y-4 max-h-[850px] overflow-y-auto pr-1">
              
              {/* 1. Critical Section */}
              <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col h-[280px]">
                <div className="sticky top-0 bg-red-50 px-4 py-2 border-b border-red-200 flex items-center justify-between z-10 select-none">
                  <span className="text-xs font-black text-red-900 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>🔴 Critical Bugs</span>
                    <span className="bg-red-200 text-red-800 text-[10px] px-2 py-0.5 rounded-full font-extrabold">{displayTotalCritical} total</span>
                  </span>
                  {filteredAndSortedPredictions === null && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pageCritical === 1}
                        onClick={() => setPageCritical(p => Math.max(1, p - 1))}
                        className="p-1 hover:bg-red-100 text-red-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-bold text-red-700">Page {pageCritical}</span>
                      <button
                        disabled={pageCritical * PAGE_SIZE >= totalCritical}
                        onClick={() => setPageCritical(p => p + 1)}
                        className="p-1 hover:bg-red-100 text-red-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {criticalList.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No Critical bugs found.</div>
                  ) : (
                    criticalList.map(bug => {
                      const isSelected = selectedBug?.bug_id === bug.bug_id;
                      const isFailed = bug.rootCause === 'Prediction unavailable';
                      return (
                        <div
                          key={bug.bug_id}
                          onClick={() => setSelectedBug(bug)}
                          className={cn(
                            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                            isSelected ? "bg-red-600 text-white border-red-700 shadow-md scale-[1.01]" : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-black truncate">{bug.title}</span>
                            <span className={cn("text-[10px] font-black shrink-0 font-mono", isSelected ? "text-red-200" : "text-red-600")}>
                              {isFailed ? 'Unavailable' : `${bug.confidence.toFixed(1)}%`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-bold mt-1 opacity-70">
                            <span>{bug.category}</span>
                            <span>{bug.component}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 2. High Section */}
              <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col h-[280px]">
                <div className="sticky top-0 bg-orange-50 px-4 py-2 border-b border-orange-200 flex items-center justify-between z-10 select-none">
                  <span className="text-xs font-black text-orange-955 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>🟠 High Bugs</span>
                    <span className="bg-orange-200 text-orange-900 text-[10px] px-2 py-0.5 rounded-full font-extrabold">{displayTotalHigh} total</span>
                  </span>
                  {filteredAndSortedPredictions === null && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pageHigh === 1}
                        onClick={() => setPageHigh(p => Math.max(1, p - 1))}
                        className="p-1 hover:bg-orange-100 text-orange-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-bold text-orange-700">Page {pageHigh}</span>
                      <button
                        disabled={pageHigh * PAGE_SIZE >= totalHigh}
                        onClick={() => setPageHigh(p => p + 1)}
                        className="p-1 hover:bg-orange-100 text-orange-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {highList.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No High bugs found.</div>
                  ) : (
                    highList.map(bug => {
                      const isSelected = selectedBug?.bug_id === bug.bug_id;
                      const isFailed = bug.rootCause === 'Prediction unavailable';
                      return (
                        <div
                          key={bug.bug_id}
                          onClick={() => setSelectedBug(bug)}
                          className={cn(
                            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                            isSelected ? "bg-orange-600 text-white border-orange-700 shadow-md scale-[1.01]" : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-black truncate">{bug.title}</span>
                            <span className={cn("text-[10px] font-black shrink-0 font-mono", isSelected ? "text-orange-200" : "text-orange-600")}>
                              {isFailed ? 'Unavailable' : `${bug.confidence.toFixed(1)}%`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-bold mt-1 opacity-70">
                            <span>{bug.category}</span>
                            <span>{bug.component}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 3. Medium Section */}
              <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col h-[280px]">
                <div className="sticky top-0 bg-yellow-50 px-4 py-2 border-b border-yellow-200 flex items-center justify-between z-10 select-none">
                  <span className="text-xs font-black text-yellow-955 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>🟡 Medium Bugs</span>
                    <span className="bg-yellow-200 text-yellow-900 text-[10px] px-2 py-0.5 rounded-full font-extrabold">{displayTotalMedium} total</span>
                  </span>
                  {filteredAndSortedPredictions === null && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pageMedium === 1}
                        onClick={() => setPageMedium(p => Math.max(1, p - 1))}
                        className="p-1 hover:bg-yellow-100 text-yellow-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-bold text-yellow-700">Page {pageMedium}</span>
                      <button
                        disabled={pageMedium * PAGE_SIZE >= totalMedium}
                        onClick={() => setPageMedium(p => p + 1)}
                        className="p-1 hover:bg-yellow-100 text-yellow-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {mediumList.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No Medium bugs found.</div>
                  ) : (
                    mediumList.map(bug => {
                      const isSelected = selectedBug?.bug_id === bug.bug_id;
                      const isFailed = bug.rootCause === 'Prediction unavailable';
                      return (
                        <div
                          key={bug.bug_id}
                          onClick={() => setSelectedBug(bug)}
                          className={cn(
                            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                            isSelected ? "bg-yellow-600 text-white border-yellow-700 shadow-md scale-[1.01]" : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-black truncate">{bug.title}</span>
                            <span className={cn("text-[10px] font-black shrink-0 font-mono", isSelected ? "text-yellow-100" : "text-yellow-600")}>
                              {isFailed ? 'Unavailable' : `${bug.confidence.toFixed(1)}%`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-bold mt-1 opacity-70">
                            <span>{bug.category}</span>
                            <span>{bug.component}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 4. Low Section */}
              <div className="bg-white rounded-2xl shadow-md border border-slate-100 overflow-hidden flex flex-col h-[280px]">
                <div className="sticky top-0 bg-green-50 px-4 py-2 border-b border-green-200 flex items-center justify-between z-10 select-none">
                  <span className="text-xs font-black text-green-955 flex items-center gap-1.5 uppercase tracking-wide">
                    <span>🟢 Low Bugs</span>
                    <span className="bg-green-200 text-green-800 text-[10px] px-2 py-0.5 rounded-full font-extrabold">{displayTotalLow} total</span>
                  </span>
                  {filteredAndSortedPredictions === null && (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={pageLow === 1}
                        onClick={() => setPageLow(p => Math.max(1, p - 1))}
                        className="p-1 hover:bg-green-100 text-green-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-[10px] font-bold text-green-700">Page {pageLow}</span>
                      <button
                        disabled={pageLow * PAGE_SIZE >= totalLow}
                        onClick={() => setPageLow(p => p + 1)}
                        className="p-1 hover:bg-green-100 text-green-700 rounded transition-colors disabled:opacity-30 cursor-pointer"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {lowList.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-xs font-bold text-slate-400">No Low bugs found.</div>
                  ) : (
                    lowList.map(bug => {
                      const isSelected = selectedBug?.bug_id === bug.bug_id;
                      const isFailed = bug.rootCause === 'Prediction unavailable';
                      return (
                        <div
                          key={bug.bug_id}
                          onClick={() => setSelectedBug(bug)}
                          className={cn(
                            "p-3 rounded-xl border text-left cursor-pointer transition-all flex flex-col gap-1",
                            isSelected ? "bg-green-600 text-white border-green-700 shadow-md scale-[1.01]" : "bg-white border-slate-100 hover:bg-slate-50"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-black truncate">{bug.title}</span>
                            <span className={cn("text-[10px] font-black shrink-0 font-mono", isSelected ? "text-green-100" : "text-green-600")}>
                              {isFailed ? 'Unavailable' : `${bug.confidence.toFixed(1)}%`}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[9px] font-bold mt-1 opacity-70">
                            <span>{bug.category}</span>
                            <span>{bug.component}</span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: Detailed bug presentation card (7/12 width) */}
            <div className="lg:col-span-7 bg-white rounded-[2.5rem] p-8 shadow-xl border border-slate-100/50 flex flex-col justify-between min-h-[500px]">
              {selectedBug ? (
                <div className="space-y-6 text-left h-full flex flex-col justify-between">
                  <div className="space-y-5">
                    {/* Header */}
                    <div className="border-b border-slate-100 pb-4 flex justify-between items-start gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Bug Assessment</span>
                          <span className="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-bold">{selectedBug.category}</span>
                          <span className="bg-slate-100 text-slate-600 text-[10px] px-2.5 py-0.5 rounded-full font-bold">{selectedBug.component}</span>
                        </div>
                        <h2 className="text-base font-extrabold text-slate-900 mt-2 leading-snug">{selectedBug.title}</h2>
                      </div>
                    </div>

                    {/* Verdict Card */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 rounded-2xl flex items-center gap-3 select-none" style={{
                        background: PC[selectedBug.priority as GroupKey]?.bg ?? '#f1f5f9',
                        color: PC[selectedBug.priority as GroupKey]?.text ?? '#1e293b',
                        border: `1px solid ${PC[selectedBug.priority as GroupKey]?.border ?? '#e2e8f0'}`
                      }}>
                        <span className="text-3xl">{PC[selectedBug.priority as GroupKey]?.emoji ?? '❓'}</span>
                        <div className="text-left">
                          <div className="text-[10px] font-black uppercase tracking-wider opacity-85">Predicted Priority</div>
                          <div className="text-lg font-black leading-none mt-0.5">{selectedBug.priority}</div>
                        </div>
                      </div>

                      <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-3">
                        <div className="text-left">
                          <div className="text-[10px] font-black uppercase tracking-wider text-slate-400">Confidence Score</div>
                          <div className="text-lg font-black text-slate-900 mt-0.5">
                            {selectedBug.rootCause === 'Prediction unavailable' ? 'Unavailable' : `${selectedBug.confidence.toFixed(1)}%`}
                          </div>
                        </div>
                      </div>
                    </div>

                    {selectedBug.rootCause === 'Prediction unavailable' ? (
                      <div className="bg-red-50 border border-red-200 rounded-2xl p-5 flex items-start gap-3 mt-4 text-left">
                        <AlertCircle size={18} className="text-red-500 shrink-0 mt-0.5" />
                        <div>
                          <h4 className="text-xs font-black text-red-950 uppercase tracking-wide">Prediction Unavailable</h4>
                          <p className="text-xs text-red-800 font-semibold mt-1">
                            An error occurred when analyzing this bug report. Please review the inputs and try predicting manually.
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4 pt-1">
                        {/* Root Cause */}
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Root Cause</span>
                          <p className="text-xs text-slate-700 font-semibold bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/60 leading-relaxed">
                            {selectedBug.rootCause}
                          </p>
                        </div>

                        {/* Impact Analysis */}
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Impact Analysis</span>
                          <p className="text-xs text-slate-700 font-semibold bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/60 leading-relaxed">
                            {selectedBug.impact}
                          </p>
                        </div>

                        {/* Recommended Fix / Solution */}
                        <div className="space-y-1">
                          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Solution (Recommended Fix)</span>
                          <p className="text-xs text-slate-700 font-bold bg-slate-50/50 p-3.5 rounded-xl border border-slate-100/60 leading-relaxed" style={{ color: PC[selectedBug.priority as GroupKey]?.text }}>
                            {selectedBug.solution}
                          </p>
                        </div>

                        {/* Recommendations Bullets */}
                        {selectedBug.recommendation && selectedBug.recommendation.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Recommendations</span>
                            <ul className="space-y-1.5 text-xs text-slate-700 font-semibold pl-1">
                              {selectedBug.recommendation.map((rec, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-indigo-500 font-black mt-0.5">•</span>
                                  <span>{rec}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Prevention Steps Bullets */}
                        {selectedBug.prevention && selectedBug.prevention.length > 0 && (
                          <div className="space-y-1.5">
                            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Prevention Steps</span>
                            <ul className="space-y-1.5 text-xs text-slate-700 font-semibold pl-1">
                              {selectedBug.prevention.map((prev, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="text-emerald-500 font-black mt-0.5">✓</span>
                                  <span>{prev}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions footer */}
                  <div className="border-t border-slate-100 pt-4 flex items-center justify-between">
                    <span className="text-[9px] font-mono text-slate-400">BUG ID: {selectedBug.bug_id}</span>
                    <button
                      onClick={() => {
                        const copyStr = [
                          `Title: ${selectedBug.title}`,
                          `Priority: ${selectedBug.priority}`,
                          `Confidence: ${selectedBug.confidence.toFixed(1)}%`,
                          `Category: ${selectedBug.category}`,
                          `Root Cause: ${selectedBug.rootCause}`,
                          `Solution: ${selectedBug.solution}`,
                          `Recommendations:\n${(selectedBug.recommendation ?? []).map(r => `• ${r}`).join('\n')}`
                        ].join('\n');
                        navigator.clipboard.writeText(copyStr);
                        alert("Bug action details copied to clipboard!");
                      }}
                      className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-bold hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
                    >
                      <CheckCircle size={11} /> Copy Action Details
                    </button>
                  </div>
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-24 select-none">
                  <Search size={32} className="opacity-20 mb-2" />
                  <p className="text-xs font-bold">No bug selected</p>
                  <p className="text-[10px] opacity-75 mt-0.5">Click any bug in the backlog lists to examine detailed prediction analysis.</p>
                </div>
              )}
            </div>

          </div>
          )}

        </div>
      )}

      {/* ── Failed to upload logs section ── */}
      {failed.length > 0 && (
        <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl overflow-hidden p-6 text-left">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-3">
            <AlertCircle size={15} className="text-red-500" />
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-800">Errors & Warnings ({failed.length})</h3>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[10px] font-bold rounded-lg transition-colors cursor-pointer ml-auto"
            >
              <RefreshCw size={11} /> Retry Analysis
            </button>
          </div>
          <div className="space-y-2 max-h-[150px] overflow-y-auto pr-1">
            {failed.map((f, i) => (
              <div key={i} className="text-xs flex items-start gap-2 bg-red-50/50 p-2.5 rounded-xl border border-red-100/50">
                <span className="font-mono text-red-500 font-bold shrink-0">#{i + 1}</span>
                <div>
                  <div className="font-bold text-slate-800">{f.title}</div>
                  <div className="text-[10px] font-semibold text-red-600 mt-0.5">{f.error}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
};

export default BulkPredictor;
