import React from 'react';
import { PriorityLabel } from '../types';
import { getPriorityConfig, cn } from '../lib/utils';

interface PriorityBadgeProps {
  label: PriorityLabel;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'ghost';
  showIcon?: boolean;
}

export const PriorityBadge: React.FC<PriorityBadgeProps> = ({
  label,
  size = 'md',
  variant = 'solid',
  showIcon = true,
}) => {
  const config = getPriorityConfig(label);
  const Icon = config.icon;

  const sizeClasses = {
    sm: 'text-[10px] py-0.5 px-2.5 rounded-full gap-1',
    md: 'text-xs py-1 px-3 rounded-full gap-1.5',
    lg: 'text-sm py-1.5 px-4.5 rounded-full gap-2',
  };

  const variantClasses = {
    solid: `${config.textClass} ${config.bgClass} border ${config.borderClass}`,
    outline: `${config.textClass} border ${config.borderClass} bg-transparent`,
    ghost: `${config.textClass} bg-transparent border-transparent`,
  };

  const iconSizes = {
    sm: 10,
    md: 12,
    lg: 14,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center font-medium select-none tracking-normal uppercase border-solid',
        sizeClasses[size],
        variantClasses[variant]
      )}
    >
      {showIcon && Icon && <Icon size={iconSizes[size]} className="shrink-0" />}
      <span>{label}</span>
    </span>
  );
};

export default PriorityBadge;
