import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "./security.js";
import { PERMISSIONS, ROLE_DEFINITIONS } from "./permissions.js";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT
);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  operation TEXT NOT NULL,
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id TEXT NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_seen_at TEXT,
  ip_address TEXT,
  user_agent TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  result TEXT NOT NULL CHECK (result IN ('success', 'failure')),
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
`;

function nowIso() {
  return new Date().toISOString();
}

function normalizeEmail(email) {
  return String(email ?? "").trim().toLowerCase();
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, "\\$&");
}

/**
 * Sincroniza o catálogo de permissões e papéis definido no código.
 *
 * @param {import("node:sqlite").DatabaseSync} connection
 */
function seedCatalog(connection) {
  const selectRole = connection.prepare("SELECT id FROM roles WHERE slug = ?");
  const insertRole = connection.prepare(
    "INSERT INTO roles (id, slug, name, description) VALUES (?, ?, ?, ?)",
  );
  const updateRole = connection.prepare(
    "UPDATE roles SET name = ?, description = ? WHERE id = ?",
  );
  const selectPermission = connection.prepare(
    "SELECT id FROM permissions WHERE code = ?",
  );
  const insertPermission = connection.prepare(
    "INSERT INTO permissions (id, code, module, operation, description) VALUES (?, ?, ?, ?, ?)",
  );
  const updatePermission = connection.prepare(
    "UPDATE permissions SET module = ?, operation = ?, description = ? WHERE id = ?",
  );
  const deleteRolePermissions = connection.prepare(
    "DELETE FROM role_permissions WHERE role_id = ?",
  );
  const insertRolePermission = connection.prepare(
    "INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)",
  );

  const permissionIds = new Map();
  const roleIds = new Map();

  connection.exec("BEGIN IMMEDIATE;");
  try {

    for (const permission of PERMISSIONS) {
      const existing = selectPermission.get(permission.code);

      if (existing) {
        updatePermission.run(
          permission.module,
          permission.action,
          permission.description,
          existing.id,
        );
        permissionIds.set(permission.code, existing.id);
      } else {
        const id = randomUUID();
        insertPermission.run(
          id,
          permission.code,
          permission.module,
          permission.action,
          permission.description,
        );
        permissionIds.set(permission.code, id);
      }
    }

    for (const role of ROLE_DEFINITIONS) {
      const existing = selectRole.get(role.slug);
      let roleId;

      if (existing) {
        roleId = existing.id;
        updateRole.run(role.name, role.description, roleId);
      } else {
        roleId = randomUUID();
        insertRole.run(roleId, role.slug, role.name, role.description);
      }

      roleIds.set(role.slug, roleId);

      deleteRolePermissions.run(roleId);

      for (const permissionCode of role.permissions) {
        const permissionId = permissionIds.get(permissionCode);
        if (!permissionId) {
          throw new Error(
            `Permissão desconhecida no papel ${role.slug}: ${permissionCode}`,
          );
        }
        insertRolePermission.run(roleId, permissionId);
      }
    }

    connection.exec("COMMIT;");
  } catch (error) {
    connection.exec("ROLLBACK;");
    throw error;
  }

  return { permissionIds, roleIds };
}

/**
 * Cria o usuário administrador inicial, se ainda não existir.
 * A senha nunca é persistida em texto puro.
 *
 * @param {import("node:sqlite").DatabaseSync} connection
 * @param {{
 *   adminEmail: string,
 *   adminName: string,
 *   adminPassword: string,
 *   resetAdminPassword: boolean,
 * }} options
 * @returns {Promise<"created" | "unchanged" | "password_reset">}
 */
async function seedAdminUser(
  connection,
  { adminEmail, adminName, adminPassword, resetAdminPassword },
) {
  const email = normalizeEmail(adminEmail);

  if (!email) {
    throw new Error("ADMIN_EMAIL não definido.");
  }

  const selectUser = connection.prepare(
    "SELECT id FROM users WHERE email = ? COLLATE NOCASE",
  );
  const selectAdminRole = connection.prepare(
    "SELECT id FROM roles WHERE slug = 'administrador'",
  );
  const insertUserRole = connection.prepare(
    "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
  );

  const adminRole = selectAdminRole.get();
  if (!adminRole) {
    throw new Error("Papel administrador não encontrado no catálogo.");
  }

  const existing = selectUser.get(email);

  if (existing) {
    insertUserRole.run(existing.id, adminRole.id);

    if (!resetAdminPassword) {
      return "unchanged";
    }

    if (!adminPassword) {
      throw new Error(
        "ADMIN_PASSWORD é obrigatório para redefinir a senha do administrador.",
      );
    }

    const passwordHash = await hashPassword(adminPassword);
    connection
      .prepare(
        "UPDATE users SET password_hash = ?, is_active = 1, updated_at = ? WHERE id = ?",
      )
      .run(passwordHash, nowIso(), existing.id);
    connection.prepare("DELETE FROM sessions WHERE user_id = ?").run(existing.id);

    return "password_reset";
  }

  if (!adminPassword) {
    throw new Error(
      "ADMIN_PASSWORD não definido. Configure o .env antes de inicializar o banco.",
    );
  }

  const passwordHash = await hashPassword(adminPassword);
  const userId = randomUUID();
  const timestamp = nowIso();

  connection
    .prepare(
      `INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(userId, adminName, email, passwordHash, timestamp, timestamp);
  insertUserRole.run(userId, adminRole.id);

  return "created";
}

/**
 * @param {import("node:sqlite").DatabaseSync} connection
 * @param {string} userId
 */
function getUserRoles(connection, userId) {
  return connection
    .prepare(
      `SELECT r.id, r.slug, r.name, r.description
       FROM roles r
       INNER JOIN user_roles ur ON ur.role_id = r.id
       WHERE ur.user_id = ?
       ORDER BY r.name ASC`,
    )
    .all(userId);
}

function getUserPermissions(connection, userId) {
  return connection
    .prepare(
      `SELECT DISTINCT p.code
       FROM permissions p
       INNER JOIN role_permissions rp ON rp.permission_id = p.id
       INNER JOIN user_roles ur ON ur.role_id = rp.role_id
       WHERE ur.user_id = ?
       ORDER BY p.code ASC`,
    )
    .all(userId)
    .map((row) => row.code);
}

function hydrateUser(connection, row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    passwordHash: row.password_hash,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    roles: getUserRoles(connection, row.id),
    permissions: getUserPermissions(connection, row.id),
  };
}

/**
 * Abre o banco, aplica o schema, sincroniza o catálogo RBAC e garante o admin.
 *
 * @param {{
 *   filename?: string,
 *   adminEmail?: string,
 *   adminName?: string,
 *   adminPassword?: string,
 *   resetAdminPassword?: boolean,
 * }} [options]
 */
export async function openDatabase({
  filename = "data/vetcare.db",
  adminEmail = "admin@vetcare.com",
  adminName = "Administrador VetCare",
  adminPassword = "",
  resetAdminPassword = false,
} = {}) {
  if (filename !== ":memory:") {
    mkdirSync(dirname(filename), { recursive: true });
  }

  const connection = new DatabaseSync(filename);
  connection.exec("PRAGMA foreign_keys = ON;");
  connection.exec("PRAGMA busy_timeout = 5000;");
  connection.exec("PRAGMA synchronous = NORMAL;");

  if (filename !== ":memory:") {
    connection.exec("PRAGMA journal_mode = WAL;");
  }

  connection.exec(SCHEMA);
  seedCatalog(connection);

  const adminStatus = await seedAdminUser(connection, {
    adminEmail,
    adminName,
    adminPassword,
    resetAdminPassword,
  });

  const selectUserByEmail = connection.prepare(
    "SELECT * FROM users WHERE email = ? COLLATE NOCASE",
  );
  const selectUserById = connection.prepare("SELECT * FROM users WHERE id = ?");
  const selectRoleBySlug = connection.prepare(
    "SELECT id FROM roles WHERE slug = ?",
  );
  const insertUserRole = connection.prepare(
    "INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)",
  );
  const insertAudit = connection.prepare(
    `INSERT INTO audit_logs
       (id, user_id, actor_email, action, resource, result, ip_address, user_agent, metadata, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const database = {
    connection,
    adminStatus,

    close() {
      connection.close();
    },

    /**
     * @param {string} email
     */
    getUserAuthByEmail(email) {
      const row = selectUserByEmail.get(normalizeEmail(email));
      return row ? hydrateUser(connection, row) : null;
    },

    /**
     * @param {string} id
     */
    getUserAuthById(id) {
      const row = selectUserById.get(id);
      return row ? hydrateUser(connection, row) : null;
    },

    /**
     * Lista usuários com filtros opcionais de nome/e-mail, papel e situação.
     *
     * @param {{
     *   q?: string,
     *   roleSlug?: string,
     *   isActive?: boolean,
     * }} [filters]
     */
    listUsers({ q = "", roleSlug = "", isActive } = {}) {
      const conditions = [];
      const parameters = [];
      const search = String(q ?? "").trim();

      if (search) {
        const term = `%${escapeLike(search)}%`;
        conditions.push(
          "(u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')",
        );
        parameters.push(term, term);
      }

      if (roleSlug) {
        conditions.push(
          `EXISTS (
             SELECT 1
             FROM user_roles ur
             INNER JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = u.id AND r.slug = ?
           )`,
        );
        parameters.push(roleSlug);
      }

      if (typeof isActive === "boolean") {
        conditions.push("u.is_active = ?");
        parameters.push(isActive ? 1 : 0);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = connection
        .prepare(
          `SELECT u.*
           FROM users u
           ${where}
           ORDER BY u.name COLLATE NOCASE ASC, u.created_at ASC`,
        )
        .all(...parameters);

      return rows.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        isActive: Boolean(row.is_active),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        roles: getUserRoles(connection, row.id),
      }));
    },

    /**
     * Lista papéis disponíveis para filtros e formulários administrativos.
     */
    listRoles() {
      return connection
        .prepare(
          `SELECT id, slug, name, description
           FROM roles
           ORDER BY name COLLATE NOCASE ASC`,
        )
        .all();
    },

    /**
     * Cria usuários para a área administrativa.
     * A autorização de quem chama deve ser verificada na camada de aplicação.
     *
     * @param {{
     *   name: string,
     *   email: string,
     *   password: string,
     *   roleSlugs?: string[],
     *   isActive?: boolean,
     * }} input
     */
    async createUser({
      name,
      email,
      password,
      roleSlugs = [],
      isActive = true,
    }) {
      const normalizedName = String(name ?? "").trim();
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedName) {
        const error = new Error("Nome do usuário é obrigatório.");
        error.code = "INVALID_NAME";
        throw error;
      }

      if (!normalizedEmail) {
        const error = new Error("E-mail do usuário é obrigatório.");
        error.code = "INVALID_EMAIL";
        throw error;
      }

      if (selectUserByEmail.get(normalizedEmail)) {
        const error = new Error("Já existe um usuário com este e-mail.");
        error.code = "EMAIL_IN_USE";
        throw error;
      }

      if (!Array.isArray(roleSlugs) || roleSlugs.length === 0) {
        const error = new Error("Selecione ao menos um papel.");
        error.code = "ROLE_REQUIRED";
        throw error;
      }

      const roleIds = [...new Set(roleSlugs)].map((slug) => {
        const role = selectRoleBySlug.get(slug);
        if (!role) {
          const error = new Error(`Papel desconhecido: ${slug}`);
          error.code = "UNKNOWN_ROLE";
          throw error;
        }
        return role.id;
      });

      const passwordHash = await hashPassword(password);
      const userId = randomUUID();
      const timestamp = nowIso();

      connection
        .prepare(
          `INSERT INTO users (id, name, email, password_hash, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          userId,
          normalizedName,
          normalizedEmail,
          passwordHash,
          isActive ? 1 : 0,
          timestamp,
          timestamp,
        );

      for (const roleId of roleIds) {
        insertUserRole.run(userId, roleId);
      }

      return database.getUserAuthById(userId);
    },

    /**
     * Atualiza os dados administrativos de um usuário.
     * A senha é opcional; quando informada, é armazenada apenas como hash.
     *
     * @param {string} id
     * @param {{
     *   name: string,
     *   email: string,
     *   password?: string,
     *   roleSlugs?: string[],
     *   isActive?: boolean,
     * }} input
     */
    async updateUser(
      id,
      { name, email, password, roleSlugs = [], isActive = true },
    ) {
      const existing = selectUserById.get(id);

      if (!existing) {
        const error = new Error("Usuário não encontrado.");
        error.code = "USER_NOT_FOUND";
        throw error;
      }

      const normalizedName = String(name ?? "").trim();
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedName) {
        const error = new Error("Nome do usuário é obrigatório.");
        error.code = "INVALID_NAME";
        throw error;
      }

      if (!normalizedEmail) {
        const error = new Error("E-mail do usuário é obrigatório.");
        error.code = "INVALID_EMAIL";
        throw error;
      }

      const emailOwner = selectUserByEmail.get(normalizedEmail);

      if (emailOwner && emailOwner.id !== id) {
        const error = new Error("Já existe um usuário com este e-mail.");
        error.code = "EMAIL_IN_USE";
        throw error;
      }

      if (!Array.isArray(roleSlugs) || roleSlugs.length === 0) {
        const error = new Error("Selecione ao menos um papel.");
        error.code = "ROLE_REQUIRED";
        throw error;
      }

      const uniqueRoleSlugs = [...new Set(roleSlugs)];
      const roleIds = uniqueRoleSlugs.map((slug) => {
        const role = selectRoleBySlug.get(slug);

        if (!role) {
          const error = new Error(`Papel desconhecido: ${slug}`);
          error.code = "UNKNOWN_ROLE";
          throw error;
        }

        return role.id;
      });

      const passwordHash =
        typeof password === "string" && password.length > 0
          ? await hashPassword(password)
          : null;
      const targetWillBeAdmin =
        uniqueRoleSlugs.includes("administrador") && isActive;
      const deleteUserRoles = connection.prepare(
        "DELETE FROM user_roles WHERE user_id = ?",
      );
      const selectCurrentAdmin = connection.prepare(
        `SELECT 1
         FROM user_roles ur
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE ur.user_id = ? AND r.slug = 'administrador'`,
      );
      const countActiveAdmins = connection.prepare(
        `SELECT COUNT(DISTINCT u.id) AS total
         FROM users u
         INNER JOIN user_roles ur ON ur.user_id = u.id
         INNER JOIN roles r ON r.id = ur.role_id
         WHERE u.is_active = 1 AND r.slug = 'administrador'`,
      );

      connection.exec("BEGIN IMMEDIATE;");

      try {
        const isCurrentlyAdmin = Boolean(selectCurrentAdmin.get(id));
        const activeAdmins = countActiveAdmins.get().total;

        if (
          existing.is_active &&
          isCurrentlyAdmin &&
          !targetWillBeAdmin &&
          activeAdmins <= 1
        ) {
          const error = new Error(
            "Não é possível remover ou desativar o último administrador ativo.",
          );
          error.code = "LAST_ADMIN";
          throw error;
        }

        const timestamp = nowIso();

        if (passwordHash) {
          connection
            .prepare(
              `UPDATE users
               SET name = ?, email = ?, password_hash = ?, is_active = ?, updated_at = ?
               WHERE id = ?`,
            )
            .run(
              normalizedName,
              normalizedEmail,
              passwordHash,
              isActive ? 1 : 0,
              timestamp,
              id,
            );
        } else {
          connection
            .prepare(
              `UPDATE users
               SET name = ?, email = ?, is_active = ?, updated_at = ?
               WHERE id = ?`,
            )
            .run(
              normalizedName,
              normalizedEmail,
              isActive ? 1 : 0,
              timestamp,
              id,
            );
        }

        deleteUserRoles.run(id);

        for (const roleId of roleIds) {
          insertUserRole.run(id, roleId);
        }

        connection.exec("COMMIT;");
      } catch (error) {
        connection.exec("ROLLBACK;");
        throw error;
      }

      return database.getUserAuthById(id);
    },

    /**
     * @param {{
     *   userId: string,
     *   tokenHash: string,
     *   expiresAt: string,
     *   ipAddress?: string,
     *   userAgent?: string,
     * }} input
     */
    createSession({ userId, tokenHash, expiresAt, ipAddress, userAgent }) {
      connection
        .prepare(
          `INSERT INTO sessions
             (id, user_id, token_hash, created_at, expires_at, last_seen_at, ip_address, user_agent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          userId,
          tokenHash,
          nowIso(),
          expiresAt,
          nowIso(),
          ipAddress ?? null,
          userAgent ?? null,
        );
    },

    /**
     * Busca a sessão e devolve o usuário com papéis e permissões.
     * Sessões expiradas são removidas.
     *
     * @param {string} tokenHash
     */
    findSessionUser(tokenHash) {
      const selectSession = connection.prepare(
        `SELECT u.*, s.expires_at AS session_expires_at
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND u.is_active = 1`,
      );

      const row = selectSession.get(tokenHash);
      if (!row) {
        return null;
      }

      const expiresAt = Date.parse(row.session_expires_at);
      if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        connection
          .prepare("DELETE FROM sessions WHERE token_hash = ?")
          .run(tokenHash);
        return null;
      }

      connection
        .prepare("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?")
        .run(nowIso(), tokenHash);

      return hydrateUser(connection, row);
    },

    /**
     * @param {string} tokenHash
     */
    deleteSession(tokenHash) {
      connection
        .prepare("DELETE FROM sessions WHERE token_hash = ?")
        .run(tokenHash);
    },

    /**
     * Remove todas as sessões expiradas. Chamado na inicialização.
     */
    deleteExpiredSessions() {
      connection
        .prepare("DELETE FROM sessions WHERE expires_at <= ?")
        .run(nowIso());
    },

    /**
     * Registra um evento de auditoria sem incluir credenciais.
     *
     * @param {{
     *   userId?: string | null,
     *   actorEmail?: string | null,
     *   action: string,
     *   resource?: string | null,
     *   result: "success" | "failure",
     *   ipAddress?: string | null,
     *   userAgent?: string | null,
     *   metadata?: Record<string, unknown> | null,
     * }} input
     */
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

  database.deleteExpiredSessions();

  return database;
}
