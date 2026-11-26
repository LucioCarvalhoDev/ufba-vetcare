import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

function getAppointmentNotifications(appointmentId) {
  return database.connection
    .prepare(
      `SELECT n.id, n.user_id, n.event_type, n.appointment_id, n.title,
              n.description, n.created_at, u.email
       FROM notifications n
       INNER JOIN users u ON u.id = n.user_id
       WHERE n.appointment_id = ?
       ORDER BY n.created_at ASC, n.id ASC`,
    )
    .all(appointmentId);
}

function insertNotificationFixture(userId, overrides = {}) {
  const notification = {
    id: randomUUID(),
    eventType: "appointment_created",
    appointmentId: null,
    title: "Notificação de teste",
    description: "Descrição de teste.",
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  };

  database.connection
    .prepare(
      `INSERT INTO notifications
         (id, user_id, event_type, appointment_id, title, description,
          created_at, read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      notification.id,
      userId,
      notification.eventType,
      notification.appointmentId,
      notification.title,
      notification.description,
      notification.createdAt,
      notification.readAt,
    );

  return notification;
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
  assert.ok(hasPermission(admin, "notifications.manage"));
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
  assert.ok(hasPermission(receptionist, "notifications.manage"));
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
  assert.ok(body.user.permissions.includes("notifications.manage"));
  assert.ok(!body.user.permissions.includes("roles.write"));

  const veterinarian = await database.createUser({
    name: "Veterinário de Teste RBAC",
    email: "veterinario-rbac@vetcare.com",
    password: "SenhaVeterinario123!",
    roleSlugs: ["veterinario"],
  });

  assert.ok(hasPermission(veterinarian, "notifications.manage"));

  const userWithoutPermissions = { permissions: [] };
  assert.equal(
    hasPermission(userWithoutPermissions, "notifications.manage"),
    false,
  );

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

test("API de tutores e animais aplica CRUD, filtros, RBAC e auditoria", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);

  const vet = await database.createUser({
    name: "Veterinário da API",
    email: "vet.api@vetcare.com",
    password: "SenhaVetApi123!",
    roleSlugs: ["veterinario"],
  });
  assert.ok(vet);

  const vetLogin = await loginRequest(
    "vet.api@vetcare.com",
    "SenhaVetApi123!",
  );
  const vetCookie = sessionCookie(vetLogin);

  const anonymous = await fetch(`${baseUrl}/api/tutors`);
  assert.equal(anonymous.status, 401);

  const tutorResponse = await fetch(`${baseUrl}/api/tutors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Mariana Souza",
      cpf: "111.222.333-44",
      email: "mariana.api@vetcare.com",
      phone: "(71) 99999-0000",
      address: "Salvador, BA",
    }),
  });
  const tutorBody = await tutorResponse.json();

  assert.equal(tutorResponse.status, 201);
  assert.equal(tutorBody.tutor.name, "Mariana Souza");
  assert.equal(tutorBody.tutor.animalCount, 0);

  const tutorId = tutorBody.tutor.id;

  const duplicateCpf = await fetch(`${baseUrl}/api/tutors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Outro Tutor",
      cpf: "111.222.333-44",
    }),
  });
  assert.equal(duplicateCpf.status, 409);

  const tutorList = await fetch(
    `${baseUrl}/api/tutors?q=mariana&status=active`,
    { headers: { cookie: adminCookie } },
  );
  const tutorListBody = await tutorList.json();

  assert.equal(tutorList.status, 200);
  assert.equal(tutorListBody.total, 1);
  assert.equal(tutorListBody.tutors[0].id, tutorId);

  const vetRead = await fetch(`${baseUrl}/api/tutors`, {
    headers: { cookie: vetCookie },
  });
  assert.equal(vetRead.status, 200);

  const vetCreate = await fetch(`${baseUrl}/api/tutors`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: vetCookie,
    },
    body: JSON.stringify({ name: "Sem Permissão" }),
  });
  assert.equal(vetCreate.status, 403);

  const animalResponse = await fetch(`${baseUrl}/api/animals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      tutorId,
      name: "Thor",
      species: "Cão",
      breed: "SRD",
      sex: "male",
      birthDate: "2022-05-10",
    }),
  });
  const animalBody = await animalResponse.json();

  assert.equal(animalResponse.status, 201);
  assert.equal(animalBody.animal.tutorId, tutorId);
  assert.equal(animalBody.animal.tutorName, "Mariana Souza");

  const animalId = animalBody.animal.id;

  const animalList = await fetch(
    `${baseUrl}/api/animals?q=thor&tutorId=${tutorId}&species=C%C3%A3o&status=active`,
    { headers: { cookie: adminCookie } },
  );
  const animalListBody = await animalList.json();

  assert.equal(animalList.status, 200);
  assert.equal(animalListBody.total, 1);
  assert.equal(animalListBody.animals[0].name, "Thor");

  const invalidStatus = await fetch(`${baseUrl}/api/animals?status=invalid`, {
    headers: { cookie: adminCookie },
  });
  assert.equal(invalidStatus.status, 400);

  const invalidSex = await fetch(`${baseUrl}/api/animals`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      tutorId,
      name: "Mia",
      species: "Gato",
      sex: "invalid",
    }),
  });
  assert.equal(invalidSex.status, 400);

  const updateTutor = await fetch(`${baseUrl}/api/tutors/${tutorId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      name: "Mariana Souza",
      cpf: "111.222.333-44",
      email: "mariana.api@vetcare.com",
      phone: "(71) 98888-1111",
      address: "Salvador, BA",
      isActive: false,
    }),
  });
  assert.equal(updateTutor.status, 200);
  assert.equal((await updateTutor.json()).tutor.isActive, false);

  const updateAnimal = await fetch(`${baseUrl}/api/animals/${animalId}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      tutorId,
      name: "Thor II",
      species: "Cão",
      breed: "SRD",
      sex: "female",
      birthDate: "2022-05-10",
      isActive: false,
    }),
  });
  assert.equal(updateAnimal.status, 200);
  assert.equal((await updateAnimal.json()).animal.name, "Thor II");

  const blockedTutorDelete = await fetch(
    `${baseUrl}/api/tutors/${tutorId}`,
    { method: "DELETE", headers: { cookie: adminCookie } },
  );
  assert.equal(blockedTutorDelete.status, 409);

  const animalDelete = await fetch(`${baseUrl}/api/animals/${animalId}`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  });
  assert.equal(animalDelete.status, 204);

  const tutorDelete = await fetch(`${baseUrl}/api/tutors/${tutorId}`, {
    method: "DELETE",
    headers: { cookie: adminCookie },
  });
  assert.equal(tutorDelete.status, 204);

  const actions = database.connection
    .prepare(
      `SELECT DISTINCT action
       FROM audit_logs
       WHERE action LIKE 'tutors.%' OR action LIKE 'animals.%'
       ORDER BY action`,
    )
    .all()
    .map((row) => row.action);

  assert.deepEqual(actions, [
    "animals.create",
    "animals.delete",
    "animals.update",
    "tutors.create",
    "tutors.delete",
    "tutors.update",
  ]);
});

test("API de agendamentos cobre CRUD, conflito, cancelamento e auditoria", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);

  const vet = await database.createUser({
    name: "Veterinária da Agenda",
    email: "vet.agenda@vetcare.com",
    password: "SenhaVetAgenda123!",
    roleSlugs: ["veterinario"],
  });

  assert.ok(vet);

  const receptionist = await database.createUser({
    name: "Recepcionista da Agenda",
    email: "recepcionista.agenda@vetcare.com",
    password: "SenhaRecepcionista123!",
    roleSlugs: ["recepcionista"],
  });
  const multiRoleUser = await database.createUser({
    name: "Usuário Multiperfil da Agenda",
    email: "multi.agenda@vetcare.com",
    password: "SenhaMultiAgenda123!",
    roleSlugs: ["recepcionista", "veterinario"],
  });
  const inactiveRecipient = await database.createUser({
    name: "Usuário Inativo da Agenda",
    email: "inativo.agenda@vetcare.com",
    password: "SenhaInativoAgenda123!",
    roleSlugs: ["recepcionista"],
    isActive: false,
  });
  const observerRoleId = randomUUID();

  database.connection
    .prepare(
      "INSERT INTO roles (id, slug, name, description) VALUES (?, ?, ?, ?)",
    )
    .run(
      observerRoleId,
      `agenda-observer-${observerRoleId}`,
      "Observador da Agenda",
      "Papel de teste sem permissão de notificações.",
    );

  const unauthorizedRecipient = await database.createUser({
    name: "Usuário sem Permissão de Notificações",
    email: "sem-permissao.agenda@vetcare.com",
    password: "SenhaSemPermissao123!",
    roleSlugs: [`agenda-observer-${observerRoleId}`],
  });
  const admin = database.getUserAuthByEmail(TEST_EMAIL);
  const expectedRecipientIds = database.connection
    .prepare(
      `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN user_roles ur ON ur.user_id = u.id
       INNER JOIN role_permissions rp ON rp.role_id = ur.role_id
       INNER JOIN permissions p ON p.id = rp.permission_id
       WHERE u.is_active = 1 AND p.code = ?`,
    )
    .all("notifications.manage")
    .map((user) => user.id)
    .sort();

  assert.ok(expectedRecipientIds.includes(admin.id));
  assert.ok(expectedRecipientIds.includes(receptionist.id));
  assert.ok(expectedRecipientIds.includes(vet.id));
  assert.ok(expectedRecipientIds.includes(multiRoleUser.id));
  assert.ok(!expectedRecipientIds.includes(inactiveRecipient.id));
  assert.ok(!expectedRecipientIds.includes(unauthorizedRecipient.id));

  const tutor = database.createTutor({
    name: "Tutor da Agenda",
    cpf: "555.444.333-22",
    email: "tutor.agenda@vetcare.com",
  });
  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Pet da Agenda",
    species: "Cão",
    breed: "SRD",
    sex: "male",
  });

  const veterinarians = await fetch(`${baseUrl}/api/veterinarians`, {
    headers: { cookie: adminCookie },
  });
  const veterinariansBody = await veterinarians.json();

  assert.equal(veterinarians.status, 200);
  assert.ok(
    veterinariansBody.veterinarians.some(
      (item) => item.email === "vet.agenda@vetcare.com",
    ),
  );

  const createResponse = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      animalId: animal.id,
      veterinarianId: vet.id,
      type: "consultation",
      scheduledAt: "2030-01-15T13:00:00.000Z",
      durationMinutes: 30,
      notes: "Primeira consulta.",
    }),
  });
  const createBody = await createResponse.json();

  assert.equal(createResponse.status, 201);
  assert.equal(createBody.appointment.animalId, animal.id);
  assert.equal(createBody.appointment.tutorName, "Tutor da Agenda");
  assert.equal(createBody.appointment.veterinarianName, "Veterinária da Agenda");
  assert.equal(createBody.appointment.status, "scheduled");

  const appointmentId = createBody.appointment.id;
  const createdNotifications = getAppointmentNotifications(appointmentId);

  assert.equal(createdNotifications.length, expectedRecipientIds.length);
  assert.deepEqual(
    createdNotifications.map((notification) => notification.user_id).sort(),
    expectedRecipientIds,
  );
  assert.equal(
    new Set(createdNotifications.map((notification) => notification.user_id))
      .size,
    expectedRecipientIds.length,
  );
  assert.ok(
    createdNotifications.every(
      (notification) =>
        notification.event_type === "appointment_created" &&
        notification.title === "Novo agendamento: Pet da Agenda" &&
        notification.description.includes("Tutor da Agenda") &&
        notification.description.includes("Veterinária da Agenda") &&
        notification.description.includes("2030-01-15T13:00:00.000Z"),
    ),
  );
  assert.ok(
    createdNotifications.every(
      (notification) =>
        notification.user_id !== inactiveRecipient.id &&
        notification.user_id !== unauthorizedRecipient.id,
    ),
  );

  const listResponse = await fetch(
    `${baseUrl}/api/appointments?q=Pet%20da%20Agenda&type=consultation&status=scheduled&veterinarianId=${vet.id}`,
    { headers: { cookie: adminCookie } },
  );
  const listBody = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listBody.total, 1);
  assert.equal(listBody.appointments[0].id, appointmentId);

  const conflictResponse = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      animalId: animal.id,
      veterinarianId: vet.id,
      type: "vaccination",
      scheduledAt: "2030-01-15T13:15:00.000Z",
      durationMinutes: 30,
    }),
  });
  const conflictBody = await conflictResponse.json();

  assert.equal(conflictResponse.status, 409);
  assert.equal(conflictBody.error.code, "appointment_conflict");
  assert.equal(
    getAppointmentNotifications(appointmentId).length,
    expectedRecipientIds.length,
  );

  const noOpUpdateResponse = await fetch(
    `${baseUrl}/api/appointments/${appointmentId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({
        animalId: animal.id,
        veterinarianId: vet.id,
        type: "consultation",
        scheduledAt: "2030-01-15T13:00:00.000Z",
        durationMinutes: 30,
        status: "scheduled",
        notes: "Primeira consulta.",
      }),
    },
  );

  assert.equal(noOpUpdateResponse.status, 200);
  assert.equal(
    getAppointmentNotifications(appointmentId).length,
    expectedRecipientIds.length,
  );

  const updateResponse = await fetch(
    `${baseUrl}/api/appointments/${appointmentId}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({
        animalId: animal.id,
        veterinarianId: vet.id,
        type: "surgery",
        scheduledAt: "2030-01-15T14:00:00.000Z",
        durationMinutes: 60,
        status: "scheduled",
        notes: "Procedimento cirúrgico.",
      }),
    },
  );
  const updateBody = await updateResponse.json();

  assert.equal(updateResponse.status, 200);
  assert.equal(updateBody.appointment.type, "surgery");
  const afterUpdateNotifications = getAppointmentNotifications(appointmentId);

  assert.equal(afterUpdateNotifications.length, expectedRecipientIds.length * 2);
  assert.equal(
    afterUpdateNotifications.filter(
      (notification) => notification.event_type === "appointment_updated",
    ).length,
    expectedRecipientIds.length,
  );

  const cancelResponse = await fetch(
    `${baseUrl}/api/appointments/${appointmentId}/cancel`,
    { method: "POST", headers: { cookie: adminCookie } },
  );
  const cancelBody = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.appointment.status, "cancelled");
  const afterCancelNotifications = getAppointmentNotifications(appointmentId);

  assert.equal(afterCancelNotifications.length, expectedRecipientIds.length * 3);
  assert.equal(
    afterCancelNotifications.filter(
      (notification) =>
        notification.event_type === "appointment_cancelled",
    ).length,
    expectedRecipientIds.length,
  );

  const notificationCountBeforeFailure = database.connection
    .prepare("SELECT COUNT(*) AS total FROM notifications")
    .get().total;
  database.connection.exec(
    `CREATE TRIGGER fail_notification_insert
     BEFORE INSERT ON notifications
     BEGIN
       SELECT RAISE(ABORT, 'notification insert failed');
     END;`,
  );

  let failedCreateResponse;

  try {
    failedCreateResponse = await fetch(`${baseUrl}/api/appointments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({
        animalId: animal.id,
        veterinarianId: vet.id,
        type: "consultation",
        scheduledAt: "2030-01-16T13:00:00.000Z",
        durationMinutes: 30,
      }),
    });
  } finally {
    database.connection.exec("DROP TRIGGER fail_notification_insert;");
  }

  assert.equal(failedCreateResponse.status, 500);
  assert.equal(
    database.connection
      .prepare(
        "SELECT COUNT(*) AS total FROM appointments WHERE scheduled_at = ?",
      )
      .get("2030-01-16T13:00:00.000Z").total,
    0,
  );
  assert.equal(
    database.connection
      .prepare("SELECT COUNT(*) AS total FROM notifications")
      .get().total,
    notificationCountBeforeFailure,
  );

  const rebookResponse = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      animalId: animal.id,
      veterinarianId: vet.id,
      type: "vaccination",
      scheduledAt: "2030-01-15T14:00:00.000Z",
      durationMinutes: 60,
    }),
  });

  assert.equal(rebookResponse.status, 201);
  const rebookBody = await rebookResponse.json();
  const rebookAppointment = rebookBody.appointment;

  const cancelByUpdateResponse = await fetch(
    `${baseUrl}/api/appointments/${rebookAppointment.id}`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({
        animalId: animal.id,
        veterinarianId: vet.id,
        type: "vaccination",
        scheduledAt: "2030-01-15T14:00:00.000Z",
        durationMinutes: 60,
        status: "cancelled",
      }),
    },
  );

  assert.equal(cancelByUpdateResponse.status, 200);
  const cancelledByUpdateNotifications = getAppointmentNotifications(
    rebookAppointment.id,
  );
  assert.equal(
    cancelledByUpdateNotifications.filter(
      (notification) =>
        notification.event_type === "appointment_cancelled",
    ).length,
    expectedRecipientIds.length,
  );
  assert.equal(
    cancelledByUpdateNotifications.filter(
      (notification) => notification.event_type === "appointment_updated",
    ).length,
    0,
  );

  const vaccinationList = await fetch(
    `${baseUrl}/api/appointments?type=vaccination`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal((await vaccinationList.json()).total, 1);

  const anonymous = await fetch(`${baseUrl}/api/appointments`);
  assert.equal(anonymous.status, 401);

  const blockedAnimalDelete = await fetch(
    `${baseUrl}/api/animals/${animal.id}`,
    { method: "DELETE", headers: { cookie: adminCookie } },
  );
  const blockedAnimalBody = await blockedAnimalDelete.json();

  assert.equal(blockedAnimalDelete.status, 409);
  assert.equal(blockedAnimalBody.error.code, "animal_has_appointments");

  const auditActions = database.connection
    .prepare(
      `SELECT DISTINCT action
       FROM audit_logs
       WHERE action LIKE 'appointments.%'
       ORDER BY action`,
    )
    .all()
    .map((row) => row.action);

  assert.deepEqual(auditActions, [
    "appointments.cancel",
    "appointments.create",
    "appointments.update",
  ]);
});

test("disponibilidade semanal do veterinário é editável e protegida", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);

  const vet = await database.createUser({
    name: "Veterinário da Disponibilidade",
    email: "vet.disponibilidade@vetcare.com",
    password: "SenhaVetDisponibilidade123!",
    roleSlugs: ["veterinario"],
  });

  assert.ok(vet);

  const initial = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    { headers: { cookie: adminCookie } },
  );
  const initialBody = await initial.json();

  assert.equal(initial.status, 200);
  assert.equal(initialBody.veterinarian.name, "Veterinário da Disponibilidade");
  assert.deepEqual(initialBody.slots, []);

  const slots = [
    { weekday: 1, startMinutes: 480 },
    { weekday: 1, startMinutes: 510 },
    { weekday: 2, startMinutes: 540 },
  ];
  const update = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({ slots }),
    },
  );
  const updateBody = await update.json();

  assert.equal(update.status, 200);
  assert.deepEqual(updateBody.slots, slots);

  const saved = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    { headers: { cookie: adminCookie } },
  );
  assert.deepEqual((await saved.json()).slots, slots);

  const invalidWeekday = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({ slots: [{ weekday: 8, startMinutes: 480 }] }),
    },
  );
  assert.equal(invalidWeekday.status, 400);

  const invalidMinutes = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: adminCookie,
      },
      body: JSON.stringify({ slots: [{ weekday: 1, startMinutes: 485 }] }),
    },
  );
  assert.equal(invalidMinutes.status, 400);

  const receptionistLogin = await loginRequest(
    "recepcao@vetcare.com",
    "SenhaRecepcao123!",
  );
  const receptionistCookie = sessionCookie(receptionistLogin);

  const readOnly = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    { headers: { cookie: receptionistCookie } },
  );
  assert.equal(readOnly.status, 200);

  const forbidden = await fetch(
    `${baseUrl}/api/veterinarians/${vet.id}/availability`,
    {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        cookie: receptionistCookie,
      },
      body: JSON.stringify({ slots }),
    },
  );
  assert.equal(forbidden.status, 403);

  const admin = database.getUserAuthByEmail(TEST_EMAIL);
  assert.ok(admin);

  const notVet = await fetch(
    `${baseUrl}/api/veterinarians/${admin.id}/availability`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(notVet.status, 404);

  const audit = database.connection
    .prepare(
      `SELECT action, result, resource
       FROM audit_logs
       WHERE action = 'veterinarians.availability_update' AND resource = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(vet.id);

  assert.equal(audit?.result, "success");
});

test("lista veterinários disponíveis conforme dia, início e duração", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);
  const vet = database.getUserAuthByEmail("vet.disponibilidade@vetcare.com");

  assert.ok(vet);

  async function available(query) {
    const response = await fetch(`${baseUrl}/api/veterinarians?${query}`, {
      headers: { cookie: adminCookie },
    });
    return { response, body: await response.json() };
  }

  const oneHour = await available(
    `weekday=1&startMinutes=480&durationMinutes=60`,
  );
  assert.equal(oneHour.response.status, 200);
  assert.ok(oneHour.body.veterinarians.some((item) => item.id === vet.id));

  const oneAndHalf = await available(
    `weekday=1&startMinutes=480&durationMinutes=90`,
  );
  assert.ok(!oneAndHalf.body.veterinarians.some((item) => item.id === vet.id));

  const tuesday = await available(
    `weekday=2&startMinutes=540&durationMinutes=30`,
  );
  assert.ok(tuesday.body.veterinarians.some((item) => item.id === vet.id));

  const invalid = await available(
    `weekday=8&startMinutes=480&durationMinutes=30`,
  );
  assert.equal(invalid.response.status, 400);
});

test("agenda semanal distingue livre, ocupado e sem atendimento", async () => {
  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);
  const vet = database.getUserAuthByEmail("vet.disponibilidade@vetcare.com");

  assert.ok(vet);

  const tutor = database.createTutor({
    name: "Tutor da Agenda Visual",
    cpf: "777.888.999-00",
  });
  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Pet da Agenda Visual",
    species: "Gato",
    sex: "female",
  });

  const appointment = await fetch(`${baseUrl}/api/appointments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: adminCookie,
    },
    body: JSON.stringify({
      animalId: animal.id,
      veterinarianId: vet.id,
      type: "consultation",
      scheduledAt: new Date(2030, 1, 11, 8, 0).toISOString(),
      durationMinutes: 30,
    }),
  });

  assert.equal(appointment.status, 201);

  const schedule = await fetch(
    `${baseUrl}/api/schedule?from=2030-02-11`,
    { headers: { cookie: adminCookie } },
  );
  const scheduleBody = await schedule.json();

  assert.equal(schedule.status, 200);
  assert.equal(scheduleBody.days.length, 7);
  assert.equal(scheduleBody.days[0].date, "2030-02-11");
  assert.equal(scheduleBody.days[0].slots[0], "closed");
  assert.equal(scheduleBody.days[0].slots[16], "busy");
  assert.equal(scheduleBody.days[0].slots[17], "free");
  assert.equal(scheduleBody.days[1].slots[18], "free");

  const busyFilter = await fetch(
    `${baseUrl}/api/veterinarians?weekday=1&startMinutes=480&durationMinutes=30&date=2030-02-11`,
    { headers: { cookie: adminCookie } },
  );
  const busyBody = await busyFilter.json();
  assert.ok(!busyBody.veterinarians.some((item) => item.id === vet.id));

  const freeFilter = await fetch(
    `${baseUrl}/api/veterinarians?weekday=2&startMinutes=540&durationMinutes=30&date=2030-02-12`,
    { headers: { cookie: adminCookie } },
  );
  const freeBody = await freeFilter.json();
  assert.ok(freeBody.veterinarians.some((item) => item.id === vet.id));

  const invalid = await fetch(
    `${baseUrl}/api/schedule?from=2030-02-31`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(invalid.status, 400);
});

test("dashboard do veterinário resume o dia, o mês e a semana", async () => {
  const vet = await database.createUser({
    name: "Veterinária do Dashboard",
    email: "vet.dashboard@vetcare.com",
    password: "SenhaDashboard123!",
    roleSlugs: ["veterinario"],
  });

  assert.ok(vet);

  const tutor = database.createTutor({
    name: "Tutor do Dashboard",
    cpf: "123.123.123-12",
  });
  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Pet do Dashboard",
    species: "Cão",
    sex: "male",
  });

  function createAt(hour) {
    return database.createAppointment({
      animalId: animal.id,
      veterinarianId: vet.id,
      type: "consultation",
      scheduledAt: new Date(2030, 1, 11, hour, 0).toISOString(),
      durationMinutes: 30,
      notes: "Dashboard.",
    });
  }

  const completed = createAt(8);
  createAt(9);
  const cancelled = createAt(10);
  createAt(11);
  database.updateAppointment(completed.id, {
    animalId: animal.id,
    veterinarianId: vet.id,
    type: "consultation",
    scheduledAt: completed.scheduledAt,
    durationMinutes: 30,
    status: "completed",
  });
  database.cancelAppointment(cancelled.id);
  database.createAppointment({
    animalId: animal.id,
    veterinarianId: vet.id,
    type: "consultation",
    scheduledAt: new Date(2030, 1, 12, 9, 0).toISOString(),
    durationMinutes: 30,
    notes: "Dashboard.",
  });

  const login = await loginRequest(vet.email, "SenhaDashboard123!");
  const cookie = sessionCookie(login);
  const response = await fetch(
    `${baseUrl}/api/veterinarian-dashboard?date=2030-02-11&month=2030-02`,
    { headers: { cookie } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.veterinarian.id, vet.id);
  assert.deepEqual(body.metrics, {
    total: 4,
    completed: 1,
    pending: 2,
    cancelled: 1,
  });
  assert.equal(body.appointments.length, 4);
  assert.equal(body.upcoming.length, 4);
  assert.deepEqual(
    body.upcoming.map((appointment) => appointment.date),
    ["2030-02-11", "2030-02-11", "2030-02-11", "2030-02-12"],
  );
  assert.ok(
    body.upcoming.every((appointment) => appointment.status !== "cancelled"),
  );
  assert.equal(body.month.key, "2030-02");
  assert.deepEqual(
    body.month.days.map((day) => day.date),
    ["2030-02-11", "2030-02-12"],
  );
  assert.equal(body.month.days[0].count, 3);
  assert.equal(body.week.total, 4);

  const adminLogin = await loginRequest(TEST_EMAIL, TEST_PASSWORD);
  const adminCookie = sessionCookie(adminLogin);
  const forbidden = await fetch(
    `${baseUrl}/api/veterinarian-dashboard?date=2030-02-11&month=2030-02`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal(forbidden.status, 403);

  const invalid = await fetch(
    `${baseUrl}/api/veterinarian-dashboard?date=2030-02-11&month=2030-13`,
    { headers: { cookie } },
  );
  assert.equal(invalid.status, 400);
});

test("dashboard da clínica exige permissão e retorna indicadores agregados", async () => {
  const receptionist = await database.createUser({
    name: "Recepcionista do Dashboard da Clínica",
    email: "recepcao.clinic.dashboard@vetcare.com",
    password: "SenhaRecepcao123!",
    roleSlugs: ["recepcionista"],
  });
  assert.ok(receptionist);

  const monthDate = new Date();
  monthDate.setDate(1);
  monthDate.setMonth(monthDate.getMonth() + 2);
  const month = `${monthDate.getFullYear()}-${String(
    monthDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  const baseline = database.getClinicDashboard({ month });
  const tutor = database.createTutor({ name: "Tutor do Dashboard da Clínica" });
  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Pet do Dashboard da Clínica",
    species: "Gato",
  });
  const vet = await database.createUser({
    name: "Veterinário do Dashboard da Clínica",
    email: "vet.clinic.dashboard@vetcare.com",
    password: "SenhaVet123!",
    roleSlugs: ["veterinario"],
  });

  database.createAppointment({
    animalId: animal.id,
    veterinarianId: vet.id,
    type: "consultation",
    scheduledAt: new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      10,
      9,
    ).toISOString(),
    durationMinutes: 30,
  });
  database.createAppointment({
    animalId: animal.id,
    veterinarianId: vet.id,
    type: "vaccination",
    scheduledAt: new Date(
      monthDate.getFullYear(),
      monthDate.getMonth(),
      11,
      9,
    ).toISOString(),
    durationMinutes: 30,
  });

  const login = await loginRequest(
    receptionist.email,
    "SenhaRecepcao123!",
  );
  const cookie = sessionCookie(login);
  const response = await fetch(
    `${baseUrl}/api/clinic-dashboard?month=${month}`,
    { headers: { cookie } },
  );
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.month, month);
  assert.equal(
    body.metrics.activePatients,
    baseline.metrics.activePatients + 1,
  );
  assert.equal(
    body.metrics.activeTutors,
    baseline.metrics.activeTutors + 1,
  );
  assert.equal(
    body.metrics.consultationsThisMonth,
    baseline.metrics.consultationsThisMonth + 1,
  );
  assert.equal(
    body.metrics.pendingVaccinations,
    baseline.metrics.pendingVaccinations + 1,
  );
  assert.equal(body.monthlyConsultations.length, 10);
  assert.equal(
    body.speciesDistribution.find((item) => item.species === "Gato").count,
    (baseline.speciesDistribution.find((item) => item.species === "Gato")
      ?.count ?? 0) + 1,
  );

  const unauthenticated = await fetch(
    `${baseUrl}/api/clinic-dashboard?month=${month}`,
  );
  assert.equal(unauthenticated.status, 401);

  const invalid = await fetch(
    `${baseUrl}/api/clinic-dashboard?month=2030-13`,
    { headers: { cookie } },
  );
  assert.equal(invalid.status, 400);
});

test("API de notificações protege dados e ações por usuário autenticado", async () => {
  const linkedTutor = database.createTutor({
    name: "Tutor vinculado à notificação",
  });
  const linkedAnimal = database.createAnimal({
    tutorId: linkedTutor.id,
    name: "Animal vinculado à notificação",
    species: "Cão",
  });
  const linkedVeterinarian = await database.createUser({
    name: "Veterinário vinculado à notificação",
    email: "notificacoes.linked.vet@vetcare.com",
    password: "SenhaVetNotificacoes123!",
    roleSlugs: ["veterinario"],
  });
  const linkedAppointment = database.createAppointment({
    animalId: linkedAnimal.id,
    veterinarianId: linkedVeterinarian.id,
    type: "consultation",
    scheduledAt: "2040-01-15T13:00:00.000Z",
    durationMinutes: 30,
  });
  const owner = await database.createUser({
    name: "Proprietário das Notificações",
    email: "notificacoes.owner@vetcare.com",
    password: "SenhaNotificacoes123!",
    roleSlugs: ["recepcionista"],
  });
  const otherUser = await database.createUser({
    name: "Outro Usuário de Notificações",
    email: "notificacoes.other@vetcare.com",
    password: "SenhaOutroUsuario123!",
    roleSlugs: ["veterinario"],
  });
  const noPermissionRoleId = randomUUID();
  const noPermissionRoleSlug = `notifications-reader-${noPermissionRoleId}`;

  database.connection
    .prepare(
      "INSERT INTO roles (id, slug, name, description) VALUES (?, ?, ?, ?)",
    )
    .run(
      noPermissionRoleId,
      noPermissionRoleSlug,
      "Usuário sem acesso às notificações",
      "Papel de teste sem notifications.manage.",
    );

  const userWithoutPermission = await database.createUser({
    name: "Usuário sem Acesso a Notificações",
    email: "notificacoes.denied@vetcare.com",
    password: "SenhaNegadaNotificacoes123!",
    roleSlugs: [noPermissionRoleSlug],
  });
  const ownUnread = insertNotificationFixture(owner.id, {
    title: "Notificação não lida",
    appointmentId: linkedAppointment.id,
  });
  const ownUnreadForBulk = insertNotificationFixture(owner.id, {
    title: "Notificação para leitura em lote",
  });
  const ownRead = insertNotificationFixture(owner.id, {
    title: "Notificação já lida",
    readAt: "2030-01-01T10:00:00.000Z",
  });
  const otherUnread = insertNotificationFixture(otherUser.id, {
    title: "Notificação privada de outro usuário",
  });
  const ownerLogin = await loginRequest(
    owner.email,
    "SenhaNotificacoes123!",
  );
  const ownerCookie = sessionCookie(ownerLogin);
  const otherLogin = await loginRequest(
    otherUser.email,
    "SenhaOutroUsuario123!",
  );
  const otherCookie = sessionCookie(otherLogin);
  const deniedLogin = await loginRequest(
    userWithoutPermission.email,
    "SenhaNegadaNotificacoes123!",
  );
  const deniedCookie = sessionCookie(deniedLogin);

  const unauthenticatedList = await fetch(`${baseUrl}/api/notifications`);
  const unauthenticatedRead = await fetch(
    `${baseUrl}/api/notifications/${ownUnread.id}/read`,
    { method: "PATCH" },
  );
  const unauthenticatedReadAll = await fetch(
    `${baseUrl}/api/notifications/read-all`,
    { method: "POST" },
  );

  assert.equal(unauthenticatedList.status, 401);
  assert.equal(unauthenticatedRead.status, 401);
  assert.equal(unauthenticatedReadAll.status, 401);

  const deniedList = await fetch(`${baseUrl}/api/notifications`, {
    headers: { cookie: deniedCookie },
  });
  const deniedRead = await fetch(
    `${baseUrl}/api/notifications/${ownUnread.id}/read`,
    { method: "PATCH", headers: { cookie: deniedCookie } },
  );
  const deniedReadAll = await fetch(
    `${baseUrl}/api/notifications/read-all`,
    { method: "POST", headers: { cookie: deniedCookie } },
  );

  assert.equal(deniedList.status, 403);
  assert.equal(deniedRead.status, 403);
  assert.equal(deniedReadAll.status, 403);

  const listResponse = await fetch(
    `${baseUrl}/api/notifications?userId=${encodeURIComponent(otherUser.id)}`,
    { headers: { cookie: ownerCookie } },
  );
  const listBody = await listResponse.json();

  assert.equal(listResponse.status, 200);
  assert.equal(listBody.unreadCount, 2);
  assert.deepEqual(
    listBody.notifications.map((notification) => notification.id).sort(),
    [ownUnread.id, ownUnreadForBulk.id, ownRead.id].sort(),
  );
  assert.ok(
    listBody.notifications.every(
      (notification) =>
        notification.userId === undefined &&
        typeof notification.isRead === "boolean" &&
        "readAt" in notification &&
        "appointmentId" in notification,
    ),
  );
  assert.equal(
    listBody.notifications.find((item) => item.id === ownRead.id).isRead,
    true,
  );
  assert.equal(
    listBody.notifications.find((item) => item.id === ownUnread.id).isRead,
    false,
  );
  const listedNotification = listBody.notifications.find(
    (item) => item.id === ownUnread.id,
  );
  assert.equal(listedNotification.eventType, "appointment_created");
  assert.equal(listedNotification.title, "Notificação não lida");
  assert.equal(listedNotification.description, "Descrição de teste.");
  assert.ok(listedNotification.createdAt);
  assert.equal(listedNotification.appointmentId, linkedAppointment.id);

  const markReadResponse = await fetch(
    `${baseUrl}/api/notifications/${ownUnread.id}/read`,
    { method: "PATCH", headers: { cookie: ownerCookie } },
  );
  const markReadBody = await markReadResponse.json();

  assert.equal(markReadResponse.status, 200);
  assert.equal(markReadBody.notification.id, ownUnread.id);
  assert.equal(markReadBody.notification.isRead, true);
  assert.ok(markReadBody.notification.readAt);

  const accessOtherNotification = await fetch(
    `${baseUrl}/api/notifications/${otherUnread.id}/read`,
    { method: "PATCH", headers: { cookie: ownerCookie } },
  );
  assert.equal(accessOtherNotification.status, 404);

  const missingNotification = await fetch(
    `${baseUrl}/api/notifications/${randomUUID()}/read`,
    { method: "PATCH", headers: { cookie: ownerCookie } },
  );
  assert.equal(missingNotification.status, 404);

  const otherListAfterAttempt = await fetch(
    `${baseUrl}/api/notifications`,
    { headers: { cookie: otherCookie } },
  );
  const otherListBody = await otherListAfterAttempt.json();

  assert.equal(otherListAfterAttempt.status, 200);
  assert.equal(otherListBody.unreadCount, 1);
  assert.equal(otherListBody.notifications.length, 1);
  assert.equal(otherListBody.notifications[0].id, otherUnread.id);
  assert.equal(otherListBody.notifications[0].isRead, false);

  const markAllResponse = await fetch(
    `${baseUrl}/api/notifications/read-all`,
    { method: "POST", headers: { cookie: ownerCookie } },
  );
  const markAllBody = await markAllResponse.json();

  assert.equal(markAllResponse.status, 200);
  assert.equal(markAllBody.updatedCount, 1);

  const listAfterMarkAll = await fetch(`${baseUrl}/api/notifications`, {
    headers: { cookie: ownerCookie },
  });
  const listAfterMarkAllBody = await listAfterMarkAll.json();

  assert.equal(listAfterMarkAllBody.unreadCount, 0);
  assert.ok(listAfterMarkAllBody.notifications.every((item) => item.isRead));

  const logoutResponse = await fetch(`${baseUrl}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: ownerCookie },
  });
  assert.equal(logoutResponse.status, 204);

  const reauthenticatedLogin = await loginRequest(
    owner.email,
    "SenhaNotificacoes123!",
  );
  const reauthenticatedCookie = sessionCookie(reauthenticatedLogin);
  const persistedListResponse = await fetch(`${baseUrl}/api/notifications`, {
    headers: { cookie: reauthenticatedCookie },
  });
  const persistedListBody = await persistedListResponse.json();

  assert.equal(persistedListResponse.status, 200);
  assert.equal(persistedListBody.unreadCount, 0);
  assert.ok(persistedListBody.notifications.every((item) => item.isRead));
  assert.equal(
    persistedListBody.notifications.find((item) => item.id === ownUnread.id)
      .readAt,
    markReadBody.notification.readAt,
  );

  const otherListAfterOwnerReadAll = await fetch(
    `${baseUrl}/api/notifications`,
    { headers: { cookie: otherCookie } },
  );
  assert.equal((await otherListAfterOwnerReadAll.json()).unreadCount, 1);
});
