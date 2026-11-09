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
