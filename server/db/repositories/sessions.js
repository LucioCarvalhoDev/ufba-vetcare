import { randomUUID } from "node:crypto";
import { nowIso } from "../helpers.js";
import { hydrateUser } from "./users.js";

export function createSessionsRepository(connection) {
  const insertSession = connection.prepare(
    `INSERT INTO sessions
       (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const selectSession = connection.prepare(
    `SELECT u.*, s.expires_at AS session_expires_at
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND u.is_active = 1`,
  );
  const deleteSessionByHash = connection.prepare(
    "DELETE FROM sessions WHERE token_hash = ?",
  );
  const touchSession = connection.prepare(
    "UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?",
  );
  const deleteExpired = connection.prepare(
    "DELETE FROM sessions WHERE expires_at <= ?",
  );

  return {
    createSession({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
      const timestamp = nowIso();
      insertSession.run(
        randomUUID(),
        userId,
        tokenHash,
        timestamp,
        expiresAt,
        timestamp,
        ipAddress ?? null,
        userAgent ?? null,
      );
    },

    findSessionUser(tokenHash) {
      const row = selectSession.get(tokenHash);

      if (!row) {
        return null;
      }

      const expiresAt = Date.parse(row.session_expires_at);

      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        deleteSessionByHash.run(tokenHash);
        return null;
      }

      touchSession.run(nowIso(), tokenHash);
      return hydrateUser(connection, row);
    },

    deleteSession(tokenHash) {
      deleteSessionByHash.run(tokenHash);
    },

    deleteExpiredSessions() {
      deleteExpired.run(nowIso());
    },
  };
}
