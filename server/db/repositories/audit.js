import { randomUUID } from "node:crypto";
import { nowIso } from "../helpers.js";

export function createAuditRepository(connection) {
  const insertAudit = connection.prepare(
    `INSERT INTO audit_logs
       (id, user_id, actor_email, action, resource, result, ip_address, user_agent, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  return {
    recordAudit({
      userId = null,
      actorEmail = null,
      action,
      resource = null,
      result,
      ipAddress = null,
      userAgent = null,
      metadata = null,
    }) {
      insertAudit.run(
        randomUUID(),
        userId,
        actorEmail,
        action,
        resource,
        result,
        ipAddress,
        userAgent,
        metadata ? JSON.stringify(metadata) : null,
        nowIso(),
      );
    },
  };
}
