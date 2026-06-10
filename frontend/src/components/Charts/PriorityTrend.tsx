import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface PriorityTrendProps {
  data: {
    dates: string[];
    critical: number[];
    high: number[];
    medium: number[];
    low: number[];
  };
}

export const PriorityTrend: React.FC<PriorityTrendProps> = ({ data }) => {
  const chartTheme = useChartTheme();

  // Format the data array of arrays into objects
  const chartData = data.dates.map((date, idx) => {
    // extract day of week/date label
    let formattedDate = date;
    try {
      const parts = date.split('-');
      if (parts.length === 3) {
        formattedDate = `${parts[1]}/${parts[2]}`; // "MM/DD"
      }
    } catch {
      // ignore formatting error
    }

    return {
      date: formattedDate,
      Critical: data.critical[idx] || 0,
      High: data.high[idx] || 0,
      Medium: data.medium[idx] || 0,
      Low: data.low[idx] || 0,
    };
  });

  return (
    <div className="w-full h-[240px]">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid stroke={chartTheme.gridColor} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            axisLine={{ stroke: chartTheme.axisStroke }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            allowDecimals={false}
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
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', fontWeight: 500 }}
          />
          <Line type="monotone" dataKey="Critical" stroke="#DC2626" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="High" stroke="#D97706" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="Medium" stroke="#2563EB" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
          <Line type="monotone" dataKey="Low" stroke="#16A34A" strokeWidth={1.5} dot={false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriorityTrend;
