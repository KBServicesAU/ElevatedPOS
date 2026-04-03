'use client';

import { ArrowDownCircle, ArrowUpCircle, X } from 'lucide-react';
import { useState } from 'react';

interface AdjustFloatModalProps {
  staffId: string;
  staffName: string;
  onConfirm: (type: 'deposit' | 'withdrawal', amount: number, reason?: string) => void;
  onClose: () => void;
}

export function AdjustFloatModal({ staffId: _staffId, staffName: _staffName, onConfirm, onClose }: AdjustFloatModalProps) {
  const [tab, setTab] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState<string>('');
  const [reason, setReason] = useState('');

  const parsedAmount = parseFloat(amount) || 0;
  const isValid = parsedAmount > 0;

  function handleApply() {
    if (!isValid) return;
    onConfirm(tab, parsedAmount, reason.trim() || undefined);
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-sm mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-white text-lg font-semibold">Adjust Float</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-5">
          {/* Tab Buttons */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setTab('deposit')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                tab === 'deposit'
                  ? 'bg-green-600 text-white'
                  : 'bg-[#0f0f0f] text-gray-400 hover:text-white'
              }`}
            >
              <ArrowDownCircle size={18} />
              Deposit
            </button>
            <button
              onClick={() => setTab('withdrawal')}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                tab === 'withdrawal'
                  ? 'bg-red-600 text-white'
                  : 'bg-[#0f0f0f] text-gray-400 hover:text-white'
              }`}
            >
              <ArrowUpCircle size={18} />
              Withdrawal
            </button>
          </div>

          {/* Amount Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">
              Amount
            </label>
            <div className="flex items-center bg-[#0f0f0f] rounded-xl px-4 py-3 gap-2">
              <span className="text-gray-400 text-lg">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="bg-transparent text-white text-xl font-mono flex-1 outline-none placeholder:text-gray-600"
              />
            </div>
          </div>

          {/* Reason Input */}
          <div className="flex flex-col gap-1.5">
            <label className="text-gray-400 text-xs font-medium uppercase tracking-wide">
              Reason <span className="normal-case text-gray-600">(optional)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. Safe drop, change run..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="bg-[#0f0f0f] text-white rounded-xl px-4 py-3 outline-none placeholder:text-gray-600 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              onClick={onClose}
              className="py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/30 font-semibold text-sm transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!isValid}
              className={`py-3 rounded-xl font-semibold text-sm transition-colors ${
                isValid
                  ? tab === 'deposit'
                    ? 'bg-green-600 hover:bg-green-500 text-white'
                    : 'bg-red-600 hover:bg-red-500 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
