'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, Shield, RefreshCw, BookOpen,
  CheckCircle, Webhook, AlertTriangle, Info,
} from 'lucide-react';

// ─── Event Catalog Data ───────────────────────────────────────────────────────

interface WebhookEvent {
  event: string;
  description: string;
  service: string;
  payload: unknown;
}

const webhookEvents: WebhookEvent[] = [
  {
    event: 'order.created',
    description: 'A new order was placed at any location.',
    service: 'orders',
    payload: {
      id: 'ord_01HXXXXXXXXXXXXXXXX',
      status: 'pending',
      locationId: 'loc_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      lineItems: [{ productId: 'prod_01', name: 'Flat White', quantity: 2, unitPrice: 450, total: 900 }],
      subtotal: 900,
      tax: 82,
      total: 982,
      currency: 'AUD',
      createdAt: '2024-09-15T10:30:00.000Z',
    },
  },
  {
    event: 'order.completed',
    description: 'Order was marked as fully complete.',
    service: 'orders',
    payload: {
      id: 'ord_01HXXXXXXXXXXXXXXXX',
      status: 'completed',
      completedAt: '2024-09-15T10:35:00.000Z',
      total: 982,
      currency: 'AUD',
    },
  },
  {
    event: 'order.refunded',
    description: 'A full or partial refund was processed.',
    service: 'orders',
    payload: {
      id: 'ord_01HXXXXXXXXXXXXXXXX',
      refundId: 'ref_01HXXXXXXXXXXXXXXXX',
      amount: 491,
      currency: 'AUD',
      reason: 'customer_request',
      refundedAt: '2024-09-15T12:00:00.000Z',
    },
  },
  {
    event: 'payment.captured',
    description: 'Payment was successfully captured.',
    service: 'payments',
    payload: {
      id: 'pay_01HXXXXXXXXXXXXXXXX',
      orderId: 'ord_01HXXXXXXXXXXXXXXXX',
      method: 'card',
      amount: 982,
      currency: 'AUD',
      capturedAt: '2024-09-15T10:30:05.000Z',
      last4: '4242',
    },
  },
  {
    event: 'payment.failed',
    description: 'Payment attempt was declined or errored.',
    service: 'payments',
    payload: {
      id: 'pay_01HXXXXXXXXXXXXXXXX',
      orderId: 'ord_01HXXXXXXXXXXXXXXXX',
      method: 'card',
      amount: 982,
      currency: 'AUD',
      failureCode: 'card_declined',
      failureMessage: 'Your card was declined.',
      failedAt: '2024-09-15T10:30:05.000Z',
    },
  },
  {
    event: 'customer.created',
    description: 'New customer profile was created.',
    service: 'customers',
    payload: {
      id: 'cust_01HXXXXXXXXXXXXXXXX',
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+61412345678',
      createdAt: '2024-09-15T09:00:00.000Z',
    },
  },
  {
    event: 'customer.updated',
    description: 'Customer profile fields were updated.',
    service: 'customers',
    payload: {
      id: 'cust_01HXXXXXXXXXXXXXXXX',
      changedFields: ['email', 'phone'],
      email: 'alice.new@example.com',
      phone: '+61498765432',
      updatedAt: '2024-09-16T14:00:00.000Z',
    },
  },
  {
    event: 'inventory.low_stock',
    description: 'Product stock fell below the reorder point.',
    service: 'inventory',
    payload: {
      productId: 'prod_01HXXXXXXXXXXXXXXXX',
      productName: 'Oat Milk 1L',
      locationId: 'loc_01HXXXXXXXXXXXXXXXX',
      currentQty: 3,
      reorderPoint: 10,
      alertedAt: '2024-09-15T08:00:00.000Z',
    },
  },
  {
    event: 'inventory.stockout',
    description: 'Product stock reached zero.',
    service: 'inventory',
    payload: {
      productId: 'prod_01HXXXXXXXXXXXXXXXX',
      productName: 'Oat Milk 1L',
      locationId: 'loc_01HXXXXXXXXXXXXXXXX',
      currentQty: 0,
      stockedOutAt: '2024-09-15T11:45:00.000Z',
    },
  },
  {
    event: 'loyalty.points_earned',
    description: 'Points were added to a member account.',
    service: 'loyalty',
    payload: {
      accountId: 'lac_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      pointsEarned: 98,
      pointsBalance: 1348,
      orderId: 'ord_01HXXXXXXXXXXXXXXXX',
      earnedAt: '2024-09-15T10:31:00.000Z',
    },
  },
  {
    event: 'loyalty.tier_changed',
    description: 'Member moved to a new loyalty tier.',
    service: 'loyalty',
    payload: {
      accountId: 'lac_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      previousTier: 'silver',
      newTier: 'gold',
      changedAt: '2024-09-15T10:31:00.000Z',
    },
  },
  {
    event: 'layby.created',
    description: 'A new lay-by was opened for a customer.',
    service: 'orders',
    payload: {
      id: 'layby_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      totalAmount: 29900,
      depositAmount: 2990,
      balance: 26910,
      currency: 'AUD',
      dueDate: '2024-12-15',
      createdAt: '2024-09-15T10:00:00.000Z',
    },
  },
  {
    event: 'layby.payment_received',
    description: 'A payment was received against a lay-by.',
    service: 'orders',
    payload: {
      id: 'layby_01HXXXXXXXXXXXXXXXX',
      paymentAmount: 5000,
      newBalance: 21910,
      currency: 'AUD',
      receivedAt: '2024-10-01T14:30:00.000Z',
    },
  },
  {
    event: 'layby.completed',
    description: 'Lay-by was fully paid off and goods collected.',
    service: 'orders',
    payload: {
      id: 'layby_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      totalPaid: 29900,
      completedAt: '2024-12-10T11:00:00.000Z',
    },
  },
  {
    event: 'layby.cancelled',
    description: 'Lay-by was cancelled and deposit refunded.',
    service: 'orders',
    payload: {
      id: 'layby_01HXXXXXXXXXXXXXXXX',
      customerId: 'cust_01HXXXXXXXXXXXXXXXX',
      refundAmount: 2990,
      cancelledAt: '2024-11-01T09:00:00.000Z',
    },
  },
  {
    event: 'gift_card.issued',
    description: 'A new gift card was issued.',
    service: 'orders',
    payload: {
      id: 'gc_01HXXXXXXXXXXXXXXXX',
      code: 'GC-ABCD-1234',
      initialBalance: 5000,
      balance: 5000,
      currency: 'AUD',
      issuedTo: 'cust_01HXXXXXXXXXXXXXXXX',
      expiresAt: '2025-09-15',
      issuedAt: '2024-09-15T10:00:00.000Z',
    },
  },
  {
    event: 'gift_card.redeemed',
    description: 'A gift card was used as payment.',
    service: 'orders',
    payload: {
      id: 'gc_01HXXXXXXXXXXXXXXXX',
      code: 'GC-ABCD-1234',
      amountRedeemed: 1850,
      newBalance: 3150,
      currency: 'AUD',
      orderId: 'ord_01HXXXXXXXXXXXXXXXX',
      redeemedAt: '2024-09-20T14:00:00.000Z',
    },
  },
];

const SERVICE_COLORS: Record<string, string> = {
  orders: 'bg-blue-900/50 text-blue-300 border border-blue-800/50',
  payments: 'bg-emerald-900/50 text-emerald-300 border border-emerald-800/50',
  inventory: 'bg-amber-900/50 text-amber-300 border border-amber-800/50',
  customers: 'bg-purple-900/50 text-purple-300 border border-purple-800/50',
  loyalty: 'bg-rose-900/50 text-rose-300 border border-rose-800/50',
};

// ─── Expandable Event Row ─────────────────────────────────────────────────────

function EventRow({ ev }: { ev: WebhookEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <>
      <tr className="hover:bg-gray-900/50 cursor-pointer" onClick={() => setExpanded((e) => !e)}>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded
              ? <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />}
            <code className="font-mono text-indigo-300 text-xs">{ev.event}</code>
          </div>
        </td>
        <td className="px-4 py-3">
          <span className={`text-xs px-2 py-0.5 rounded font-medium ${SERVICE_COLORS[ev.service] ?? 'bg-gray-800 text-gray-300'}`}>
            {ev.service}
          </span>
        </td>
        <td className="px-4 py-3 text-gray-400 text-xs">{ev.description}</td>
      </tr>
      {expanded && (
        <tr className="bg-gray-900/30">
          <td colSpan={3} className="px-4 pb-4 pt-2">
            <p className="text-xs text-gray-500 mb-2 font-semibold uppercase tracking-wider">
              Sample <code className="font-mono">data</code> payload
            </p>
            <pre className="bg-gray-950 border border-gray-800 rounded-lg px-4 py-3 text-xs font-mono text-gray-300 overflow-x-auto">
              {JSON.stringify(ev.payload, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Retry timeline item ──────────────────────────────────────────────────────

function RetryStep({ attempt, delay, last }: { attempt: string; delay: string; last?: boolean }) {
  return (
    <div className="flex items-start gap-4">
      <div className="flex flex-col items-center">
        <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-xs font-bold text-gray-300 flex-shrink-0">
          {attempt}
        </div>
        {!last && <div className="w-px flex-1 bg-gray-800 min-h-[24px] mt-1" />}
      </div>
      <div className="pb-4 pt-1">
        <span className="text-sm font-mono text-gray-300">{delay}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  return (
    <div className="min-h-screen bg-gray-950">
      {/* Nav */}
      <nav className="border-b border-gray-800 px-6 py-4 flex items-center gap-3 text-sm text-gray-500">
        <Link href="/" className="hover:text-gray-300 transition-colors">Home</Link>
        <span>/</span>
        <span className="text-gray-300">Webhooks</span>
      </nav>

      <div className="max-w-4xl mx-auto px-6 py-10">
        {/* Page header */}
        <div className="flex items-center gap-3 mb-4">
          <Webhook className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold text-white">Webhooks</h1>
        </div>
        <p className="text-gray-400 mb-1">
          Receive real-time event notifications from the ElevatedPOS platform. When an event occurs, ElevatedPOS sends an HTTP{' '}
          <code className="font-mono text-indigo-300 bg-gray-900 px-1 py-0.5 rounded text-xs">POST</code> request to
          your configured endpoint with a signed JSON payload.
        </p>

        {/* ── 1. Overview ─────────────────────────────────────────────────────── */}
        <section className="mt-10 mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Overview</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {[
              {
                title: 'Subscribe',
                body: 'Register one or more HTTPS endpoints in your integration dashboard. Choose which event types to subscribe to.',
                color: 'text-indigo-400',
              },
              {
                title: 'Receive',
                body: 'ElevatedPOS makes an HTTP POST to your endpoint within seconds of an event occurring, with a JSON payload.',
                color: 'text-emerald-400',
              },
              {
                title: 'Verify & Process',
                body: 'Validate the HMAC-SHA256 signature before processing. Return 2xx within 30 seconds to acknowledge receipt.',
                color: 'text-purple-400',
              },
            ].map((card) => (
              <div key={card.title} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <p className={`text-sm font-bold mb-2 ${card.color}`}>{card.title}</p>
                <p className="text-xs text-gray-400 leading-relaxed">{card.body}</p>
              </div>
            ))}
          </div>

          <h3 className="text-sm font-semibold text-gray-300 mb-3">How HMAC-SHA256 Signing Works</h3>
          <p className="text-gray-400 text-sm mb-3">
            Every webhook delivery includes an{' '}
            <code className="font-mono text-indigo-300 bg-gray-900 px-1 py-0.5 rounded text-xs">X-ElevatedPOS-Signature</code>{' '}
            header containing an HMAC-SHA256 digest of the raw request body, keyed with your webhook secret:
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 mb-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`X-ElevatedPOS-Signature: sha256=<hex-digest>

# Computed as:
HMAC-SHA256(key=WEBHOOK_SECRET, message=rawRequestBody)`}</pre>
          </div>
          <div className="flex items-start gap-2 p-3 bg-amber-950 border border-amber-900 rounded-lg text-xs text-amber-200/80">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
            <span>
              Always use a constant-time comparison (e.g. <code className="font-mono">crypto.timingSafeEqual</code> in Node.js,{' '}
              <code className="font-mono">hmac.compare_digest</code> in Python) to prevent timing-based attacks.
            </span>
          </div>
        </section>

        {/* ── 2. Signature Verification ────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <Shield className="w-5 h-5 text-indigo-400" />
            <h2 className="text-xl font-bold text-white">Signature Verification</h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            The header format is <code className="font-mono text-gray-300 text-xs">sha256=&lt;hex-digest&gt;</code>.
            Compute <code className="font-mono text-gray-300 text-xs">HMAC-SHA256(rawBody, webhookSecret)</code>,
            prepend <code className="font-mono text-gray-300 text-xs">sha256=</code>, then compare with a
            constant-time equality function.
          </p>

          {/* Node.js */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-indigo-300 bg-indigo-950 border border-indigo-800 px-2 py-0.5 rounded">
                Node.js
              </span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import crypto from 'crypto';

export function verifyWebhookSignature(
  rawBody: Buffer,
  signature: string,
  secret: string
): boolean {
  const hmac = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const expected = \`sha256=\${hmac}\`;
  return crypto.timingSafeEqual(
    Buffer.from(expected, 'utf8'),
    Buffer.from(signature, 'utf8')
  );
}

// Express.js usage
app.post('/webhooks/elevatedpos', express.raw({ type: 'application/json' }), (req, res) => {
  const sig = req.headers['x-elevatedpos-signature'] as string;
  if (!verifyWebhookSignature(req.body, sig, process.env.ELEVATEDPOS_WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }
  const event = JSON.parse(req.body.toString());
  // Enqueue for async processing
  queue.push(event);
  res.sendStatus(200);
});`}</pre>
            </div>
          </div>

          {/* Python */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-sky-300 bg-sky-950 border border-sky-800 px-2 py-0.5 rounded">
                Python
              </span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`import hmac, hashlib

def verify_webhook_signature(raw_body: bytes, signature: str, secret: str) -> bool:
    expected = "sha256=" + hmac.new(
        secret.encode(), raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, signature)

# Flask usage
@app.route('/webhooks/elevatedpos', methods=['POST'])
def elevatedpos_webhook():
    sig = request.headers.get('X-ElevatedPOS-Signature', '')
    if not verify_webhook_signature(request.get_data(), sig, ELEVATEDPOS_WEBHOOK_SECRET):
        return jsonify(error='Invalid signature'), 401
    event = request.get_json()
    task_queue.enqueue(process_event, event)
    return '', 200`}</pre>
            </div>
          </div>

          {/* PHP */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-semibold text-purple-300 bg-purple-950 border border-purple-800 px-2 py-0.5 rounded">
                PHP
              </span>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
              <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`<?php
function verifyWebhookSignature(string $rawBody, string $signature, string $secret): bool {
    $expected = 'sha256=' . hash_hmac('sha256', $rawBody, $secret);
    return hash_equals($expected, $signature);
}

$rawBody = file_get_contents('php://input');
$sig = $_SERVER['HTTP_X_ELEVATEDPOS_SIGNATURE'] ?? '';

if (!verifyWebhookSignature($rawBody, $sig, getenv('ELEVATEDPOS_WEBHOOK_SECRET'))) {
    http_response_code(401);
    die(json_encode(['error' => 'Invalid signature']));
}

$event = json_decode($rawBody, true);
// Dispatch to background worker
dispatch_job('process_webhook', $event);
http_response_code(200);`}</pre>
            </div>
          </div>
        </section>

        {/* ── 3. Payload Envelope ──────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Payload Envelope</h2>
          <p className="text-gray-400 text-sm mb-4">All webhook deliveries share this outer envelope:</p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`{
  "id": "evt_01HXXXXXXXXXXXXXXXX",
  "event": "order.created",
  "orgId": "org_uuid",
  "timestamp": "2024-09-15T10:30:00.000Z",
  "apiVersion": "2024-09-01",
  "data": {
    // Event-specific payload shown in the catalog below
  }
}`}</pre>
          </div>
          <div className="mt-3 flex items-start gap-2 p-3 bg-gray-900 border border-gray-800 rounded-lg">
            <Info className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">
              The <code className="font-mono text-indigo-300">id</code> field is a unique, stable identifier for each
              delivery attempt. Use it for idempotency — if you receive the same{' '}
              <code className="font-mono text-indigo-300">id</code> twice, the second delivery is a retry and can be
              safely ignored after the first was processed successfully.
            </p>
          </div>
        </section>

        {/* ── 4. Event Catalog ────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-2">Event Catalog</h2>
          <p className="text-gray-400 text-sm mb-4">
            {webhookEvents.length} events across 5 services. Click any row to expand its sample payload.
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead className="bg-gray-900 border-b border-gray-800">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Event</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Service</th>
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-950">
                {webhookEvents.map((ev) => (
                  <EventRow key={ev.event} ev={ev} />
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 5. Retry Policy ─────────────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <RefreshCw className="w-5 h-5 text-sky-400" />
            <h2 className="text-xl font-bold text-white">Retry Policy</h2>
          </div>
          <p className="text-gray-400 text-sm mb-6">
            Webhooks are retried when your endpoint returns a non-2xx status code or times out (30-second timeout per
            attempt). ElevatedPOS makes <strong className="text-gray-200">3 total delivery attempts</strong> with the
            following schedule:
          </p>

          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-5">
            <div className="flex gap-8">
              <div>
                <RetryStep attempt="1" delay="Immediate (first delivery)" />
                <RetryStep attempt="2" delay="1 minute after failure" />
                <RetryStep attempt="3" delay="5 minutes after failure" last />
              </div>
              <div className="flex-1 border-l border-gray-800 pl-8">
                <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">After all 3 attempts fail</p>
                <div className="space-y-2 text-sm text-gray-400">
                  <p>The event is marked as <code className="font-mono text-red-400 text-xs">failed</code>.</p>
                  <p>Failed events are visible in your integration dashboard for <strong className="text-gray-200">72 hours</strong> and can be manually replayed.</p>
                  <p className="text-xs text-gray-500 mt-3">
                    The final retry delay (30 minutes) is not used in this 3-attempt schedule. After attempt 3 fails the event enters the failed state immediately.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Suspension */}
          <div className="bg-red-950/40 border border-red-900/60 rounded-xl p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-300 mb-1">Endpoint Suspension</p>
                <p className="text-sm text-gray-400 leading-relaxed">
                  If an endpoint accumulates <strong className="text-gray-200">10 consecutive delivery failures</strong>,
                  ElevatedPOS will automatically suspend webhook delivery to that endpoint to protect platform throughput.
                  You will receive an email notification when suspension occurs. Re-enable the endpoint from your
                  integration dashboard after resolving the issue.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── 6. Testing ──────────────────────────────────────────────────────── */}
        <section className="mb-12">
          <h2 className="text-xl font-bold text-white mb-4">Testing Webhooks</h2>
          <p className="text-gray-400 text-sm mb-4">
            Use the integrations service to fire a test payload to your endpoint:
          </p>
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-4">
            <pre className="text-sm text-gray-300 font-mono overflow-x-auto">{`curl -X POST https://api.elevatedpos.com.au/api/v1/integrations/{integrationId}/webhooks/test \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "event": "order.created",
    "webhookId": "wh_01HXXXXXXXXXXXXXXXX"
  }'`}</pre>
          </div>
          <p className="text-xs text-gray-500 mt-3">
            Test deliveries use synthetic data. Signature verification works identically to live events.
          </p>
        </section>

        {/* ── 7. Best Practices ───────────────────────────────────────────────── */}
        <section className="mb-12">
          <div className="flex items-center gap-3 mb-5">
            <BookOpen className="w-5 h-5 text-emerald-400" />
            <h2 className="text-xl font-bold text-white">Best Practices</h2>
          </div>
          <div className="space-y-3">
            {[
              {
                title: 'Always verify signatures',
                detail: 'Never process a webhook payload without first verifying the HMAC-SHA256 signature. This ensures the request originated from ElevatedPOS and the body was not tampered with in transit.',
              },
              {
                title: 'Return 200 quickly',
                detail: 'Your endpoint should return a 2xx response within 30 seconds. Move heavy processing to a background queue. If ElevatedPOS receives a timeout, it will retry the event.',
              },
              {
                title: 'Process events asynchronously',
                detail: 'Acknowledge receipt immediately with a 200 response, then process the event in a background worker or queue. This prevents timeouts and decouples delivery from processing.',
              },
              {
                title: 'Handle duplicate deliveries idempotently',
                detail: "The same event may be delivered more than once during retries. Use the event's id field to deduplicate and ensure your handler is idempotent.",
              },
              {
                title: 'Subscribe only to what you need',
                detail: 'Select only the event types relevant to your integration. This reduces payload volume and avoids unnecessary processing.',
              },
              {
                title: 'Monitor delivery health',
                detail: 'Review the webhook delivery log in your integration dashboard regularly. Set up alerts for elevated failure rates before they accumulate toward the 10-failure suspension threshold.',
              },
              {
                title: 'Rotate secrets periodically',
                detail: 'Webhook secrets should be rotated every 90 days. ElevatedPOS supports overlapping secrets during rotation — your old secret remains valid for 24 hours after a new one is set.',
              },
              {
                title: 'Use HTTPS endpoints only',
                detail: 'ElevatedPOS only delivers to HTTPS endpoints with a valid TLS certificate. HTTP endpoints are rejected to prevent data exposure.',
              },
            ].map(({ title, detail }) => (
              <div key={title} className="flex gap-3 p-4 bg-gray-900 border border-gray-800 rounded-xl">
                <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-gray-200 mb-0.5">{title}</p>
                  <p className="text-xs text-gray-400 leading-relaxed">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
