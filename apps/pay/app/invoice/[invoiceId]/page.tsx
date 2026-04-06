import { notFound } from 'next/navigation';
import { InvoicePaymentClient } from './invoice-payment-client';

const INTEGRATIONS_URL = process.env.INTEGRATIONS_API_URL ?? 'http://localhost:4010';

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

async function getInvoice(invoiceId: string): Promise<{ invoice: PublicInvoice; orgId: string } | null> {
  try {
    const res = await fetch(`${INTEGRATIONS_URL}/api/v1/connect/invoices/public/${invoiceId}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json() as Promise<{ invoice: PublicInvoice; orgId: string }>;
  } catch {
    return null;
  }
}

export default async function InvoicePage({ params }: { params: Promise<{ invoiceId: string }> }) {
  const { invoiceId } = await params;
  const data = await getInvoice(invoiceId);
  if (!data) notFound();

  const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

  return <InvoicePaymentClient invoice={data.invoice} orgId={data.orgId} stripePublishableKey={stripeKey} />;
}
