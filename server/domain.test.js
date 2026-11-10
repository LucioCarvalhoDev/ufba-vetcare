import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { after, before } from "node:test";
import { openDatabase } from "./database.js";

let tempDir;
let database;

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "vetcare-domain-test-"));
  database = await openDatabase({
    filename: join(tempDir, "domain.db"),
    adminEmail: "admin@vetcare.com",
    adminName: "Administrador de Teste",
    adminPassword: "SenhaAdmin123!",
  });
});

after(() => {
  database.close();
  rmSync(tempDir, { recursive: true, force: true });
});

test("schema cria tutores, animais e vínculo com o tutor", () => {
  const tables = database.connection
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table' AND name IN ('tutors', 'animals')
       ORDER BY name`,
    )
    .all()
    .map((row) => row.name);

  assert.deepEqual(tables, ["animals", "tutors"]);

  const foreignKeys = database.connection
    .prepare("PRAGMA foreign_key_list(animals)")
    .all();

  assert.ok(
    foreignKeys.some(
      (foreignKey) =>
        foreignKey.table === "tutors" &&
        foreignKey.from === "tutor_id" &&
        foreignKey.on_delete === "RESTRICT",
    ),
  );
});

test("cadastra, consulta, filtra e atualiza tutores", () => {
  const tutor = database.createTutor({
    name: "Mariana Souza",
    cpf: "123.456.789-00",
    email: "mariana@example.com",
    phone: "(71) 99999-0000",
    address: "Salvador, BA",
    notes: "Prefere contato por WhatsApp.",
  });

  assert.ok(tutor.id);
  assert.equal(tutor.name, "Mariana Souza");
  assert.equal(tutor.cpf, "123.456.789-00");
  assert.equal(tutor.animalCount, 0);
  assert.equal(tutor.isActive, true);

  assert.equal(database.getTutorById(tutor.id)?.email, "mariana@example.com");
  assert.equal(database.listTutors({ q: "mariana" }).length, 1);
  assert.equal(database.listTutors({ q: "123.456" }).length, 1);
  assert.equal(database.listTutors({ q: "99999" }).length, 1);

  assert.throws(
    () =>
      database.createTutor({
        name: "Outro Tutor",
        cpf: "123.456.789-00",
      }),
    (error) => error.code === "CPF_IN_USE",
  );

  const updated = database.updateTutor(tutor.id, {
    phone: "(71) 98888-1111",
    notes: "",
    isActive: false,
  });

  assert.equal(updated.phone, "(71) 98888-1111");
  assert.equal(updated.notes, null);
  assert.equal(updated.isActive, false);
  assert.equal(database.listTutors({ isActive: false }).length, 1);

  const temporary = database.createTutor({
    name: "Tutor Temporário",
    cpf: "987.654.321-00",
  });

  assert.equal(database.deleteTutor(temporary.id), true);
  assert.equal(database.getTutorById(temporary.id), null);

  assert.throws(
    () => database.deleteTutor("tutor-inexistente"),
    (error) => error.code === "TUTOR_NOT_FOUND",
  );
});

test("cadastra animais vinculados, atualiza e respeita integridade", () => {
  const tutor = database.listTutors({ q: "Mariana" })[0];
  assert.ok(tutor);

  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Thor",
    species: "Cão",
    breed: "Golden Retriever",
    sex: "male",
    birthDate: "2022-05-10",
    notes: "Alergia a frango.",
  });

  assert.ok(animal.id);
  assert.equal(animal.tutorId, tutor.id);
  assert.equal(animal.tutorName, "Mariana Souza");
  assert.equal(animal.sex, "male");
  assert.equal(animal.birthDate, "2022-05-10");

  assert.equal(database.getTutorById(tutor.id)?.animalCount, 1);
  assert.equal(database.listAnimals({ q: "thor" }).length, 1);
  assert.equal(database.listAnimals({ q: "retriever" }).length, 1);
  assert.equal(database.listAnimals({ tutorId: tutor.id }).length, 1);
  assert.equal(database.listAnimals({ species: "cão" }).length, 1);

  assert.throws(
    () =>
      database.createAnimal({
        tutorId: "tutor-inexistente",
        name: "Mia",
        species: "Gato",
      }),
    (error) => error.code === "TUTOR_NOT_FOUND",
  );

  assert.throws(
    () =>
      database.createAnimal({
        tutorId: tutor.id,
        name: "Mia",
        species: "Gato",
        sex: "desconhecido",
      }),
    (error) => error.code === "INVALID_SEX",
  );

  assert.throws(
    () =>
      database.createAnimal({
        tutorId: tutor.id,
        name: "Mia",
        species: "Gato",
        birthDate: "31/12/2020",
      }),
    (error) => error.code === "INVALID_BIRTH_DATE",
  );

  const updated = database.updateAnimal(animal.id, {
    name: "Thor II",
    breed: "SRD",
    sex: "female",
    isActive: false,
  });

  assert.equal(updated.name, "Thor II");
  assert.equal(updated.breed, "SRD");
  assert.equal(updated.sex, "female");
  assert.equal(updated.isActive, false);
  assert.equal(database.listAnimals({ isActive: false }).length, 1);

  assert.throws(
    () => database.deleteTutor(tutor.id),
    (error) => error.code === "TUTOR_HAS_ANIMALS",
  );

  assert.equal(database.deleteAnimal(animal.id), true);
  assert.equal(database.getAnimalById(animal.id), null);
  assert.equal(database.deleteTutor(tutor.id), true);
  assert.equal(database.getTutorById(tutor.id), null);

  assert.throws(
    () => database.deleteAnimal(animal.id),
    (error) => error.code === "ANIMAL_NOT_FOUND",
  );
});

test("dashboard da clínica resume indicadores, consultas e espécies", async () => {
  const now = new Date();
  const monthDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const month = `${monthDate.getFullYear()}-${String(
    monthDate.getMonth() + 1,
  ).padStart(2, "0")}`;
  const baseline = database.getClinicDashboard({ month, now });
  const tutor = database.createTutor({ name: "Tutor do Dashboard" });
  const inactiveTutor = database.createTutor({
    name: "Tutor Inativo do Dashboard",
    isActive: false,
  });
  const animal = database.createAnimal({
    tutorId: tutor.id,
    name: "Animal do Dashboard",
    species: "Cão",
  });
  database.createAnimal({
    tutorId: inactiveTutor.id,
    name: "Animal Inativo do Dashboard",
    species: "Gato",
    isActive: false,
  });
  const veterinarian = await database.createUser({
    name: "Veterinário do Dashboard",
    email: "dashboard.vet@vetcare.com",
    password: "SenhaVet123!",
    roleSlugs: ["veterinario"],
  });
  const createAppointment = (type, day) =>
    database.createAppointment({
      animalId: animal.id,
      veterinarianId: veterinarian.id,
      type,
      scheduledAt: new Date(
        monthDate.getFullYear(),
        monthDate.getMonth(),
        day,
        9,
      ).toISOString(),
      durationMinutes: 30,
    });

  createAppointment("consultation", 2);
  database.cancelAppointment(createAppointment("consultation", 3).id);
  createAppointment("vaccination", 4);
  database.cancelAppointment(createAppointment("vaccination", 5).id);
  database.createAppointment({
    animalId: animal.id,
    veterinarianId: veterinarian.id,
    type: "vaccination",
    scheduledAt: new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 30,
  });

  const dashboard = database.getClinicDashboard({ month, now });

  assert.equal(
    dashboard.metrics.activePatients,
    baseline.metrics.activePatients + 1,
  );
  assert.equal(
    dashboard.metrics.activeTutors,
    baseline.metrics.activeTutors + 1,
  );
  assert.equal(
    dashboard.metrics.consultationsThisMonth,
    baseline.metrics.consultationsThisMonth + 1,
  );
  assert.equal(
    dashboard.metrics.pendingVaccinations,
    baseline.metrics.pendingVaccinations + 1,
  );
  assert.equal(dashboard.monthlyConsultations.length, 10);
  assert.equal(
    dashboard.monthlyConsultations.find((item) => item.month === month).count,
    baseline.monthlyConsultations.find((item) => item.month === month).count +
      1,
  );
  assert.equal(
    dashboard.speciesDistribution.find((item) => item.species === "Cão").count,
    (baseline.speciesDistribution.find((item) => item.species === "Cão")
      ?.count ?? 0) + 1,
  );
  assert.throws(
    () => database.getClinicDashboard({ month: "2030-13", now }),
    (error) => error.code === "INVALID_DASHBOARD_QUERY",
  );
});

test("migrations são versionadas e idempotentes", async () => {
  const filename = join(tempDir, "migrations.db");
  const options = {
    filename,
    adminEmail: "admin@vetcare.com",
    adminName: "Administrador de Teste",
    adminPassword: "SenhaAdmin123!",
  };
  const first = await openDatabase(options);
  const firstVersion = first.connection
    .prepare("PRAGMA user_version")
    .get().user_version;

  assert.ok(firstVersion >= 2);
  first.close();

  const second = await openDatabase(options);
  const secondVersion = second.connection
    .prepare("PRAGMA user_version")
    .get().user_version;

  assert.equal(secondVersion, firstVersion);
  second.close();
});
