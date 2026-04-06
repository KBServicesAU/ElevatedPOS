import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { db, schema } from '../db/index.js';
import { sendEmail } from '../lib/channels/email.js';

const TEMPLATES = ['receipt', 'layby_statement', 'gift_card', 'campaign', 'custom'] as const;

const emailSchema = z.object({
  to: z.string().email(),
  subject: z.string().min(1).max(255),
  template: z.enum(TEMPLATES),
  data: z.record(z.unknown()).default({}),
  orgId: z.string().uuid(),
});

// ─── Template Renderers ───────────────────────────────────────────────────────

function renderReceiptHtml(data: Record<string, unknown>): string {
  const orderId = String(data['orderId'] ?? 'N/A');
  const items = Array.isArray(data['items']) ? data['items'] : [];
  const total = typeof data['total'] === 'number' ? data['total'].toFixed(2) : '0.00';
  const currency = String(data['currency'] ?? 'AUD');
  const locationName = String(data['locationName'] ?? '');
  const date = data['date'] ? new Date(data['date'] as string).toLocaleString('en-AU') : new Date().toLocaleString('en-AU');

  const itemRows = items
    .map((item) => {
      const i = item as Record<string, unknown>;
      return `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee;">${String(i['name'] ?? '')}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:center;">${String(i['quantity'] ?? 1)}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;">${currency} ${Number(i['unitPrice'] ?? 0).toFixed(2)}</td>
      </tr>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><title>Receipt</title></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333;">
  <div style="text-align:center;padding:20px 0;border-bottom:2px solid #333;">
    <h2 style="margin:0;">Receipt</h2>
    ${locationName ? `<p style="margin:4px 0;color:#666;">${locationName}</p>` : ''}
  </div>
  <div style="padding:16px 0;">
    <p style="margin:4px 0;"><strong>Order ID:</strong> ${orderId}</p>
    <p style="margin:4px 0;"><strong>Date:</strong> ${date}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;">
    <thead>
      <tr style="background:#f5f5f5;">
        <th style="padding:8px 0;text-align:left;">Item</th>
        <th style="padding:8px 0;text-align:center;">Qty</th>
        <th style="padding:8px 0;text-align:right;">Price</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div style="margin-top:16px;text-align:right;border-top:2px solid #333;padding-top:12px;">
    <p style="margin:0;font-size:18px;font-weight:bold;">Total: ${currency} ${total}</p>
  </div>
  <p style="margin-top:24px;font-size:12px;color:#999;text-align:center;">Thank you for your purchase!</p>
</body>
</html>`;
}

function renderReceiptText(data: Record<string, unknown>): string {
  const orderId = String(data['orderId'] ?? 'N/A');
  const items = Array.isArray(data['items']) ? data['items'] : [];
  const total = typeof data['total'] === 'number' ? data['total'].toFixed(2) : '0.00';
  const currency = String(data['currency'] ?? 'AUD');
  const locationName = String(data['locationName'] ?? '');
  const date = data['date'] ? new Date(data['date'] as string).toLocaleString('en-AU') : new Date().toLocaleString('en-AU');

  const itemLines = items
    .map((item) => {
      const i = item as Record<string, unknown>;
      return `  ${String(i['name'] ?? '').padEnd(30)} x${String(i['quantity'] ?? 1).padStart(2)}  ${currency} ${Number(i['unitPrice'] ?? 0).toFixed(2)}`;
    })
    .join('\n');

  return `RECEIPT
${locationName ? locationName + '\n' : ''}Order ID: ${orderId}
Date: ${date}
${'─'.repeat(50)}
${itemLines}
${'─'.repeat(50)}
TOTAL: ${currency} ${total}

Thank you for your purchase!`;
}

function renderTemplate(
  template: (typeof TEMPLATES)[number],
  subject: string,
  data: Record<string, unknown>,
): { htmlBody: string; textBody: string; resolvedSubject: string } {
  switch (template) {
    case 'receipt':
      return {
        resolvedSubject: subject || `Your Receipt — Order ${String(data['orderId'] ?? '')}`,
        htmlBody: renderReceiptHtml(data),
        textBody: renderReceiptText(data),
      };

    case 'layby_statement': {
      const laybyId = String(data['laybyId'] ?? 'N/A');
      const balance = Number(data['balance'] ?? 0).toFixed(2);
      const currency = String(data['currency'] ?? 'AUD');
      const nextDue = data['nextDueDate'] ? String(data['nextDueDate']) : 'N/A';
      const text = `LAY-BY STATEMENT\n\nLay-by ID: ${laybyId}\nOutstanding Balance: ${currency} ${balance}\nNext Payment Due: ${nextDue}\n\nPlease contact us if you have any questions.`;
      return {
        resolvedSubject: subject || `Lay-by Statement — ${laybyId}`,
        htmlBody: `<pre style="font-family:monospace;">${text}</pre>`,
        textBody: text,
      };
    }

    case 'gift_card': {
      const code = String(data['code'] ?? '');
      const amount = Number(data['amount'] ?? 0).toFixed(2);
      const currency = String(data['currency'] ?? 'AUD');
      const expiry = data['expiryDate'] ? String(data['expiryDate']) : 'Never';
      const text = `GIFT CARD\n\nYour gift card code: ${code}\nValue: ${currency} ${amount}\nExpiry: ${expiry}\n\nRedeem in-store or online at checkout.`;
      return {
        resolvedSubject: subject || `Your Gift Card — ${code}`,
        htmlBody: `<pre style="font-family:monospace;">${text}</pre>`,
        textBody: text,
      };
    }

    case 'campaign': {
      const campaignName = String(data['campaignName'] ?? 'Special Offer');
      const body = String(data['body'] ?? '');
      const cta = String(data['ctaUrl'] ?? '');
      const html = `<h2>${campaignName}</h2><p>${body}</p>${cta ? `<p><a href="${cta}">Click here to learn more</a></p>` : ''}`;
      return {
        resolvedSubject: subject || campaignName,
        htmlBody: html,
        textBody: `${campaignName}\n\n${body}${cta ? `\n\n${cta}` : ''}`,
      };
    }

    case 'custom':
    default: {
      const body = String(data['body'] ?? '');
      return {
        resolvedSubject: subject,
        htmlBody: body,
        textBody: body,
      };
    }
  }
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function emailRoutes(app: FastifyInstance) {
  app.addHook('onRequest', app.authenticate);

  // POST /email — send an email notification
  app.post('/', async (request, reply) => {
    const parsed = emailSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(422).send({
        type: 'https://elevatedpos.com/errors/validation',
        title: 'Validation Error',
        status: 422,
        detail: parsed.error.message,
      });
    }

    const { to, subject, template, data, orgId } = parsed.data;
    const { resolvedSubject, htmlBody, textBody } = renderTemplate(template, subject, data as Record<string, unknown>);
    const messageId = crypto.randomUUID();

    // Send via SMTP (falls back to console log if SMTP_HOST not set)
    const result = await sendEmail({ to, subject: resolvedSubject, htmlBody, textBody, orgId });

    const status = result.success ? 'sent' : 'failed';

    // Save to notificationLogs
    await db.insert(schema.notificationLogs).values({
      id: messageId,
      orgId,
      channel: 'email',
      recipient: to,
      subject: resolvedSubject,
      status,
      sentAt: new Date(),
    });

    if (!result.success) {
      return reply.status(502).send({
        type: 'https://elevatedpos.com/errors/smtp-failure',
        title: 'Email Send Failed',
        status: 502,
        detail: result.error ?? 'SMTP send failed',
        messageId,
      });
    }

    return reply.status(200).send({ messageId: result.messageId ?? messageId, to, subject: resolvedSubject, status: 'sent' });
  });
}
