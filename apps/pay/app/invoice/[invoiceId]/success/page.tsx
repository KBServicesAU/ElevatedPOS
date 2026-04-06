import { PayHeader } from '@/components/pay-header';

export default async function InvoiceSuccessPage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  return (
    <div className="min-h-screen bg-zinc-50">
      <PayHeader />
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="bg-white rounded-2xl border border-zinc-200 p-10 shadow-sm">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">Payment successful!</h1>
          <p className="text-zinc-500">Your payment has been processed and a receipt will be sent to your email address.</p>
          <p className="text-xs text-zinc-400 mt-6">Invoice {invoiceId.slice(0, 16)}&hellip;</p>
        </div>
        <p className="text-xs text-zinc-400 mt-6">Powered by ElevatedPOS &middot; Secured by Stripe</p>
      </div>
    </div>
  );
}
