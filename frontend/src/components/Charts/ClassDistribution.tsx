import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { useChartTheme } from '../../hooks/useChartTheme';

interface ClassDistributionProps {
  data: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

export const ClassDistribution: React.FC<ClassDistributionProps> = ({ data }) => {
  const chartTheme = useChartTheme();
  
  const total = data.critical + data.high + data.medium + data.low;

  const chartData = [
    { name: 'Critical', value: data.critical, color: '#DC2626' },
    { name: 'High', value: data.high, color: '#D97706' },
    { name: 'Medium', value: data.medium, color: '#2563EB' },
    { name: 'Low', value: data.low, color: '#16A34A' },
  ].filter(item => item.value > 0); // Hide zero values

  // If all values are 0, use placeholder to avoid blank screen
  const displayData = chartData.length > 0 ? chartData : [
    { name: 'No Data', value: 1, color: '#64748B' }
  ];

  return (
    <div className="flex flex-col md:flex-row items-center gap-4 h-[200px]">
      <div className="w-1/2 h-[180px] relative flex items-center justify-center">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={displayData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={75}
              paddingAngle={2}
              dataKey="value"
            >
              {displayData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke={chartTheme.tooltipBg} strokeWidth={1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold text-foreground leading-none">{total}</span>
          <span className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">Total</span>
        </div>
      </div>

      <div className="flex-1 w-full flex flex-col gap-2">
        {[
          { name: 'Critical', value: data.critical, color: '#DC2626' },
          { name: 'High', value: data.high, color: '#D97706' },
          { name: 'Medium', value: data.medium, color: '#2563EB' },
          { name: 'Low', value: data.low, color: '#16A34A' },
        ].map((item) => (
          <div key={item.name} className="flex items-center justify-between text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: item.color }} />
              <span className="text-muted-foreground">{item.name}</span>
            </div>
            <span className="text-foreground">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClassDistribution;
