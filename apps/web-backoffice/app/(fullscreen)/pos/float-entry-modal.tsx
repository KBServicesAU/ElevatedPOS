'use client';

import { DollarSign, Check } from 'lucide-react';
import { useState } from 'react';

const QUICK_AMOUNTS = [50, 100, 200, 500];

export function FloatEntryModal({ onConfirm }: { onConfirm: (amount: number) => void }) {
  const [display, setDisplay] = useState('0');

  const numericValue = parseFloat(display) || 0;

  function handleDigit(digit: string) {
    setDisplay(prev => {
      // Prevent multiple decimal points
      if (digit === '.' && prev.includes('.')) return prev;
      // Prevent leading zeros (except before decimal)
      if (prev === '0' && digit !== '.') return digit;
      // Limit to 2 decimal places
      if (prev.includes('.')) {
        const decimals = prev.split('.')[1];
        if (decimals && decimals.length >= 2) return prev;
      }
      return prev + digit;
    });
  }

  function handleBackspace() {
    setDisplay(prev => {
      if (prev.length <= 1) return '0';
      const next = prev.slice(0, -1);
      return next === '' ? '0' : next;
    });
  }

  function handleQuickAmount(amount: number) {
    setDisplay(amount.toString());
  }

  function formatDisplay(value: string): string {
    const num = parseFloat(value) || 0;
    return num.toFixed(2);
  }

  return (
    <div className="fixed inset-0 bg-[#0f0f0f] flex items-center justify-center">
      <div className="bg-[#1a1a2e] rounded-2xl p-8 w-full max-w-sm mx-4 flex flex-col gap-6">
        {/* Header */}
        <div className="text-center">
          <div className="flex items-center justify-center gap-2 mb-1">
            <DollarSign className="text-blue-400" size={28} />
            <h1 className="text-white text-2xl font-bold">Open Till</h1>
          </div>
          <p className="text-gray-400 text-sm">Enter your opening float amount</p>
        </div>

        {/* Amount Display */}
        <div className="bg-[#0f0f0f] rounded-xl px-6 py-4 text-center">
          <span className="text-gray-400 text-2xl mr-1">$</span>
          <span className="text-white text-5xl font-mono font-bold">
            {formatDisplay(display)}
          </span>
        </div>

        {/* Quick Amounts */}
        <div className="grid grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map(amount => (
            <button
              key={amount}
              onClick={() => handleQuickAmount(amount)}
              className="bg-[#0f0f0f] hover:bg-[#252545] text-gray-300 hover:text-white text-sm rounded-lg py-2 transition-colors"
            >
              ${amount}
            </button>
          ))}
        </div>

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-2">
          {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map(digit => (
            <button
              key={digit}
              onClick={() => handleDigit(digit)}
              className="bg-[#0f0f0f] hover:bg-[#252545] text-white text-xl font-semibold rounded-xl py-4 transition-colors active:scale-95"
            >
              {digit}
            </button>
          ))}
          <button
            onClick={() => handleDigit('.')}
            className="bg-[#0f0f0f] hover:bg-[#252545] text-white text-xl font-semibold rounded-xl py-4 transition-colors active:scale-95"
          >
            .
          </button>
          <button
            onClick={() => handleDigit('0')}
            className="bg-[#0f0f0f] hover:bg-[#252545] text-white text-xl font-semibold rounded-xl py-4 transition-colors active:scale-95"
          >
            0
          </button>
          <button
            onClick={handleBackspace}
            className="bg-[#0f0f0f] hover:bg-[#252545] text-gray-400 hover:text-white text-xl font-semibold rounded-xl py-4 transition-colors active:scale-95"
          >
            ⌫
          </button>
        </div>

        {/* Open Till Button */}
        <button
          onClick={() => onConfirm(numericValue)}
          disabled={numericValue === 0}
          className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white font-semibold text-lg rounded-xl py-4 transition-colors disabled:cursor-not-allowed"
        >
          <Check size={20} />
          Open Till
        </button>
      </div>
    </div>
  );
}
