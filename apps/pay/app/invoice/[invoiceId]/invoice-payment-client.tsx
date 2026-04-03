'use client';

import { useState, useCallback } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { PayHeader } from '@/components/pay-header';

interface InvoiceLine {
  description: string | null;
  amount: number;
  quantity: number | null;
}

interface PublicInvoice {
  id: string;
  number: string | null;
  status: string;
  amountDue: number;
  amountPaid: number;
  currency: string;
  dueDate: string | null;
  customerEmail: string | null;
  customerName: string | null;
  description: string | null;
  lines: InvoiceLine[];
  invoicePdf: string | null;
}

function fmt(cents: number, currency = 'AUD') {
  return (cents / 100).toLocaleString('en-AU', { style: 'currency', currency: currency.toUpperCase() });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: 'bg-green-100 text-green-800',
    open: 'bg-yellow-100 text-yellow-800',
    draft: 'bg-gray-100 text-gray-600',
    void: 'bg-gray-100 text-gray-400',
    uncollectible: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${map[status] ?? 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function PaymentForm({ invoice, orgId }: { invoice: PublicInvoice; orgId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    setError(null);

    const { error: submitErr } = await elements.submit();
    if (submitErr) { setError(submitErr.message ?? 'Payment failed'); setPaying(false); return; }

    const res = await fetch(`/api/pay-intent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoiceId: invoice.id, orgId }),
    });

    if (!res.ok) {
      setError('Failed to initialise payment. Please try again.');
      setPaying(false);
      return;
    }

    const { clientSecret } = await res.json() as { clientSecret: string };

    const { error: confirmErr } = await stripe.confirmPayment({
      elements,
      clientSecret,
      confirmParams: {
        return_url: `${window.location.origin}/invoice/${invoice.id}/success`,
      },
    });

    if (confirmErr) {
      setError(confirmErr.message ?? 'Payment failed');
      setPaying(false);
    }
  }

  return (
    <form onSubmit={handlePay} className="space-y-4">
      <PaymentElement />
      {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}
      <button
        type="submit"
        disabled={paying || !stripe}
        className="w-full bg-zinc-900 text-white py-3 rounded-xl font-semibold text-sm hover:bg-zinc-800 disabled:opacity-50 transition-colors"
      >
        {paying ? 'Processing\u2026' : `Pay ${fmt(invoice.amountDue, invoice.currency)}`}
      </button>
    </form>
  );
}

export function InvoicePaymentClient({
  invoice,
  orgId,
  stripePublishableKey,
}: {
  invoice: PublicInvoice;
  orgId: string;
  stripePublishableKey: string;
}) {
  const [stripePromise] = useState(() => loadStripe(stripePublishableKey));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loadingSecret, setLoadingSecret] = useState(false);
  const [secretError, setSecretError] = useState<string | null>(null);
  const [showPayForm, setShowPayForm] = useState(false);

  const handlePayNow = useCallback(async () => {
    setLoadingSecret(true);
    setSecretError(null);
    try {
      const res = await fetch('/api/pay-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId: invoice.id, orgId }),
      });
      if (!res.ok) throw new Error('Failed to initialise payment');
      const data = await res.json() as { clientSecret: string };
      setClientSecret(data.clientSecret);
      setShowPayForm(true);
    } catch (err) {
      setSecretError(err instanceof Error ? err.message : 'Error loading payment form');
    } finally {
      setLoadingSecret(false);
    }
  }, [invoice.id, orgId]);

  const isPaid = invoice.status === 'paid';
  const isVoid = invoice.status === 'void' || invoice.status === 'uncollectible';

  return (
    <div className="min-h-screen bg-zinc-50">
      <PayHeader subtitle="Secure Invoice Payment" />
      <div className="max-w-lg mx-auto px-4 py-8">

        {/* Invoice card */}
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm mb-6">
          <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Invoice</p>
              <h1 className="text-xl font-bold text-zinc-900 mt-0.5">
                {invoice.number ?? invoice.id.slice(0, 12)}
              </h1>
            </div>
            <StatusBadge status={invoice.status} />
          </div>

          {/* Customer */}
          {(invoice.customerName || invoice.customerEmail) && (
            <div className="px-6 py-4 border-b border-zinc-100">
              <p className="text-xs text-zinc-400 mb-1">Billed to</p>
              {invoice.customerName && <p className="font-medium text-zinc-900">{invoice.customerName}</p>}
              {invoice.customerEmail && <p className="text-sm text-zinc-500">{invoice.customerEmail}</p>}
            </div>
          )}

          {/* Line items */}
          {invoice.lines.length > 0 && (
            <div className="px-6 py-4 border-b border-zinc-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-400 uppercase tracking-wider">
                    <th className="pb-2">Description</th>
                    <th className="pb-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-50">
                  {invoice.lines.map((line, i) => (
                    <tr key={i}>
                      <td className="py-2 text-zinc-700">{line.description}</td>
                      <td className="py-2 text-right text-zinc-900 font-medium">{fmt(line.amount, invoice.currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Total */}
          <div className="px-6 py-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-zinc-500">Amount due</span>
              <span className="text-2xl font-bold text-zinc-900">{fmt(invoice.amountDue, invoice.currency)}</span>
            </div>
            {invoice.dueDate && (
              <p className="text-xs text-zinc-400 mt-1 text-right">
                Due {new Date(invoice.dueDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            )}
          </div>
        </div>

        {/* Payment section */}
        {isPaid ? (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-6 text-center">
            <div className="text-4xl mb-2">&#x2705;</div>
            <h2 className="font-semibold text-green-900">Payment received</h2>
            <p className="text-sm text-green-700 mt-1">This invoice has been paid. Thank you!</p>
            {invoice.invoicePdf && (
              <a href={invoice.invoicePdf} target="_blank" rel="noopener noreferrer"
                className="inline-block mt-4 text-sm text-green-800 underline">
                Download PDF receipt
              </a>
            )}
          </div>
        ) : isVoid ? (
          <div className="bg-zinc-100 border border-zinc-200 rounded-2xl p-6 text-center">
            <p className="text-zinc-500">This invoice is no longer valid.</p>
          </div>
        ) : !showPayForm ? (
          <div className="space-y-3">
            {secretError && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{secretError}</p>}
            <button
              onClick={handlePayNow}
              disabled={loadingSecret}
              className="w-full bg-zinc-900 text-white py-3.5 rounded-xl font-semibold hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              {loadingSecret ? 'Loading\u2026' : `Pay Now \u2014 ${fmt(invoice.amountDue, invoice.currency)}`}
            </button>
            {invoice.invoicePdf && (
              <a href={invoice.invoicePdf} target="_blank" rel="noopener noreferrer"
                className="block text-center text-sm text-zinc-500 hover:text-zinc-700">
                Download PDF invoice &#x2197;
              </a>
            )}
          </div>
        ) : clientSecret && stripePromise ? (
          <div className="bg-white rounded-2xl border border-zinc-200 p-6">
            <h2 className="font-semibold text-zinc-900 mb-4">Payment details</h2>
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: 'stripe', variables: { colorPrimary: '#18181b' } } }}>
              <PaymentForm invoice={invoice} orgId={orgId} />
            </Elements>
          </div>
        ) : null}

        <p className="text-center text-xs text-zinc-400 mt-6">
          Secured by ElevatedPOS &middot; Payments processed by Stripe
        </p>
      </div>
    </div>
  );
}
