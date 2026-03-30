/**
 * Email channel dispatcher.
 *
 * In production, set SMTP_HOST / SMTP_PORT / EMAIL_FROM to route through a
 * real SMTP relay (e.g. SendGrid, Mailgun, SES).  In development (or when
 * SMTP_HOST is absent) the call is a no-op that logs to the console and
 * returns a mock result so the rest of the system can be exercised locally.
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

  if (!smtpHost) {
    // Dev / no-op path — log and return a deterministic mock result
    console.log('[notifications/email] SMTP_HOST not configured — mock send', {
      to: opts.to,
      subject: opts.subject,
      orgId: opts.orgId,
    });
    return {
      success: true,
      messageId: `mock-email-${Date.now()}`,
      mock: true,
    };
  }

  // Production path — use a nodemailer-style SMTP connection.
  // We import dynamically so tests / dev environments without nodemailer
  // installed still start up cleanly when SMTP_HOST is absent.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodemailer = await import('nodemailer').catch(() => null);
    if (!nodemailer) {
      throw new Error('nodemailer is not installed — run: pnpm add nodemailer');
    }

    const smtpPort = Number(process.env['SMTP_PORT'] ?? 587);
    const emailFrom = process.env['EMAIL_FROM'] ?? 'noreply@nexus.app';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: process.env['SMTP_USER']
        ? { user: process.env['SMTP_USER'], pass: process.env['SMTP_PASS'] }
        : undefined,
    });

    const info = await transporter.sendMail({
      from: emailFrom,
      to: opts.to,
      subject: opts.subject,
      text: opts.textBody,
      html: opts.htmlBody,
    });

    return { success: true, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notifications/email] send failed', { to: opts.to, error: message });
    return { success: false, error: message };
  }
}
