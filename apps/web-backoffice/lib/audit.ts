/**
 * Client-side audit logging helper.
 *
 * Fires a fire-and-forget POST to the audit log proxy endpoint.
 * Failures are silently swallowed — audit logging must never disrupt the UX.
 *
 * Usage:
 *   import { auditLog } from '@/lib/audit';
 *   auditLog({ action: 'employee.role_changed', resourceId: emp.id, meta: { newRole } });
 */

export interface AuditPayload {
  /** Machine-readable action slug, e.g. 'employee.role_changed' */
  action: string;
  /** ID of the entity being acted upon */
  resourceId?: string;
  /** Resource type, inferred from action prefix if omitted */
  resourceType?: string;
  /** Extra context to store alongside the log entry */
  meta?: Record<string, unknown>;
}

export function auditLog(payload: AuditPayload): void {
  // Fire and forget — do not await
  fetch('/api/proxy/audit-logs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ...payload,
      clientTimestamp: new Date().toISOString(),
    }),
    // keepalive ensures the request completes even if the user navigates away
    keepalive: true,
  }).catch(() => {
    // Silently ignore — audit logging must never break the UI
  });
}
