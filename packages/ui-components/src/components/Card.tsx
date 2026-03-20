import React from 'react';

interface CardProps {
  title?: string;
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function Card({ title, description, footer, children, className = '' }: CardProps) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900 shadow-sm ${className}`}>
      {(title ?? description) && (
        <div className="px-5 py-4 border-b border-zinc-800">
          {title && <h3 className="text-sm font-semibold text-zinc-100">{title}</h3>}
          {description && <p className="mt-0.5 text-sm text-zinc-500">{description}</p>}
        </div>
      )}
      {children && <div className="px-5 py-4">{children}</div>}
      {footer && (
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-900/50 rounded-b-xl">
          {footer}
        </div>
      )}
    </div>
  );
}
