/**
 * Push notification channel dispatcher (Firebase FCM).
 *
 * In production, set FCM_SERVER_KEY to your Firebase Cloud Messaging server key.
 * In development (or when FCM_SERVER_KEY is absent) the call is a no-op that
 * logs to the console and returns a mock result.
 */

export interface SendPushOptions {
  deviceToken: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  orgId: string;
}

export interface SendPushResult {
  success: boolean;
  messageId?: string;
  error?: string;
  mock?: boolean;
}

const FCM_SEND_URL = 'https://fcm.googleapis.com/fcm/send';

export async function sendPush(opts: SendPushOptions): Promise<SendPushResult> {
  const fcmServerKey = process.env['FCM_SERVER_KEY'];

  if (!fcmServerKey) {
    // Dev / no-op path
    console.log('[notifications/push] FCM_SERVER_KEY not configured — mock send', {
      deviceToken: opts.deviceToken.slice(0, 12) + '…',
      title: opts.title,
      orgId: opts.orgId,
    });
    return {
      success: true,
      messageId: `mock-push-${Date.now()}`,
      mock: true,
    };
  }

  // Production path — FCM Legacy HTTP API
  try {
    const payload = {
      to: opts.deviceToken,
      notification: {
        title: opts.title,
        body: opts.body,
      },
      data: opts.data ?? {},
      android: { priority: 'high' },
      apns: { headers: { 'apns-priority': '10' } },
    };

    const res = await fetch(FCM_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `key=${fcmServerKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const json = (await res.json()) as {
      multicast_id?: number;
      success?: number;
      results?: Array<{ message_id?: string; error?: string }>;
      error?: string;
    };

    if (!res.ok) {
      throw new Error(json.error ?? `FCM HTTP ${res.status}`);
    }

    const firstResult = json.results?.[0];
    if (firstResult?.error) {
      throw new Error(firstResult.error);
    }

    const messageId = firstResult?.message_id ?? String(json.multicast_id ?? Date.now());
    return { success: true, messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[notifications/push] send failed', {
      deviceToken: opts.deviceToken.slice(0, 12) + '…',
      error: message,
    });
    return { success: false, error: message };
  }
}
