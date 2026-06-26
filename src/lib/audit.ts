import { db } from "./db";

export interface AuditEventParams {
  actorId: string;
  vendorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
}

/**
 * Writes a single audit record to `AuditLog`.
 * Failures are non-fatal: the audit write runs after the primary mutation so a
 * DB hiccup does not roll back business data. In a future iteration this could
 * be moved to a background queue for strict isolation.
 */
export async function recordAuditEvent(params: AuditEventParams): Promise<void> {
  await db.auditLog.create({
    data: {
      actorId: params.actorId,
      vendorId: params.vendorId ?? null,
      action: params.action,
      entity: params.entity,
      entityId: params.entityId,
      before: params.before !== undefined ? (params.before as object) : undefined,
      after: params.after !== undefined ? (params.after as object) : undefined,
    },
  });
}
