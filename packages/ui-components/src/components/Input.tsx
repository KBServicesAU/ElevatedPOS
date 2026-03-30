import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export function Input({
  label,
  error,
  hint,
  prefix,
  suffix,
  disabled,
  className = '',
  id,
  ...props
}: InputProps) {
  const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-zinc-300"
        >
          {label}
        </label>
      )}
      <div
        className={`flex items-center rounded-lg border bg-zinc-800 transition-colors focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-1 focus-within:ring-offset-zinc-900
          ${error ? 'border-red-500' : 'border-zinc-700 focus-within:border-orange-500'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {prefix && (
          <div className="flex items-center pl-3 text-zinc-500 flex-shrink-0">
            {prefix}
          </div>
        )}
        <input
          id={inputId}
          disabled={disabled}
          className={`flex-1 bg-transparent px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 outline-none disabled:cursor-not-allowed ${prefix ? 'pl-2' : ''} ${suffix ? 'pr-2' : ''} ${className}`}
          {...props}
        />
        {suffix && (
          <div className="flex items-center pr-3 text-zinc-500 flex-shrink-0">
            {suffix}
          </div>
        )}
      </div>
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
      {hint && !error && (
        <p className="text-xs text-zinc-500">{hint}</p>
      )}
    </div>
  );
}
