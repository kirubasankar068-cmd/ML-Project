import React, { useState } from 'react';
import {
  FileText, Copy, Download, Check, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, Code2, HelpCircle, Sparkles, FileCode
} from 'lucide-react';
import { cn } from '../lib/utils';

export interface SolutionPanelData {
  problem_summary?: string;
  root_cause?: string;
  recommended_solution?: string;
  steps?: string[];
  code_fix?: string | null;
  verification_checklist?: string[];
}

interface RecommendedSolutionPanelProps {
  data: SolutionPanelData;
  className?: string;
}

export const RecommendedSolutionPanel: React.FC<RecommendedSolutionPanelProps> = ({
  data,
  className
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [collapsedSteps, setCollapsedSteps] = useState<Record<number, boolean>>({});
  const [allCollapsed, setAllCollapsed] = useState(false);

  const problemSummary = data.problem_summary || "Detected Bug / Exception";
  const rootCause = data.root_cause || "Runtime execution error in application component logic.";
  const recommendedFix = data.recommended_solution || "Review method inputs, exception trace location, and boundary conditions.";
  const steps = data.steps && data.steps.length > 0 ? data.steps : [
    "Review exception stack trace for exact line number.",
    "Validate input parameters passed to failing function.",
    "Add exception handling boundary check."
  ];
  const codeFix = data.code_fix || null;
  const verification = data.verification_checklist && data.verification_checklist.length > 0 ? data.verification_checklist : [
    "Execute automated test suite covering modified module.",
    "Verify behavior with null or edge-case parameters."
  ];

  const toggleStep = (idx: number) => {
    setCollapsedSteps((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  const toggleAllSteps = () => {
    const nextState = !allCollapsed;
    setAllCollapsed(nextState);
    const newMap: Record<number, boolean> = {};
    steps.forEach((_, idx) => {
      newMap[idx] = nextState;
    });
    setCollapsedSteps(newMap);
  };

  const handleCopyCode = () => {
    if (!codeFix) return;
    navigator.clipboard.writeText(codeFix);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const generateMarkdownText = (): string => {
    let md = `# Recommended Solution & Step-by-Step Fix\n\n`;
    md += `## Problem Summary\n${problemSummary}\n\n`;
    md += `## Likely Root Cause\n${rootCause}\n\n`;
    md += `## Recommended Fix / Solution\n${recommendedFix}\n\n`;
    md += `## Step-by-Step Fix Steps\n`;
    steps.forEach((s, idx) => {
      md += `${idx + 1}. ${s}\n`;
    });
    if (codeFix) {
      md += `\n## Example Code Fix\n\`\`\`\n${codeFix}\n\`\`\`\n`;
    }
    md += `\n## Verification Checklist\n`;
    verification.forEach((v) => {
      md += `- [ ] ${v}\n`;
    });
    return md;
  };

  const handleCopyAll = () => {
    const md = generateMarkdownText();
    navigator.clipboard.writeText(md);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  const handleExportMarkdown = () => {
    const md = generateMarkdownText();
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `solution_fix_${Date.now()}.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportPDF = () => {
    // Generates a formatted print document in a new window for PDF print saving
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert("Please allow popups to export as PDF");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Bug Fix Solution Notesheet</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #0f172a; line-height: 1.6; }
          h1 { color: #1e1b4b; border-bottom: 2px solid #6366f1; padding-bottom: 8px; font-size: 20px; }
          h2 { color: #334155; font-size: 14px; text-transform: uppercase; margin-top: 20px; margin-bottom: 6px; letter-spacing: 0.5px; }
          .box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 12px; }
          .highlight { background: #ecfdf5; border-left: 4px solid #10b981; }
          .warning { background: #fff7ed; border-left: 4px solid #f97316; }
          pre { background: #0f172a; color: #f8fafc; padding: 14px; border-radius: 6px; font-size: 13px; overflow-x: auto; }
          ol, ul { padding-left: 20px; }
          li { margin-bottom: 6px; font-size: 13px; }
        </style>
      </head>
      <body>
        <h1>Recommended Solution & Step-by-Step Fix</h1>
        
        <h2>Problem Summary</h2>
        <div class="box warning"><strong>${problemSummary}</strong></div>

        <h2>Likely Root Cause</h2>
        <div class="box">${rootCause}</div>

        <h2>Recommended Fix / Solution</h2>
        <div class="box highlight">${recommendedFix}</div>

        <h2>Step-by-Step Fix Steps</h2>
        <ol>
          ${steps.map(s => `<li>${s}</li>`).join('')}
        </ol>

        ${codeFix ? `<h2>Example Code Fix</h2><pre><code>${codeFix.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code></pre>` : ''}

        <h2>Verification Checklist</h2>
        <ul>
          ${verification.map(v => `<li>[ ] ${v}</li>`).join('')}
        </ul>

        <script>
          window.onload = function() { window.print(); };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className={cn(
      "bg-white border border-slate-200/90 rounded-2xl shadow-lg flex flex-col overflow-hidden transition-all",
      className
    )}>
      {/* Header bar with actions */}
      <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles className="text-amber-400 shrink-0 animate-pulse" size={18} />
          <h3 className="text-xs sm:text-sm font-extrabold uppercase tracking-wide">
            Recommended Solution & Step-by-Step Fix
          </h3>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopyAll}
            className="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Copy Solution text"
          >
            {copiedAll ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
            <span>{copiedAll ? 'Copied!' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportMarkdown}
            className="h-8 px-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Export as Markdown (.md)"
          >
            <FileText size={13} className="text-blue-400" />
            <span className="hidden sm:inline">Export MD</span>
          </button>

          <button
            type="button"
            onClick={handleExportPDF}
            className="h-8 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Export as PDF"
          >
            <Download size={13} />
            <span>PDF</span>
          </button>
        </div>
      </div>

      {/* Scrollable Notesheet Content Area */}
      <div className="p-5 overflow-y-auto max-h-[550px] space-y-5 text-slate-800 text-xs custom-scrollbar">
        {/* 1. Problem Summary */}
        <div className="bg-slate-50 border border-slate-200/80 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
            <AlertTriangle size={12} className="text-amber-500" />
            Problem Summary
          </div>
          <p className="text-xs font-bold text-slate-900 leading-relaxed">
            {problemSummary}
          </p>
        </div>

        {/* 2. Likely Root Cause */}
        <div className="bg-amber-500/5 border border-amber-500/20 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-700 flex items-center gap-1">
            <HelpCircle size={12} className="text-amber-600" />
            Likely Root Cause
          </div>
          <p className="text-xs font-medium text-slate-800 leading-relaxed">
            {rootCause}
          </p>
        </div>

        {/* 3. Recommended Solution */}
        <div className="bg-emerald-500/5 border border-emerald-500/20 p-3.5 rounded-xl space-y-1">
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Recommended Fix / Solution
          </div>
          <p className="text-xs font-semibold text-emerald-950 leading-relaxed">
            {recommendedFix}
          </p>
        </div>

        {/* 4. Numbered Fix Steps (Collapsible) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <Code2 size={14} className="text-indigo-600" />
              Step-by-Step Fix Steps
            </span>
            <button
              type="button"
              onClick={toggleAllSteps}
              className="text-[10px] font-bold text-indigo-600 hover:underline cursor-pointer flex items-center gap-1"
            >
              {allCollapsed ? 'Expand All' : 'Collapse All'}
            </button>
          </div>

          <div className="space-y-2">
            {steps.map((stepText, idx) => {
              const isCollapsed = collapsedSteps[idx];
              return (
                <div
                  key={idx}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 transition-all"
                >
                  <button
                    type="button"
                    onClick={() => toggleStep(idx)}
                    className="w-full p-3 flex items-start justify-between text-left gap-2 hover:bg-slate-100/70 transition-colors cursor-pointer select-none"
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="shrink-0 w-5 h-5 rounded-full bg-indigo-600 text-white font-bold text-[10px] flex items-center justify-center mt-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-xs font-bold text-slate-900 leading-normal">
                        Step {idx + 1}: {stepText.replace(/^Step\s*\d+:?\s*/i, '')}
                      </span>
                    </div>
                    {isCollapsed ? <ChevronDown size={14} className="text-slate-400 shrink-0 mt-0.5" /> : <ChevronUp size={14} className="text-slate-400 shrink-0 mt-0.5" />}
                  </button>

                  {!isCollapsed && (
                    <div className="px-3.5 pb-3 text-[11px] font-normal text-slate-600 border-t border-slate-100 pt-2 bg-white">
                      Verify and apply this step carefully in your development environment before committing code.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Code Fix Snippet */}
        {codeFix && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <FileCode size={14} className="text-indigo-600" />
                Example Code Fix
              </span>
              <button
                type="button"
                onClick={handleCopyCode}
                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-1"
              >
                {copiedCode ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
                <span>{copiedCode ? 'Copied Code' : 'Copy Code'}</span>
              </button>
            </div>
            <pre className="p-3.5 bg-slate-950 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed overflow-x-auto border border-slate-800">
              <code>{codeFix}</code>
            </pre>
          </div>
        )}

        {/* 6. Verification Checklist */}
        <div className="bg-slate-50/80 border border-slate-200 p-3.5 rounded-xl space-y-2">
          <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 block">
            Verification Checklist (Confirm Fix)
          </span>
          <div className="space-y-1.5">
            {verification.map((item, idx) => (
              <label key={idx} className="flex items-start gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium">
                <input
                  type="checkbox"
                  className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5 mt-0.5 shrink-0"
                />
                <span>{item}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
