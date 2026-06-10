import React from 'react';
import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { cn } from '../lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  trend?: {
    value: number; // percentage change
    label: string; // "vs yesterday"
    direction: 'up' | 'down' | 'neutral';
    positiveIsGood?: boolean; // default: true
  };
  sparkline?: number[];
  loading?: boolean;
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-muted-foreground',
  trend,
  sparkline,
  loading = false,
  onClick,
}) => {
  if (loading) {
    return (
      <div className="bg-card border border-border rounded-lg p-6 animate-pulse flex flex-col justify-between h-[120px]">
        <div className="flex justify-between items-center">
          <div className="h-2.5 w-16 bg-muted rounded" />
          <div className="h-4 w-4 bg-muted rounded-full" />
        </div>
        <div className="h-7 w-24 bg-muted rounded my-2" />
        <div className="h-3.5 w-32 bg-muted rounded" />
      </div>
    );
  }

  const handleTrendElement = () => {
    if (!trend) return null;
    const { value: val, label, direction, positiveIsGood = true } = trend;
    const isUp = direction === 'up';
    const isDown = direction === 'down';

    let colorClass = 'text-muted-foreground';
    let ArrowIcon = Minus;

    if (isUp) {
      ArrowIcon = TrendingUp;
      colorClass = positiveIsGood ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
    } else if (isDown) {
      ArrowIcon = TrendingDown;
      colorClass = positiveIsGood ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400';
    }

    return (
      <div className={cn("flex items-center gap-1 text-xs font-medium mt-1", colorClass)}>
        <ArrowIcon size={12} className="shrink-0" />
        <span>{val > 0 ? `+${val}%` : `${val}%`}</span>
        <span className="text-muted-foreground font-normal">{label}</span>
      </div>
    );
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-card border-none rounded-3xl p-6 flex flex-col justify-between transition-colors duration-150 shadow-xl h-[136px]",
        onClick && "cursor-pointer hover:bg-muted/10"
      )}
    >
      <div className="flex justify-between items-start">
        <span className="text-[10px] font-semibold text-muted-foreground tracking-wider uppercase">
          {title}
        </span>
        <Icon size={16} className={cn("shrink-0", iconColor)} />
      </div>

      <div className="flex-1 flex flex-col justify-end mt-2">
        <div className="text-2xl font-semibold tracking-tight text-foreground leading-none">
          {value}
        </div>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {handleTrendElement()}

        {sparkline && sparkline.length > 0 && (
          <div className="h-10 w-full mt-2 overflow-hidden">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkline.map((v, i) => ({ value: v, id: i }))}>
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={iconColor.includes('#') ? iconColor : '#2563EB'}
                  strokeWidth={1.5}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

export default MetricCard;
