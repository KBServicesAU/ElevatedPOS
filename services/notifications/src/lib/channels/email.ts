/**
 * Email channel dispatcher — Resend (https://resend.com)
 *
 * Required env vars:
 *   RESEND_API_KEY   re_xxxxxxxxxxxxxxxxxxxx   (from Resend dashboard)
 *   EMAIL_FROM       "ElevatedPOS <noreply@email.elevatedpos.com.au>"
 *
 * Behaviour:
 *   - In development / test (`NODE_ENV !== 'production'`), if RESEND_API_KEY is
 *     absent the call is a no-op that logs to the console so the rest of the
 *     system can be exercised locally without real credentials. You can also
 *     force mock mode in any environment by setting `EMAIL_MOCK=true`.
 *   - In production, a missing RESEND_API_KEY is a hard failure — we return
 *     `{ success: false, error }` so callers mark the notification as 'failed'
 *     (instead of silently "succeeding" with a mock id and never delivering).
 *   - Transient Resend errors (429 rate limit, 5xx server errors) are retried
 *     with exponential backoff (up to 3 attempts total). Permanent errors
 *     (validation, invalid_api_key, monthly_quota_exceeded, etc.) fail fast.
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

// ── Retry config ───────────────────────────────────────────────────────────
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 500; // doubled each attempt: 500, 1000, 2000

// Resend error codes that indicate a transient condition worth retrying.
// Anything else (validation, invalid_api_key, monthly_quota, etc.) fails fast.
const TRANSIENT_ERROR_CODES = new Set<string>([
  'rate_limit_exceeded',
  'internal_server_error',
  'application_error',
]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransient(err: { name?: string } | null | undefined): boolean {
  if (!err) return false;
  // Resend SDK surfaces `name` as the RESEND_ERROR_CODE_KEY literal.
  const name = err.name ?? '';
  return TRANSIENT_ERROR_CODES.has(name);
}

export async function sendEmail(opts: SendEmailOptions): Promise<SendEmailResult> {
  const apiKey = process.env['RESEND_API_KEY'];
  const isProd = process.env['NODE_ENV'] === 'production';
  const forceMock = process.env['EMAIL_MOCK'] === 'true';

  // ── Mock path (dev only, or EMAIL_MOCK=true) ────────────────────────────
  if (forceMock || (!apiKey && !isProd)) {
    console.log('[notifications/email] Mock send (no RESEND_API_KEY or EMAIL_MOCK=true)', {
      to: opts.to,
      subject: opts.subject,
      orgId: opts.orgId,
    });
    return { success: true, messageId: `mock-${Date.now()}`, mock: true };
  }

  // ── Hard failure in production when key is missing ──────────────────────
  if (!apiKey) {
    const error = 'RESEND_API_KEY is not configured in production environment';
    console.error('[notifications/email] CRITICAL — cannot send email', {
      to:    opts.to,
      orgId: opts.orgId,
      error,
    });
    return { success: false, error };
  }

  // ── Production path — Resend with retry ─────────────────────────────────
  const resend = new Resend(apiKey);
  const from = process.env['EMAIL_FROM'] ?? 'ElevatedPOS <noreply@email.elevatedpos.com.au>';
  const base = { from, to: opts.to, subject: opts.subject };
  const payload =
    opts.htmlBody && opts.textBody ? { ...base, html: opts.htmlBody, text: opts.textBody } :
    opts.htmlBody                  ? { ...base, html: opts.htmlBody } :
                                     { ...base, text: opts.textBody ?? '' };

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const { data, error } = await resend.emails.send(payload);

      if (error) {
        lastError = error.message;
        const transient = isTransient(error);
        console.error('[notifications/email] Resend error', {
          to:       opts.to,
          orgId:    opts.orgId,
          attempt,
          errorName: error.name,
          error:    error.message,
          willRetry: transient && attempt < MAX_ATTEMPTS,
        });
        if (!transient || attempt === MAX_ATTEMPTS) {
          return { success: false, error: error.message };
        }
        await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
        continue;
      }

      console.log('[notifications/email] Sent via Resend', {
        to:        opts.to,
        subject:   opts.subject,
        messageId: data?.id,
        orgId:     opts.orgId,
        attempt,
      });
      return { success: true, messageId: data?.id };

    } catch (err) {
      // Network errors / unexpected throws — retry transparently.
      lastError = err instanceof Error ? err.message : String(err);
      console.error('[notifications/email] Resend send threw', {
        to:      opts.to,
        orgId:   opts.orgId,
        attempt,
        error:   lastError,
        willRetry: attempt < MAX_ATTEMPTS,
      });
      if (attempt === MAX_ATTEMPTS) {
        return { success: false, error: lastError };
      }
      await sleep(BASE_BACKOFF_MS * 2 ** (attempt - 1));
    }
  }

  return { success: false, error: lastError ?? 'Unknown error sending email' };
}
