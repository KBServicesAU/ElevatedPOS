import { db, schema } from '../db/index.js';
import { eq } from 'drizzle-orm';
import { createServiceToken } from '@nexus/config';

// ---------------------------------------------------------------------------
// Activity: sendEmailNotification
// ---------------------------------------------------------------------------
export async function sendEmailNotification(params: {
  to: string;
  subject: string;
  body: string;
  orgId: string;
}): Promise<void> {
  const notificationsUrl =
    process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://localhost:4008';

  console.log(
    `[activities] sendEmailNotification → to=${params.to} subject="${params.subject}" orgId=${params.orgId}`,
  );

  try {
    const serviceToken = createServiceToken('automations', 'notifications');
    const res = await fetch(`${notificationsUrl}/api/v1/notifications/email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
        'X-Service-Call': 'true',
      },
      body: JSON.stringify({
        orgId: params.orgId,
        to: params.to,
        subject: params.subject,
        body: params.body,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notifications service returned ${res.status}: ${text}`);
    }
  } catch (err) {
    // Log and rethrow so Temporal can retry
    console.error('[activities] sendEmailNotification failed:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: sendSmsNotification
// ---------------------------------------------------------------------------
export async function sendSmsNotification(params: {
  to: string;
  message: string;
  orgId: string;
}): Promise<void> {
  const notificationsUrl =
    process.env['NOTIFICATIONS_SERVICE_URL'] ?? 'http://localhost:4008';

  console.log(
    `[activities] sendSmsNotification → to=${params.to} orgId=${params.orgId}`,
  );

  try {
    const serviceToken = createServiceToken('automations', 'notifications');
    const res = await fetch(`${notificationsUrl}/api/v1/notifications/sms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
        'X-Service-Call': 'true',
      },
      body: JSON.stringify({
        orgId: params.orgId,
        to: params.to,
        message: params.message,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Notifications service returned ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[activities] sendSmsNotification failed:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: updateCustomerSegment
// ---------------------------------------------------------------------------
export async function updateCustomerSegment(params: {
  customerId: string;
  segment: string;
  orgId: string;
}): Promise<void> {
  const customersUrl =
    process.env['CUSTOMERS_SERVICE_URL'] ?? 'http://localhost:4005';

  console.log(
    `[activities] updateCustomerSegment → customerId=${params.customerId} segment=${params.segment} orgId=${params.orgId}`,
  );

  try {
    const serviceToken = createServiceToken('automations', 'customers');
    const res = await fetch(
      `${customersUrl}/api/v1/customers/${params.customerId}/segment`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceToken}`,
          'X-Service-Call': 'true',
        },
        body: JSON.stringify({ segment: params.segment, orgId: params.orgId }),
      },
    );
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Customers service returned ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[activities] updateCustomerSegment failed:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: createRewardPoints
// ---------------------------------------------------------------------------
export async function createRewardPoints(params: {
  customerId: string;
  points: number;
  reason: string;
  orgId: string;
}): Promise<void> {
  const loyaltyUrl =
    process.env['LOYALTY_SERVICE_URL'] ?? 'http://localhost:4007';

  console.log(
    `[activities] createRewardPoints → customerId=${params.customerId} points=${params.points} orgId=${params.orgId}`,
  );

  try {
    const serviceToken = createServiceToken('automations', 'loyalty');
    const res = await fetch(`${loyaltyUrl}/api/v1/loyalty/points`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${serviceToken}`,
        'X-Service-Call': 'true',
      },
      body: JSON.stringify({
        orgId: params.orgId,
        customerId: params.customerId,
        points: params.points,
        reason: params.reason,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Loyalty service returned ${res.status}: ${text}`);
    }
  } catch (err) {
    console.error('[activities] createRewardPoints failed:', err);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Activity: createAutomationLog
// ---------------------------------------------------------------------------
export async function createAutomationLog(params: {
  automationId: string;
  triggerId: string;
  status: 'success' | 'failed';
  output: string;
  orgId: string;
}): Promise<void> {
  console.log(
    `[activities] createAutomationLog → automationId=${params.automationId} status=${params.status} orgId=${params.orgId}`,
  );

  try {
    await db
      .update(schema.automationExecutions)
      .set({
        status: params.status === 'success' ? 'completed' : 'failed',
        output: params.output,
        completedAt: new Date(),
      })
      .where(eq(schema.automationExecutions.id, params.triggerId));
  } catch (err) {
    // Insert a new record if update found nothing (e.g. called at workflow start)
    await db.insert(schema.automationExecutions).values({
      orgId: params.orgId,
      ruleId: params.automationId,
      triggerPayload: {},
      status: params.status === 'success' ? 'completed' : 'failed',
      output: params.output,
      startedAt: new Date(),
      completedAt: new Date(),
    });
    console.error('[activities] createAutomationLog upsert fallback:', err);
  }
}
