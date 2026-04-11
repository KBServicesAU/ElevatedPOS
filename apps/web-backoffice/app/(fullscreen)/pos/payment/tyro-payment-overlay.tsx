'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, Loader2, X, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import {
  loadTyroScript,
  initiateTyroPurchase,
  simulateTyroPurchase,
  cancelTyroTransaction,
  type TyroConfig,
  type TyroTransactionResult,
} from '@/lib/tyro-provider';

interface TyroPaymentOverlayProps {
  /** Amount in dollars (will be converted to cents) */
  amount: number;
  /** Tyro configuration */
  config: TyroConfig | null;
  /** Called when transaction is approved */
  onApproved: (result: {
    transactionRef: string;
    cardLast4: string;
    cardBrand: string;
    authCode: string;
    receiptData?: { merchantReceipt?: string; customerReceipt?: string };
    surchargeAmount?: number;
    tipAmount?: number;
    totalAmount?: number;
  }) => void;
  /** Called when transaction is declined/cancelled/failed */
  onFailed: (reason: string) => void;
  /** Called when user cancels */
  onCancel: () => void;
}

type Phase = 'loading' | 'processing' | 'approved' | 'declined' | 'error';

export function TyroPaymentOverlay({
  amount,
  config,
  onApproved,
  onFailed,
  onCancel,
}: TyroPaymentOverlayProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [statusMessage, setStatusMessage] = useState('Connecting to Tyro terminal...');
  const [errorMessage, setErrorMessage] = useState('');
  const initiatedRef = useRef(false);

  useEffect(() => {
    if (initiatedRef.current) return;
    initiatedRef.current = true;

    const amountCents = Math.round(amount * 100);

    async function runTransaction() {
      try {
        let result: TyroTransactionResult;

        if (!config || !config.apiKey) {
          // Demo mode — simulate
          setStatusMessage('Simulating Tyro payment...');
          setPhase('processing');
          result = await simulateTyroPurchase(amountCents);
        } else {
          // Real Tyro transaction
          setStatusMessage('Loading Tyro terminal...');
          await loadTyroScript(config.testMode);

          setPhase('processing');
          setStatusMessage('Waiting for card on terminal...');

          result = await initiateTyroPurchase(config, amountCents, {
            onStatusMessage: (msg) => setStatusMessage(msg),
            onReceipt: () => { /* handled in transactionComplete */ },
            onQuestion: (question, answer) => {
              // Auto-answer common questions — for headful mode, Tyro's UI handles these
              // This callback is for edge cases
              answer('YES');
            },
          });
        }

        // Handle result
        if (result.result === 'APPROVED') {
          setPhase('approved');
          setStatusMessage('Payment approved!');
          // Brief delay to show the approved state
          setTimeout(() => {
            onApproved({
              transactionRef: result.transactionId ?? `TYRO-${Date.now()}`,
              cardLast4: result.cardLast4 ?? '****',
              cardBrand: result.cardType ?? 'Card',
              authCode: result.authCode ?? '',
              receiptData: result.customerReceipt || result.merchantReceipt
                ? { merchantReceipt: result.merchantReceipt, customerReceipt: result.customerReceipt }
                : undefined,
              surchargeAmount: result.surchargeAmount ? parseFloat(result.surchargeAmount) : undefined,
              tipAmount: result.tipAmount ? parseFloat(result.tipAmount) : undefined,
              totalAmount: result.transactionAmount ? parseFloat(result.transactionAmount) : undefined,
            });
          }, 800);
        } else if (result.result === 'CANCELLED') {
          setPhase('declined');
          setErrorMessage('Transaction was cancelled.');
          setTimeout(() => onFailed('Transaction cancelled'), 1500);
        } else if (result.result === 'DECLINED') {
          setPhase('declined');
          setErrorMessage('Card was declined. Please try another card.');
          setTimeout(() => onFailed('Card declined'), 2000);
        } else {
          setPhase('error');
          setErrorMessage(`Transaction failed: ${result.result}`);
          setTimeout(() => onFailed(result.result), 2000);
        }
      } catch (err) {
        setPhase('error');
        const msg = err instanceof Error ? err.message : 'Unknown error';
        setErrorMessage(msg);
        setTimeout(() => onFailed(msg), 2000);
      }
    }

    runTransaction();
  }, [amount, config, onApproved, onFailed]);

  function handleCancel() {
    cancelTyroTransaction();
    onCancel();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-[#1a1a2e] rounded-2xl w-full max-w-md mx-4 p-8 shadow-2xl border border-white/10 text-center">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {phase === 'approved' ? (
            <div className="w-20 h-20 rounded-full bg-green-900/30 border-2 border-green-500 flex items-center justify-center">
              <CheckCircle size={40} className="text-green-400" />
            </div>
          ) : phase === 'declined' || phase === 'error' ? (
            <div className="w-20 h-20 rounded-full bg-red-900/30 border-2 border-red-500 flex items-center justify-center">
              {phase === 'declined' ? (
                <XCircle size={40} className="text-red-400" />
              ) : (
                <AlertTriangle size={40} className="text-red-400" />
              )}
            </div>
          ) : (
            <div className="w-20 h-20 rounded-full bg-indigo-900/30 border-2 border-indigo-500 flex items-center justify-center">
              {phase === 'loading' ? (
                <Loader2 size={40} className="text-indigo-400 animate-spin" />
              ) : (
                <CreditCard size={40} className="text-indigo-400 animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* Amount */}
        <p className="text-3xl font-black text-white mb-2">
          ${amount.toFixed(2)}
        </p>

        {/* Status */}
        <p className={`text-sm font-medium mb-6 ${
          phase === 'approved' ? 'text-green-400'
          : phase === 'declined' || phase === 'error' ? 'text-red-400'
          : 'text-gray-400'
        }`}>
          {errorMessage || statusMessage}
        </p>

        {/* Demo badge */}
        {(!config || !config.apiKey) && (
          <div className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-yellow-900/30 border border-yellow-700/40 mb-4">
            <span className="text-xs font-semibold text-yellow-400">DEMO MODE</span>
          </div>
        )}

        {/* Tyro branding */}
        <p className="text-xs text-gray-600 mb-6">
          Powered by Tyro EFTPOS
        </p>

        {/* Cancel button — only during processing */}
        {(phase === 'loading' || phase === 'processing') && (
          <button
            onClick={handleCancel}
            className="w-full py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/30 font-semibold text-sm transition-colors flex items-center justify-center gap-2"
          >
            <X size={16} />
            Cancel Transaction
          </button>
        )}
      </div>
    </div>
  );
}
