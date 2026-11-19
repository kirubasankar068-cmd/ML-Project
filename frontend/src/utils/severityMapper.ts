/**
 * Shared Bug Severity Level Mapper & Configuration.
 * Maps a severity percentage score (0-100) to a severity level badge.
 * 0-59   = Very Low    (Gray)
 * 60-69  = Low         (Green)
 * 70-75  = Medium      (Yellow)
 * 76-85  = High Medium (Orange)
 * 86-100 = High        (Red)
 */

export interface SeverityInfo {
  score: number;
  level: 'Very Low' | 'Low' | 'Medium' | 'High Medium' | 'High';
  color: 'gray' | 'green' | 'yellow' | 'orange' | 'red';
  formatted: string;
  bgClass: string;
  badgeStyle: {
    backgroundColor: string;
    color: string;
    border: string;
  };
}

export function mapSeverityScore(score: number | string): SeverityInfo {
  const numScore = typeof score === 'number' ? score : parseFloat(score) || 50;
  const normalizedScore = Math.max(0, Math.min(100, Math.round(numScore)));

  if (normalizedScore <= 59) {
    return {
      score: normalizedScore,
      level: 'Very Low',
      color: 'gray',
      formatted: `${normalizedScore}% - Very Low`,
      bgClass: 'bg-slate-100 text-slate-700 border-slate-300',
      badgeStyle: { backgroundColor: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1' }
    };
  } else if (normalizedScore <= 69) {
    return {
      score: normalizedScore,
      level: 'Low',
      color: 'green',
      formatted: `${normalizedScore}% - Low`,
      bgClass: 'bg-emerald-50 text-emerald-700 border-emerald-300',
      badgeStyle: { backgroundColor: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0' }
    };
  } else if (normalizedScore <= 75) {
    return {
      score: normalizedScore,
      level: 'Medium',
      color: 'yellow',
      formatted: `${normalizedScore}% - Medium`,
      bgClass: 'bg-amber-50 text-amber-700 border-amber-300',
      badgeStyle: { backgroundColor: '#fffbeb', color: '#b45309', border: '1px solid #fde68a' }
    };
  } else if (normalizedScore <= 85) {
    return {
      score: normalizedScore,
      level: 'High Medium',
      color: 'orange',
      formatted: `${normalizedScore}% - High Medium`,
      bgClass: 'bg-orange-50 text-orange-700 border-orange-300',
      badgeStyle: { backgroundColor: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }
    };
  } else {
    return {
      score: normalizedScore,
      level: 'High',
      color: 'red',
      formatted: `${normalizedScore}% - High`,
      bgClass: 'bg-rose-50 text-rose-700 border-rose-300',
      badgeStyle: { backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }
    };
  }
}
