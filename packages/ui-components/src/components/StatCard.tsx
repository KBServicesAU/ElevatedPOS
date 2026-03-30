import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: number;
  icon: React.ReactNode;
  iconColor?: string;
  className?: string;
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  iconColor = 'text-orange-400',
  className = '',
}: StatCardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  const deltaDisplay =
    delta !== undefined
      ? `${isPositive ? '+' : ''}${delta.toFixed(1)}%`
      : null;

  return (
    <div
      className={`rounded-xl border border-zinc-800 bg-zinc-900 px-5 py-4 shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
            {label}
          </p>
          <p className="text-2xl font-bold text-zinc-100">{value}</p>
          {deltaDisplay !== null && (
            <p
              className={`text-xs font-semibold ${
                isPositive ? 'text-emerald-400' : 'text-red-400'
              }`}
            >
              {deltaDisplay} vs last period
            </p>
          )}
        </div>
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-800 ${iconColor}`}
        >
          {icon}
        </div>
      </div>
    </div>
  );
}
