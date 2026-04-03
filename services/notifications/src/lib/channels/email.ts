/**
 * Email channel dispatcher — Google Workspace SMTP via nodemailer.
 *
 * Required env vars:
 *   SMTP_HOST     smtp.gmail.com
 *   SMTP_PORT     587  (TLS/STARTTLS — recommended)
 *   SMTP_USER     info@elevatedpos.com.au
 *   SMTP_PASS     Google App Password (16 chars, no spaces)
 *   EMAIL_FROM    "ElevatedPOS <info@elevatedpos.com.au>"
 *
 * In development, if SMTP_HOST is absent the call is a no-op that logs to
 * the console so the rest of the system can be exercised locally without
 * real credentials.
 */

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
  const smtpHost = process.env['SMTP_HOST'];

  // ── Dev / mock path ──────────────────────────────────────────────────────
  if (!smtpHost || process.env['EMAIL_MOCK'] === 'true') {
    console.log('[notifications/email] No SMTP_HOST — mock send', {
      to: opts.to,
      subject: opts.subject,
      orgId: opts.orgId,
    });
    return { success: true, messageId: `mock-${Date.now()}`, mock: true };
  }

  // ── Production path — Google Workspace SMTP ──────────────────────────────
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) {
      throw new Error('nodemailer is not installed — run: pnpm add nodemailer');
    }

    const smtpPort  = Number(process.env['SMTP_PORT']  ?? 587);
    const smtpUser  = process.env['SMTP_USER']  ?? '';
    const smtpPass  = process.env['SMTP_PASS']  ?? '';
    const emailFrom = process.env['EMAIL_FROM'] ?? 'ElevatedPOS <info@elevatedpos.com.au>';

    const transporter = nodemailer.createTransport({
      host:   smtpHost,   // smtp.gmail.com
      port:   smtpPort,   // 587
      secure: smtpPort === 465,  // true for 465/SSL, false for 587/TLS
      auth: {
        user: smtpUser,  // info@elevatedpos.com.au
        pass: smtpPass,  // Google App Password
      },
    });

    const info = await transporter.sendMail({
      from:    emailFrom,
      to:      opts.to,
      subject: opts.subject,
      ...(opts.htmlBody ? { html: opts.htmlBody } : {}),
      ...(opts.textBody ? { text: opts.textBody } : {}),
    });

    console.log('[notifications/email] Sent via Google Workspace SMTP', {
      to:        opts.to,
      subject:   opts.subject,
      messageId: info.messageId,
      orgId:     opts.orgId,
    });

    return { success: true, messageId: info.messageId };

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notifications/email] SMTP send failed', {
      to:      opts.to,
      subject: opts.subject,
      orgId:   opts.orgId,
      error:   message,
    });
    return { success: false, error: message };
  }
}
