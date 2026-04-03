'use client';

import { useState } from 'react';
import { Delete } from 'lucide-react';

/**
 * Reusable numeric PIN pad.
 * Used for: kiosk admin exit lock, staff login PIN entry.
 */
interface PinPadProps {
  title: string;
  subtitle?: string;
  /** How many digits to collect. Default: 4 */
  length?: number;
  onSubmit: (pin: string) => void;
  onCancel?: () => void;
  error?: string | null;
  confirmLabel?: string;
}

export function PinPad({
  title,
  subtitle,
  length = 4,
  onSubmit,
  onCancel,
  error,
  confirmLabel = 'Confirm',
}: PinPadProps) {
  const [digits, setDigits] = useState('');

  const append = (d: string) => {
    if (digits.length < length) setDigits((prev) => prev + d);
  };

  const backspace = () => setDigits((prev) => prev.slice(0, -1));

  const submit = () => {
    if (digits.length === length) {
      onSubmit(digits);
      setDigits('');
    }
  };

  const ROWS = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', '⌫'],
  ];

  return (
    <div className="flex min-h-screen items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-xs rounded-2xl bg-[#1a1a2e] p-8 shadow-2xl">
        <h2 className="mb-1 text-center text-xl font-extrabold text-white">{title}</h2>
        {subtitle && <p className="mb-5 text-center text-sm text-gray-400">{subtitle}</p>}

        {/* Digit dots */}
        <div className="mb-6 flex justify-center gap-3">
          {Array.from({ length }).map((_, i) => (
            <div
              key={i}
              className={`h-4 w-4 rounded-full border-2 transition-all ${
                i < digits.length
                  ? 'border-indigo-400 bg-indigo-400'
                  : 'border-gray-600 bg-transparent'
              }`}
            />
          ))}
        </div>

        {error && (
          <p className="mb-4 rounded-xl bg-red-900/30 px-3 py-2 text-center text-sm text-red-400">
            {error}
          </p>
        )}

        {/* Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {ROWS.flat().map((key, idx) => {
            if (key === '') return <div key={idx} />;
            if (key === '⌫') {
              return (
                <button
                  key={idx}
                  onClick={backspace}
                  className="flex h-14 items-center justify-center rounded-xl bg-[#16213e] text-gray-300 transition-colors hover:bg-[#1e2a50] active:scale-95"
                >
                  <Delete className="h-5 w-5" />
                </button>
              );
            }
            return (
              <button
                key={idx}
                onClick={() => append(key)}
                className="flex h-14 items-center justify-center rounded-xl bg-[#16213e] text-xl font-bold text-white transition-colors hover:bg-[#1e2a50] active:scale-95"
              >
                {key}
              </button>
            );
          })}
        </div>

        <button
          onClick={submit}
          disabled={digits.length !== length}
          className="mt-4 w-full rounded-xl bg-indigo-600 py-3.5 text-base font-bold text-white disabled:opacity-40 hover:bg-indigo-500"
        >
          {confirmLabel}
        </button>

        {onCancel && (
          <button
            onClick={onCancel}
            className="mt-2 w-full py-2 text-sm text-gray-500 hover:text-gray-300"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
