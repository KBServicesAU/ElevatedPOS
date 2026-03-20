import React from 'react';

export type OrderStatusValue =
  | 'pending'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'captured'
  | 'failed'
  | 'partially_refunded';

interface StatusPillProps {
  status: OrderStatusValue | string;
  className?: string;
}

const statusConfig: Record<string, { label: string; classes: string }> = {
  pending:             { label: 'Pending',            classes: 'bg-zinc-800 text-zinc-400 border-zinc-700' },
  confirmed:           { label: 'Confirmed',          classes: 'bg-blue-900/50 text-blue-400 border-blue-800' },
  preparing:           { label: 'Preparing',          classes: 'bg-amber-900/50 text-amber-400 border-amber-800' },
  ready:               { label: 'Ready',              classes: 'bg-purple-900/50 text-purple-400 border-purple-800' },
  completed:           { label: 'Completed',          classes: 'bg-emerald-900/50 text-emerald-400 border-emerald-800' },
  cancelled:           { label: 'Cancelled',          classes: 'bg-zinc-800 text-zinc-500 border-zinc-700' },
  refunded:            { label: 'Refunded',           classes: 'bg-red-900/30 text-red-400 border-red-900' },
  captured:            { label: 'Paid',               classes: 'bg-emerald-900/50 text-emerald-400 border-emerald-800' },
  failed:              { label: 'Failed',             classes: 'bg-red-900/50 text-red-400 border-red-800' },
  partially_refunded:  { label: 'Part. Refunded',     classes: 'bg-amber-900/30 text-amber-400 border-amber-900' },
};

export function StatusPill({ status, className = '' }: StatusPillProps) {
  const config = statusConfig[status] ?? { label: status, classes: 'bg-zinc-800 text-zinc-400 border-zinc-700' };

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${config.classes} ${className}`}
    >
      {config.label}
    </span>
  );
}
