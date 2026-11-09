import { randomUUID } from "node:crypto";
import { hashPassword } from "../security.js";
import { PERMISSIONS, ROLE_DEFINITIONS } from "../permissions.js";
import { normalizeEmail, nowIso } from "./helpers.js";

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

export async function seedDatabase(connection, options) {
  seedCatalog(connection);
  return seedAdminUser(connection, options);
}
