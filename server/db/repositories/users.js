import { randomUUID } from "node:crypto";
import { hashPassword } from "../../security.js";
import {
  domainError,
  escapeLike,
  normalizeEmail,
  nowIso,
} from "../helpers.js";

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

export function hydrateUser(connection, row) {
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

export function createUsersRepository(connection) {
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

  function getUserAuthById(id) {
    const row = selectUserById.get(id);
    return row ? hydrateUser(connection, row) : null;
  }

  return {
    getUserAuthByEmail(email) {
      const row = selectUserByEmail.get(normalizeEmail(email));
      return row ? hydrateUser(connection, row) : null;
    },

    getUserAuthById,

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

    listRoles() {
      return connection
        .prepare(
          `SELECT id, slug, name, description
           FROM roles
           ORDER BY name COLLATE NOCASE ASC`,
        )
        .all();
    },

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
        throw domainError("INVALID_NAME", "Nome do usuário é obrigatório.");
      }

      if (!normalizedEmail) {
        throw domainError("INVALID_EMAIL", "E-mail do usuário é obrigatório.");
      }

      if (selectUserByEmail.get(normalizedEmail)) {
        throw domainError(
          "EMAIL_IN_USE",
          "Já existe um usuário com este e-mail.",
        );
      }

      if (!Array.isArray(roleSlugs) || roleSlugs.length === 0) {
        throw domainError("ROLE_REQUIRED", "Selecione ao menos um papel.");
      }

      const roleIds = [...new Set(roleSlugs)].map((slug) => {
        const role = selectRoleBySlug.get(slug);

        if (!role) {
          throw domainError("UNKNOWN_ROLE", `Papel desconhecido: ${slug}`);
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

      return getUserAuthById(userId);
    },

    async updateUser(
      id,
      { name, email, password, roleSlugs = [], isActive = true },
    ) {
      const existing = selectUserById.get(id);

      if (!existing) {
        throw domainError("USER_NOT_FOUND", "Usuário não encontrado.");
      }

      const normalizedName = String(name ?? "").trim();
      const normalizedEmail = normalizeEmail(email);

      if (!normalizedName) {
        throw domainError("INVALID_NAME", "Nome do usuário é obrigatório.");
      }

      if (!normalizedEmail) {
        throw domainError("INVALID_EMAIL", "E-mail do usuário é obrigatório.");
      }

      const emailOwner = selectUserByEmail.get(normalizedEmail);

      if (emailOwner && emailOwner.id !== id) {
        throw domainError(
          "EMAIL_IN_USE",
          "Já existe um usuário com este e-mail.",
        );
      }

      if (!Array.isArray(roleSlugs) || roleSlugs.length === 0) {
        throw domainError("ROLE_REQUIRED", "Selecione ao menos um papel.");
      }

      const uniqueRoleSlugs = [...new Set(roleSlugs)];
      const roleIds = uniqueRoleSlugs.map((slug) => {
        const role = selectRoleBySlug.get(slug);

        if (!role) {
          throw domainError("UNKNOWN_ROLE", `Papel desconhecido: ${slug}`);
        }

        return role.id;
      });

      const passwordHash =
        typeof password === "string" && password.length > 0
          ? await hashPassword(password)
          : null;
      const targetWillBeAdmin =
        uniqueRoleSlugs.includes("administrador") && isActive;

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
          throw domainError(
            "LAST_ADMIN",
            "Não é possível remover ou desativar o último administrador ativo.",
          );
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

      return getUserAuthById(id);
    },
  };
}
