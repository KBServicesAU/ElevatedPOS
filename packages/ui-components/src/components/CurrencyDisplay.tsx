import React from 'react';

interface CurrencyDisplayProps {
  amount: number;
  currency?: string;
  locale?: string;
  className?: string;
  showSymbol?: boolean;
}

export function CurrencyDisplay({
  amount,
  currency = 'AUD',
  locale = 'en-AU',
  className = '',
  showSymbol = true,
}: CurrencyDisplayProps) {
  const formatted = new Intl.NumberFormat(locale, {
    style: showSymbol ? 'currency' : 'decimal',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return <span className={className}>{formatted}</span>;
}
