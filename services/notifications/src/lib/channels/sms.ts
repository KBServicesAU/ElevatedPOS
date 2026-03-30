/**
 * SMS channel dispatcher.
 *
 * In production, set TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM_NUMBER
 * to send via Twilio.  In development (or when TWILIO_ACCOUNT_SID is absent)
 * the call is a no-op that logs to the console and returns a mock result.
 */

export interface SendSmsOptions {
  to: string;   // E.164 phone number, e.g. +15551234567
  body: string;
  orgId: string;
}

export interface SendSmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

export async function sendSms(opts: SendSmsOptions): Promise<SendSmsResult> {
  const accountSid = process.env['TWILIO_ACCOUNT_SID'];

  if (!accountSid) {
    // Dev / no-op path
    console.log('[notifications/sms] TWILIO_ACCOUNT_SID not configured — mock send', {
      to: opts.to,
      body: opts.body.slice(0, 50),
      orgId: opts.orgId,
    });
    return {
      success: true,
      messageId: `mock-sms-${Date.now()}`,
      mock: true,
    };
  }

  // Production path — Twilio REST API
  try {
    const authToken = process.env['TWILIO_AUTH_TOKEN'] ?? '';
    const fromNumber = process.env['TWILIO_FROM_NUMBER'] ?? '';

    const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const body = new URLSearchParams({
      To: opts.to,
      From: fromNumber,
      Body: opts.body,
    });

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const json = (await res.json()) as { sid?: string; message?: string };

    if (!res.ok) {
      throw new Error(json.message ?? `Twilio HTTP ${res.status}`);
    }

    return { success: true, messageId: json.sid };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notifications/sms] send failed', { to: opts.to, error: message });
    return { success: false, error: message };
  }
}
