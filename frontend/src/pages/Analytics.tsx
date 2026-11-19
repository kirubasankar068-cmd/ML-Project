import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, TrendingUp, ShieldAlert, Award, FileSpreadsheet, ArrowUpDown } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/queryKeys';
import { MetricCard } from '../components/MetricCard';
import { PriorityTrend } from '../components/Charts/PriorityTrend';
import { DepartmentMatrix } from '../components/Charts/DepartmentMatrix';
import { formatNumber, cn } from '../lib/utils';
import { usePredictionStore } from '../store/predictionStore';

export const Analytics: React.FC = () => {
  const [days, setDays] = useState<number>(30);
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  
  // Sorting state for table
  const [sortField, setSortField] = useState<'name' | 'total' | 'risk'>('risk');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  // Queries
  const { data: trendsData, isLoading: trendsLoading } = useQuery({
    queryKey: queryKeys.analytics.trends(days),
    queryFn: () => api.getAnalyticsTrends(days),
  });

  const { data: deptsData, isLoading: deptsLoading } = useQuery({
    queryKey: queryKeys.analytics.departments(),
    queryFn: api.getAnalyticsDepartments,
  });

  // Read predictions from local storage to show in the analysis
  const localPredictions = usePredictionStore(state => state.predictions);

  const getDynamicDeptsData = () => {
    if (localPredictions.length === 0) {
      return deptsData || {
        departments: ['Engineering', 'Product', 'Sales', 'Customer-Support', 'Operations'],
        critical: [8, 2, 1, 0, 3],
        high: [16, 7, 3, 5, 2],
        medium: [24, 12, 10, 18, 9],
        low: [12, 4, 8, 14, 5]
      };
    }

    const deptMap: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
    localPredictions.forEach(p => {
      const dept = p.input.department || 'Engineering';
      const prio = p.priority_label;
      if (!deptMap[dept]) {
        deptMap[dept] = { critical: 0, high: 0, medium: 0, low: 0 };
      }
      if (prio === 'Critical') deptMap[dept].critical++;
      else if (prio === 'High') deptMap[dept].high++;
      else if (prio === 'Medium') deptMap[dept].medium++;
      else if (prio === 'Low') deptMap[dept].low++;
    });

    const departments = Object.keys(deptMap);
    return {
      departments,
      critical: departments.map(d => deptMap[d].critical),
      high: departments.map(d => deptMap[d].high),
      medium: departments.map(d => deptMap[d].medium),
      low: departments.map(d => deptMap[d].low)
    };
  };

  const dynamicDepts = getDynamicDeptsData();

  const getDeptSummaryStats = () => {
    let total = 0;
    let critical = 0;
    let maxRisk = -1;
    let topRiskDept = 'None';

    dynamicDepts.departments.forEach((dept, idx) => {
      const crit = dynamicDepts.critical[idx] || 0;
      const high = dynamicDepts.high[idx] || 0;
      const med = dynamicDepts.medium[idx] || 0;
      const low = dynamicDepts.low[idx] || 0;
      
      const deptTotal = crit + high + med + low;
      total += deptTotal;
      critical += crit;

      const risk = deptTotal > 0 ? (crit * 4 + high * 2 + med) / deptTotal : 0;
      if (risk > maxRisk) {
        maxRisk = risk;
        topRiskDept = dept;
      }
    });

    const critRate = total > 0 ? `${((critical / total) * 100).toFixed(1)}%` : '0%';

    return {
      total,
      criticalRate: critRate,
      topRiskDept,
      accuracy: '92.4%',
    };
  };

  const stats = getDeptSummaryStats();

  const getTableRows = () => {
    const rows = dynamicDepts.departments.map((dept, idx) => {
      const crit = dynamicDepts.critical[idx] || 0;
      const high = dynamicDepts.high[idx] || 0;
      const med = dynamicDepts.medium[idx] || 0;
      const low = dynamicDepts.low[idx] || 0;
      const total = crit + high + med + low;
      const riskScore = total > 0 ? (crit * 4 + high * 2 + med) / total : 0;

      return {
        name: dept,
        total,
        critical: crit,
        high,
        medium: med,
        low,
        risk: Number(riskScore.toFixed(2)),
      };
    });

    return rows.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'total') {
        comparison = a.total - b.total;
      } else {
        comparison = a.risk - b.risk;
      }
      return sortAsc ? comparison : -comparison;
    });
  };

  const tableRows = getTableRows();

  const handleSort = (field: 'name' | 'total' | 'risk') => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const getDynamicCorrelationMatrix = () => {
    const severities = ['blocker', 'critical', 'major', 'normal', 'minor', 'trivial'];
    const matrix: Record<string, { critical: number; high: number; medium: number; low: number }> = {};
    severities.forEach(s => {
      matrix[s] = { critical: 0, high: 0, medium: 0, low: 0 };
    });

    if (localPredictions.length === 0) {
      return [
        { severity: 'blocker', critical: 18, high: 8, medium: 2, low: 0 },
        { severity: 'critical', critical: 24, high: 14, medium: 4, low: 1 },
        { severity: 'major', critical: 8, high: 28, medium: 18, low: 4 },
        { severity: 'normal', critical: 2, high: 12, medium: 34, low: 12 },
        { severity: 'minor', critical: 0, high: 4, medium: 14, low: 22 },
        { severity: 'trivial', critical: 0, high: 1, medium: 4, low: 18 },
      ];
    }

    localPredictions.forEach(p => {
      const sev = (p.input.severity || 'normal').toLowerCase();
      const prio = p.priority_label;
      if (matrix[sev]) {
        if (prio === 'Critical') matrix[sev].critical++;
        else if (prio === 'High') matrix[sev].high++;
        else if (prio === 'Medium') matrix[sev].medium++;
        else if (prio === 'Low') matrix[sev].low++;
      }
    });

    return severities.map(s => ({
      severity: s,
      critical: matrix[s].critical,
      high: matrix[s].high,
      medium: matrix[s].medium,
      low: matrix[s].low
    }));
  };

  const heatMapData = getDynamicCorrelationMatrix();

  const getHeatmapBgOpacity = (count: number) => {
    const maxCount = Math.max(...heatMapData.map(d => Math.max(d.critical, d.high, d.medium, d.low)), 10);
    return count > 0 ? Math.max(0.08, count / maxCount) : 0.02;
  };

  return (
    <div className="space-y-6">
      {/* Grid columns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* stacked bar-chart */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col justify-between">
          <div className="mb-4 select-none">
            <h3 className="text-sm font-bold text-slate-900">Department Risk Matrix</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Bug distribution stacked across business sectors</p>
          </div>
          <DepartmentMatrix
            data={dynamicDepts}
            onSelectDepartment={(dept) => setSelectedDept(dept === selectedDept ? null : dept)}
          />
        </div>

        {/* Heatmap grid */}
        <div className="bg-white rounded-[2rem] p-6 shadow-xl flex flex-col justify-between">
          <div className="mb-4 select-none">
            <h3 className="text-sm font-bold text-slate-900">Severity vs Priority Correlation</h3>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">Co-occurrence frequency matrix of inputs vs outputs</p>
          </div>
          <div className="flex flex-col gap-2 select-none">
            <div className="grid grid-cols-5 gap-1.5 text-center text-[10px] uppercase font-bold text-slate-400 pb-2">
              <span className="text-left font-semibold">Severity</span>
              <span>Critical</span>
              <span>High</span>
              <span>Medium</span>
              <span>Low</span>
            </div>

            <div className="space-y-1.5">
              {heatMapData.map((row) => (
                <div key={row.severity} className="grid grid-cols-5 gap-1.5 items-center text-center text-xs font-semibold">
                  <span className="text-left font-bold text-slate-400 capitalize truncate">{row.severity}</span>
                  {[row.critical, row.high, row.medium, row.low].map((val, idx) => (
                    <div
                      key={idx}
                      className="h-10 rounded-xl border border-transparent flex items-center justify-center font-mono text-xs text-slate-900 transition-all font-bold"
                      style={{
                        backgroundColor: `rgba(37, 99, 235, ${getHeatmapBgOpacity(val)})`,
                      }}
                    >
                      {val || '—'}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* risk breakdowns table */}
      <div className="bg-white rounded-[2rem] shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 select-none">
          <h3 className="text-sm font-bold text-slate-900">Risk Score Breakdown</h3>
          <p className="text-xs text-slate-500 font-semibold mt-0.5">
            Risk rating formula: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded text-[11px] font-bold text-slate-600">(Critical×4 + High×2 + Medium) ÷ Total</code>
          </p>
        </div>

        <div className="overflow-x-auto">
          {deptsLoading ? (
            <div className="p-12 text-center text-xs text-slate-400">Loading records...</div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 select-none border-b border-slate-100">
                  <th onClick={() => handleSort('name')} className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3 cursor-pointer hover:text-slate-900">
                    <div className="flex items-center gap-1">
                      <span>Department</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th onClick={() => handleSort('total')} className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3 cursor-pointer hover:text-slate-900">
                    <div className="flex items-center gap-1">
                      <span>Total Bugs</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                  <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Critical</th>
                  <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">High</th>
                  <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Medium</th>
                  <th className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3">Low</th>
                  <th onClick={() => handleSort('risk')} className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-5 py-3 text-right cursor-pointer hover:text-slate-900">
                    <div className="flex items-center gap-1 justify-end">
                      <span>Risk Rating</span>
                      <ArrowUpDown size={10} />
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableRows.map((row) => (
                  <tr
                    key={row.name}
                    className={cn(
                      "hover:bg-slate-50 transition-colors",
                      selectedDept === row.name && "bg-blue-500/5 font-bold"
                    )}
                  >
                    <td className="px-5 py-3.5 text-xs font-semibold text-slate-900">{row.name}</td>
                    <td className="px-5 py-3.5 text-xs font-bold text-slate-900">{row.total}</td>
                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-priority-critical">{row.critical}</td>
                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-priority-high">{row.high}</td>
                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-priority-medium">{row.medium}</td>
                    <td className="px-5 py-3.5 text-xs font-mono font-bold text-priority-low">{row.low}</td>
                    <td className="px-5 py-3.5 text-xs text-right">
                      <div className="flex items-center gap-3 justify-end font-semibold">
                        <span className="font-mono text-slate-900 font-extrabold">{row.risk.toFixed(2)}</span>
                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden shrink-0">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              row.risk > 2.5 ? 'bg-red-500' : row.risk > 1.5 ? 'bg-amber-500' : 'bg-green-500'
                            )}
                            style={{ width: `${Math.min(100, (row.risk / 4) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analytics;
