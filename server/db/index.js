import { openConnection } from "./connection.js";
import { seedDatabase } from "./seed.js";
import { createUsersRepository } from "./repositories/users.js";
import { createSessionsRepository } from "./repositories/sessions.js";
import { createAuditRepository } from "./repositories/audit.js";
import { createTutorsRepository } from "./repositories/tutors.js";
import { createAnimalsRepository } from "./repositories/animals.js";
import { createAppointmentsRepository } from "./repositories/appointments.js";
import { createAvailabilityRepository } from "./repositories/availability.js";

export async function openDatabase({
  filename = "data/vetcare.db",
  adminEmail = "admin@vetcare.com",
  adminName = "Administrador VetCare",
  adminPassword = "",
  resetAdminPassword = false,
} = {}) {
  const connection = openConnection(filename);
  const adminStatus = await seedDatabase(connection, {
    adminEmail,
    adminName,
    adminPassword,
    resetAdminPassword,
  });
  const database = {
    connection,
    adminStatus,

    close() {
      connection.close();
    },

    ...createUsersRepository(connection),
    ...createSessionsRepository(connection),
    ...createAuditRepository(connection),
    ...createTutorsRepository(connection),
    ...createAnimalsRepository(connection),
    ...createAppointmentsRepository(connection),
    ...createAvailabilityRepository(connection),
  };

  database.deleteExpiredSessions();

  return database;
}
