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

  const cancelResponse = await fetch(
    `${baseUrl}/api/appointments/${appointmentId}/cancel`,
    { method: "POST", headers: { cookie: adminCookie } },
  );
  const cancelBody = await cancelResponse.json();

  assert.equal(cancelResponse.status, 200);
  assert.equal(cancelBody.appointment.status, "cancelled");

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

  const vaccinationList = await fetch(
    `${baseUrl}/api/appointments?type=vaccination`,
    { headers: { cookie: adminCookie } },
  );
  assert.equal((await vaccinationList.json()).total, 1);

  const anonymous = await fetch(`${baseUrl}/api/appointments`);
  assert.equal(anonymous.status, 401);

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
