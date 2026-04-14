import { useEffect, useRef } from 'react';
import {
  addTyroListener,
  type TyroReceiptEvent,
  type TyroTransactionResult,
} from '../modules/tyro-tta';

/**
 * Headful Tyro transaction bridge component.
 *
 * In headful (IClientWithUI) mode Tyro renders its own transaction UI
 * inside a native WebView overlay that the TyroTTAModule shows/hides
 * automatically. This component has NO visible UI — it simply listens
 * for the native events while `visible` is true and calls `onComplete`
 * when the transaction finishes.
 *
 * The existing callers (POS, Orders, QuickSale screens) retain the same
 * props interface so they require no changes.
 */

export interface TyroTransactionOutcome {
  result: TyroTransactionResult;
  /** Merchant receipt text from receiptCallback (when integratedReceipt=true). */
  merchantReceipt?: string;
  /** Whether the terminal requested a merchant-copy signature. */
  signatureRequired?: boolean;
}

export interface TyroTransactionModalProps {
  visible: boolean;
  /** Sale amount in dollars — kept for API compatibility, not displayed. */
  amount: number;
  /** Title string — kept for API compatibility, not displayed. */
  title?: string;
  /** Called once the transaction is complete (any outcome). */
  onComplete: (outcome: TyroTransactionOutcome) => void;
  /** Called when the modal wants to close — kept for API compatibility. */
  onClose: () => void;
}

export function TyroTransactionModal({
  visible,
  onComplete,
}: TyroTransactionModalProps) {
  const receiptRef = useRef<TyroReceiptEvent | null>(null);

  useEffect(() => {
    if (!visible) {
      receiptRef.current = null;
      return;
    }

    receiptRef.current = null;

    const subs = [
      addTyroListener('onReceipt', (e) => {
        // Capture the merchant receipt for forwarding with the outcome.
        receiptRef.current = e;
      }),
      addTyroListener('onTransactionComplete', (e) => {
        const result = e.response ?? { result: 'UNKNOWN' };
        onComplete({
          result,
          merchantReceipt: receiptRef.current?.merchantReceipt,
          signatureRequired: receiptRef.current?.signatureRequired,
        });
      }),
    ];

    return () => {
      subs.forEach((s) => s.remove());
    };
  }, [visible, onComplete]);

  // No visible UI — Tyro's native WebView overlay is the UI.
  return null;
}
