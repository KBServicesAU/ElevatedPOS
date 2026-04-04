/**
 * Email channel dispatcher — Resend (https://resend.com)
 *
 * Required env vars:
 *   RESEND_API_KEY   re_xxxxxxxxxxxxxxxxxxxx   (from Resend dashboard)
 *   EMAIL_FROM       "ElevatedPOS <noreply@email.elevatedpos.com.au>"
 *
 * In development, if RESEND_API_KEY is absent the call is a no-op that logs
 * to the console so the rest of the system can be exercised locally without
 * real credentials.
 */

import { Resend } from 'resend';

export interface SendEmailOptions {
  to: string;
  subject: string;
  htmlBody?: string;
  textBody?: string;
  orgId: string;
}

export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env['RESEND_API_KEY'];

  // ── Dev / mock path ──────────────────────────────────────────────────────
  if (!apiKey || process.env['EMAIL_MOCK'] === 'true') {
    console.log('[notifications/email] No RESEND_API_KEY — mock send', {
      to: opts.to,
      subject: opts.subject,
      orgId: opts.orgId,
    });
    return { success: true, messageId: `mock-${Date.now()}`, mock: true };
  }

  // ── Production path — Resend ─────────────────────────────────────────────
  try {
    const resend = new Resend(apiKey);
    const from = process.env['EMAIL_FROM'] ?? 'ElevatedPOS <noreply@email.elevatedpos.com.au>';

    const base = { from, to: opts.to, subject: opts.subject };
    const { data, error } = await resend.emails.send(
      opts.htmlBody && opts.textBody ? { ...base, html: opts.htmlBody, text: opts.textBody } :
      opts.htmlBody                  ? { ...base, html: opts.htmlBody } :
                                       { ...base, text: opts.textBody ?? '' },
    );

    if (error) {
      console.error('[notifications/email] Resend error', {
        to:    opts.to,
        orgId: opts.orgId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }

    console.log('[notifications/email] Sent via Resend', {
      to:        opts.to,
      subject:   opts.subject,
      messageId: data?.id,
      orgId:     opts.orgId,
    });

    return { success: true, messageId: data?.id };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notifications/email] Resend send failed', {
      to:    opts.to,
      orgId: opts.orgId,
      error: message,
    });
    return { success: false, error: message };
  }
}
