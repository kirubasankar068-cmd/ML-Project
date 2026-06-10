import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface DepartmentMatrixProps {
  data: {
    departments: string[];
    critical: number[];
    high: number[];
    medium: number[];
    low: number[];
  };
  onSelectDepartment?: (dept: string) => void;
}

export const DepartmentMatrix: React.FC<DepartmentMatrixProps> = ({ data, onSelectDepartment }) => {
  const chartTheme = useChartTheme();

  const chartData = data.departments.map((dept, idx) => ({
    name: dept,
    Critical: data.critical[idx] || 0,
    High: data.high[idx] || 0,
    Medium: data.medium[idx] || 0,
    Low: data.low[idx] || 0,
  }));

  const handleClick = (state: any) => {
    if (onSelectDepartment && state && state.activeLabel) {
      onSelectDepartment(state.activeLabel);
    }
  };

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          layout="vertical"
          data={chartData}
          margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
          onClick={handleClick}
        >
          <CartesianGrid stroke={chartTheme.gridColor} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            axisLine={{ stroke: chartTheme.axisStroke }}
            tickLine={false}
          />
          <YAxis
            type="category"
            dataKey="name"
            tick={{ fill: chartTheme.textColor, fontSize: 10 }}
            width={90}
            axisLine={false}
            tickLine={false}
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
            cursor={{ fill: chartTheme.gridColor, opacity: 0.1 }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            height={36}
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: '11px', fontWeight: 500 }}
          />
          <Bar dataKey="Critical" stackId="a" fill="#DC2626" radius={[0, 0, 0, 0]} />
          <Bar dataKey="High" stackId="a" fill="#D97706" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Medium" stackId="a" fill="#2563EB" radius={[0, 0, 0, 0]} />
          <Bar dataKey="Low" stackId="a" fill="#16A34A" radius={[2, 2, 2, 2]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default DepartmentMatrix;
