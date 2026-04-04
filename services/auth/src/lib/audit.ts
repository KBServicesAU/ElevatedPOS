import { db, schema } from '../db';

export async function logAudit(params: {
  orgId?: string;
  platformUserId?: string;
  actorName?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> {
  try {
    await db.insert(schema.auditLogs).values({
      orgId: params.orgId ?? null,
      platformUserId: params.platformUserId ?? null,
      actorName: params.actorName ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId ?? null,
      detail: params.detail ?? null,
      ipAddress: params.ipAddress ?? null,
    });
  } catch {
    // swallow errors — audit logging must never throw
  }
}
