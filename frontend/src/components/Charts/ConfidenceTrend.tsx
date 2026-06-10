import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface ConfidenceTrendProps {
  data: {
    timestamps: string[];
    confidences: number[];
  };
}

export const ConfidenceTrend: React.FC<ConfidenceTrendProps> = ({ data }) => {
  const chartTheme = useChartTheme();

  // Map arrays into objects format
  const chartData = data.timestamps.map((time, idx) => ({
    time,
    confidence: Math.round((data.confidences[idx] || 0) * 100),
  }));

  return (
    <div className="w-full h-[200px]">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="confidenceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#2563EB" stopOpacity={0.15} />
              <stop offset="95%" stopColor="#2563EB" stopOpacity={0.01} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={chartTheme.gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            axisLine={{ stroke: chartTheme.axisStroke }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            domain={[0, 100]}
            tickFormatter={(val) => `${val}%`}
            axisLine={false}
            tickLine={false}
            orientation="right"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: chartTheme.tooltipBg,
              border: `1px solid ${chartTheme.tooltipBorder}`,
              borderRadius: '6px',
              fontSize: '12px',
              color: chartTheme.tooltipText,
              boxShadow: 'none',
            }}
            cursor={{ stroke: chartTheme.gridColor, strokeWidth: 1 }}
            formatter={(value) => [`${value}%`, 'Confidence']}
          />
          <Area
            type="monotone"
            dataKey="confidence"
            stroke="#2563EB"
            strokeWidth={1.5}
            fillOpacity={1}
            fill="url(#confidenceGrad)"
            activeDot={{ r: 4, strokeWidth: 0 }}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ConfidenceTrend;
