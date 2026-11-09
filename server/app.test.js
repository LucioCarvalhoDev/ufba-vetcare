import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { createVetCareServer } from "./app.js";
import { openDatabase } from "./database.js";
import { ALL_PERMISSION_CODES, hasPermission } from "./permissions.js";

const TEST_PASSWORD = "SenhaTeste123!";
const TEST_EMAIL = "admin@vetcare.com";

let tempDir;
let database;
let server;
let baseUrl;

function loginRequest(email, password, headers = {}) {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify({ email, password }),
  });
}

function sessionCookie(response) {
  return response.headers.getSetCookie()[0]?.split(";")[0] ?? "";
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "vetcare-test-"));
  database = await openDatabase({
    filename: join(tempDir, "vetcare.db"),
    adminEmail: TEST_EMAIL,
    adminName: "Administrador de Teste",
    adminPassword: TEST_PASSWORD,
  });

  server = createVetCareServer({
    database,
    sessionTtlHours: 1,
    cookieSecure: false,
    staticDir: join(tempDir, "dist"),
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections?.();
  });
  database.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("seed cria admin com hash scrypt e todas as permissões", () => {
  const admin = database.getUserAuthByEmail(TEST_EMAIL);

  assert.ok(admin);
  assert.equal(admin.email, TEST_EMAIL);
  assert.equal(admin.isActive, true);
  assert.equal(admin.roles.length, 1);
  assert.equal(admin.roles[0].slug, "administrador");
  assert.match(admin.passwordHash, /^scrypt\$/);
  assert.notEqual(admin.passwordHash, TEST_PASSWORD);
  assert.deepEqual(
    [...admin.permissions].sort(),
    [...ALL_PERMISSION_CODES].sort(),
  );
});

test("rejeita credenciais inválidas sem revelar qual campo falhou", async () => {
  const response = await loginRequest(TEST_EMAIL, "senha-incorreta");
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "invalid_credentials");
  assert.equal(body.error.message, "E-mail ou senha incorretos.");
  assert.deepEqual(response.headers.getSetCookie(), []);

  const audit = database.connection
    .prepare(
      `SELECT action, result, actor_email
       FROM audit_logs
       WHERE action = 'auth.login' AND result = 'failure'
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get();

  assert.equal(audit?.result, "failure");
  assert.equal(audit?.actor_email, TEST_EMAIL);
});

test("login cria sessão, /me restaura o usuário e logout invalida", async () => {
  const response = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const body = await response.json();
  const setCookies = response.headers.getSetCookie();

  assert.equal(response.status, 200);
  assert.equal(body.user.email, TEST_EMAIL);
  assert.equal(body.user.roles[0].slug, "administrador");
  assert.equal(setCookies.length, 1);
  assert.match(setCookies[0], /HttpOnly/);
  assert.match(setCookies[0], /SameSite=Lax/);

  const cookie = sessionCookie(response);
  assert.ok(cookie.startsWith("vetcare_session="));

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie },
  });
  const meBody = await meResponse.json();

  assert.equal(meResponse.status, 200);
  assert.equal(meBody.user.email, TEST_EMAIL);

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(logoutResponse.status, 204);

  const meAfterLogout = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie },
  });
  assert.equal(meAfterLogout.status, 401);
});

test("RBAC concede permissões por papel e nega as demais", async () => {
  const receptionist = await database.createUser({
    name: "Recepcionista de Teste",
    email: "recepcao@vetcare.com",
    password: "SenhaRecepcao123!",
    roleSlugs: ["recepcionista"],
  });

  assert.ok(hasPermission(receptionist, "appointments.write"));
  assert.ok(hasPermission(receptionist, "tutors.read"));
  assert.equal(hasPermission(receptionist, "users.write"), false);
  assert.equal(hasPermission(receptionist, "medical_records.write"), false);
  assert.equal(hasPermission(receptionist, "audit.read"), false);

  const response = await loginRequest(
    "recepcao@vetcare.com",
    "SenhaRecepcao123!",
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.user.roles[0].slug, "recepcionista");
  assert.ok(body.user.permissions.includes("payments.write"));
  assert.ok(!body.user.permissions.includes("roles.write"));

  const multiRole = await database.createUser({
    name: "Usuário com Dois Papéis",
    email: "multi@vetcare.com",
    password: "SenhaMultipla123!",
    roleSlugs: ["recepcionista", "veterinario"],
  });

  assert.equal(multiRole.roles.length, 2);
  assert.ok(hasPermission(multiRole, "payments.write"));
  assert.ok(hasPermission(multiRole, "medical_records.write"));
  assert.equal(hasPermission(multiRole, "users.write"), false);
});

test("usuário inativo não autentica", async () => {
  await database.createUser({
    name: "Usuário Inativo",
    email: "inativo@vetcare.com",
    password: "SenhaInativa123!",
    roleSlugs: ["veterinario"],
    isActive: false,
  });

  const response = await loginRequest(
    "inativo@vetcare.com",
    "SenhaInativa123!",
  );
  const body = await response.json();

  assert.equal(response.status, 401);
  assert.equal(body.error.code, "invalid_credentials");
  assert.deepEqual(response.headers.getSetCookie(), []);
});

test("sessão expirada é rejeitada e removida", async () => {
  const loginResponse = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const cookie = sessionCookie(loginResponse);
  const admin = database.getUserAuthByEmail(TEST_EMAIL);

  assert.ok(admin);

  database.connection
    .prepare("UPDATE sessions SET expires_at = ? WHERE user_id = ?")
    .run(new Date(Date.now() - 1_000).toISOString(), admin.id);

  const meResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { cookie },
  });
  const body = await meResponse.json();

  assert.equal(meResponse.status, 401);
  assert.equal(body.error.code, "unauthorized");

  const remaining = database.connection
    .prepare("SELECT COUNT(*) AS total FROM sessions WHERE user_id = ?")
    .get(admin.id);

  assert.equal(remaining.total, 0);
});

test("API de usuários exige autenticação e permissão", async () => {
  const anonymous = await fetch(`${baseUrl}/api/users`);
  assert.equal(anonymous.status, 401);

  const receptionistLogin = await loginRequest(
    "recepcao@vetcare.com",
    "SenhaRecepcao123!",
  );
  assert.equal(receptionistLogin.status, 200);
  const receptionistCookie = sessionCookie(receptionistLogin);

  const forbidden = await fetch(`${baseUrl}/api/users`, {
    headers: { cookie: receptionistCookie },
  });
  assert.equal(forbidden.status, 403);

  const forbiddenCreate = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: receptionistCookie,
    },
    body: JSON.stringify({
      name: "Sem Permissão",
      email: "sem-permissao@vetcare.com",
      password: "SenhaSemPermissao123!",
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  assert.equal(forbiddenCreate.status, 403);

  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  assert.equal(adminLogin.status, 200);
  const adminCookie = sessionCookie(adminLogin);

  const response = await fetch(`${baseUrl}/api/users`, {
    headers: { cookie: adminCookie },
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body.users));
  assert.ok(body.users.length >= 4);
  assert.equal("passwordHash" in body.users[0], false);

  const rolesResponse = await fetch(`${baseUrl}/api/roles`, {
    headers: { cookie: adminCookie },
  });
  const rolesBody = await rolesResponse.json();

  assert.equal(rolesResponse.status, 200);
  assert.equal(rolesBody.roles.length, 3);

  const forbiddenRoles = await fetch(`${baseUrl}/api/roles`, {
    headers: { cookie: receptionistCookie },
  });
  assert.equal(forbiddenRoles.status, 403);
});

test("cria usuário com papéis, valida duplicidade e registra auditoria", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const cookie = sessionCookie(adminLogin);

  const response = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({
      name: "Maria Souza",
      email: "maria@vetcare.com",
      password: "SenhaMaria123!",
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  const body = await response.json();

  assert.equal(response.status, 201);
  assert.equal(body.user.name, "Maria Souza");
  assert.equal(body.user.email, "maria@vetcare.com");
  assert.equal(body.user.isActive, true);
  assert.equal(body.user.roles[0].slug, "recepcionista");
  assert.equal("passwordHash" in body.user, false);

  const stored = database.getUserAuthByEmail("maria@vetcare.com");
  assert.ok(stored);
  assert.match(stored.passwordHash, /^scrypt\$/);
  assert.notEqual(stored.passwordHash, "SenhaMaria123!");

  const audit = database.connection
    .prepare(
      `SELECT action, result, resource
       FROM audit_logs
       WHERE action = 'users.create' AND resource = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(body.user.id);

  assert.equal(audit?.result, "success");
  assert.equal(audit?.resource, body.user.id);

  const duplicate = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({
      name: "Maria Duplicada",
      email: "MARIA@VETCARE.COM",
      password: "SenhaMaria123!",
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  const duplicateBody = await duplicate.json();

  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.error.code, "email_in_use");

  const invalidRole = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({
      name: "Papel Inválido",
      email: "papel-invalido@vetcare.com",
      password: "SenhaInvalida123!",
      roleSlugs: ["papel-inexistente"],
      isActive: true,
    }),
  });

  assert.equal(invalidRole.status, 400);

  const invalidPassword = await fetch(`${baseUrl}/api/users`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie,
    },
    body: JSON.stringify({
      name: "Senha Curta",
      email: "senha-curta@vetcare.com",
      password: "123",
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  const invalidPasswordBody = await invalidPassword.json();

  assert.equal(invalidPassword.status, 400);
  assert.equal(invalidPasswordBody.error.code, "invalid_password");
});

test("filtra usuários por nome/e-mail, papel e situação", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const cookie = sessionCookie(adminLogin);

  async function listUsers(query) {
    const response = await fetch(`${baseUrl}/api/users?${query}`, {
      headers: { cookie },
    });
    const body = await response.json();
    return { response, body };
  }

  const byName = await listUsers("q=maria");
  assert.equal(byName.response.status, 200);
  assert.ok(byName.body.users.length >= 1);
  assert.ok(
    byName.body.users.every((user) =>
      `${user.name} ${user.email}`.toLowerCase().includes("maria"),
    ),
  );

  const byEmail = await listUsers(
    `q=${encodeURIComponent("INATIVO@VETCARE.COM")}`,
  );
  assert.ok(byEmail.body.users.some((user) => user.email === "inativo@vetcare.com"));

  const byRole = await listUsers("role=recepcionista");
  assert.ok(byRole.body.users.length >= 2);
  assert.ok(
    byRole.body.users.every((user) =>
      user.roles.some((role) => role.slug === "recepcionista"),
    ),
  );

  const byStatus = await listUsers("status=inactive");
  assert.ok(byStatus.body.users.length >= 1);
  assert.ok(byStatus.body.users.every((user) => user.isActive === false));

  const combined = await listUsers(
    "role=administrador&status=active&q=administrador",
  );
  assert.ok(
    combined.body.users.some((user) => user.email === TEST_EMAIL),
  );

  const invalidStatus = await listUsers("status=desconhecido");
  assert.equal(invalidStatus.response.status, 400);
});

test("consulta e atualiza usuário, valida permissões, duplicidade e senha", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);
  const maria = database.getUserAuthByEmail("maria@vetcare.com");
  const admin = database.getUserAuthByEmail(TEST_EMAIL);

  assert.ok(maria);
  assert.ok(admin);

  const getResponse = await fetch(`${baseUrl}/api/users/${maria.id}`, {
    headers: { cookie: adminCookie },
  });
  const getBody = await getResponse.json();

  assert.equal(getResponse.status, 200);
  assert.equal(getBody.user.email, "maria@vetcare.com");

  const missingResponse = await fetch(
    `${baseUrl}/api/users/00000000-0000-4000-8000-000000000000`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(missingResponse.status, 404);

  const previousHash = maria.passwordHash;
  const updateResponse = await fetch(`${baseUrl}/api/users/${maria.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Maria Souza Lima",
      email: "maria.lima@vetcare.com",
      roleSlugs: ["recepcionista", "veterinario"],
      isActive: false,
    }),
  });
  const updateBody = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.user.name, "Maria Souza Lima");
  assert.equal(updateBody.user.email, "maria.lima@vetcare.com");
  assert.equal(updateBody.user.isActive, false);
  assert.equal(updateBody.user.roles.length, 2);

  const afterNameUpdate = database.getUserAuthByEmail("maria.lima@vetcare.com");
  assert.ok(afterNameUpdate);
  assert.equal(afterNameUpdate.passwordHash, previousHash);

  const audit = database.connection
    .prepare(
      `SELECT action, result, resource
       FROM audit_logs
       WHERE action = 'users.update' AND resource = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(maria.id);

  assert.equal(audit?.result, "success");

  const duplicate = await fetch(`${baseUrl}/api/users/${maria.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Maria Souza Lima",
      email: TEST_EMAIL,
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  const duplicateBody = await duplicate.json();

  assert.equal(duplicate.status, 409);
  assert.equal(duplicateBody.error.code, "email_in_use");

  const receptionistLogin = await loginRequest(
    "recepcao@vetcare.com",
    "SenhaRecepcao123!",
  );
  const receptionistCookie = sessionCookie(receptionistLogin);
  const forbidden = await fetch(`${baseUrl}/api/users/${maria.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: receptionistCookie,
    },
    body: JSON.stringify({
      name: "Sem Permissão",
      email: "sem-permissao-update@vetcare.com",
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });

  assert.equal(forbidden.status, 403);

  const passwordResponse = await fetch(`${baseUrl}/api/users/${maria.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Maria Souza Lima",
      email: "maria.lima@vetcare.com",
      password: "NovaSenhaMaria123!",
      roleSlugs: ["recepcionista", "veterinario"],
      isActive: true,
    }),
  });

  assert.equal(passwordResponse.status, 200);

  const afterPasswordUpdate = database.getUserAuthByEmail(
    "maria.lima@vetcare.com",
  );
  assert.ok(afterPasswordUpdate);
  assert.notEqual(afterPasswordUpdate.passwordHash, previousHash);

  const newPasswordLogin = await loginRequest(
    "maria.lima@vetcare.com",
    "NovaSenhaMaria123!",
  );
  assert.equal(newPasswordLogin.status, 200);

  const oldPasswordLogin = await loginRequest(
    "maria.lima@vetcare.com",
    "SenhaMaria123!",
  );
  assert.equal(oldPasswordLogin.status, 401);

  const lastAdminResponse = await fetch(`${baseUrl}/api/users/${admin.id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: admin.name,
      email: admin.email,
      roleSlugs: ["recepcionista"],
      isActive: true,
    }),
  });
  const lastAdminBody = await lastAdminResponse.json();

  assert.equal(lastAdminResponse.status, 409);
  assert.equal(lastAdminBody.error.code, "last_admin");

  const adminAfter = database.getUserAuthByEmail(TEST_EMAIL);
  assert.ok(adminAfter);
  assert.equal(adminAfter.roles[0].slug, "administrador");
});

test("atualização de usuário inexistente retorna 404", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const cookie = sessionCookie(adminLogin);

  const response = await fetch(
    `${baseUrl}/api/users/00000000-0000-4000-8000-000000000000`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie,
      },
      body: JSON.stringify({
        name: "Inexistente",
        email: "inexistente@vetcare.com",
        roleSlugs: ["recepcionista"],
        isActive: true,
      }),
    },
  );
  const body = await response.json();

  assert.equal(response.status, 404);
  assert.equal(body.error.code, "user_not_found");
});
