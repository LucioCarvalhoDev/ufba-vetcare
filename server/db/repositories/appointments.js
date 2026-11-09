import { randomUUID } from "node:crypto";
import {
  domainError,
  escapeLike,
  nowIso,
  optionalText,
} from "../helpers.js";
import { withTransaction } from "../transactions.js";

const TYPES = new Set(["consultation", "surgery", "vaccination"]);
const STATUSES = new Set(["scheduled", "completed", "cancelled"]);

function mapAppointmentRow(row) {
  return {
    id: row.id,
    animalId: row.animal_id,
    animalName: row.animal_name,
    animalSpecies: row.animal_species,
    tutorId: row.tutor_id,
    tutorName: row.tutor_name,
    veterinarianId: row.veterinarian_id,
    veterinarianName: row.veterinarian_name,
    type: row.type,
    scheduledAt: row.scheduled_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSchedule(scheduledAt, durationMinutes) {
  const start = new Date(scheduledAt);
  const duration = Number(durationMinutes);

  if (Number.isNaN(start.getTime())) {
    throw domainError("INVALID_SCHEDULE", "Data e horário inválidos.");
  }

  if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
    throw domainError(
      "INVALID_DURATION",
      "A duração deve estar entre 15 e 480 minutos.",
    );
  }

  return {
    scheduledAt: start.toISOString(),
    durationMinutes: duration,
    endsAt: new Date(start.getTime() + duration * 60_000).toISOString(),
  };
}

export function createAppointmentsRepository(connection) {
  const selectAppointmentById = connection.prepare(
    `SELECT ap.*,
            a.name AS animal_name,
            a.species AS animal_species,
            t.id AS tutor_id,
            t.name AS tutor_name,
            u.name AS veterinarian_name
     FROM appointments ap
     INNER JOIN animals a ON a.id = ap.animal_id
     INNER JOIN tutors t ON t.id = a.tutor_id
     INNER JOIN users u ON u.id = ap.veterinarian_id
     WHERE ap.id = ?`,
  );
  const selectAnimal = connection.prepare(
    "SELECT id FROM animals WHERE id = ? AND is_active = 1",
  );
  const selectVeterinarian = connection.prepare(
    `SELECT u.id, u.name, u.email
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.id = ? AND u.is_active = 1 AND r.slug = 'veterinario'`,
  );
  const selectConflict = connection.prepare(
    `SELECT id
     FROM appointments
     WHERE veterinarian_id = ?
       AND status != 'cancelled'
       AND id != ?
       AND scheduled_at < ?
       AND ends_at > ?
     LIMIT 1`,
  );

  function getAppointmentById(id) {
    const row = selectAppointmentById.get(id);
    return row ? mapAppointmentRow(row) : null;
  }

  function assertReferences(animalId, veterinarianId) {
    if (!selectAnimal.get(animalId)) {
      throw domainError("ANIMAL_NOT_FOUND", "Animal não encontrado.");
    }

    if (!selectVeterinarian.get(veterinarianId)) {
      throw domainError(
        "VETERINARIAN_NOT_FOUND",
        "Veterinário não encontrado ou inativo.",
      );
    }
  }

  function assertNoConflict({
    id = "",
    veterinarianId,
    scheduledAt,
    endsAt,
    status,
  }) {
    if (status === "cancelled") {
      return;
    }

    if (
      selectConflict.get(veterinarianId, id, endsAt, scheduledAt)
    ) {
      throw domainError(
        "APPOINTMENT_CONFLICT",
        "Já existe um agendamento para este veterinário nesse horário.",
      );
    }
  }

  return {
    listVeterinarians() {
      return connection
        .prepare(
          `SELECT DISTINCT u.id, u.name, u.email
           FROM users u
           INNER JOIN user_roles ur ON ur.user_id = u.id
           INNER JOIN roles r ON r.id = ur.role_id
           WHERE u.is_active = 1 AND r.slug = 'veterinario'
           ORDER BY u.name COLLATE NOCASE ASC`,
        )
        .all();
    },

    listAppointments({ q = "", type = "", status = "", veterinarianId = "" } = {}) {
      const conditions = [];
      const parameters = [];
      const search = String(q ?? "").trim();

      if (search) {
        const term = `%${escapeLike(search)}%`;
        conditions.push(
          `(a.name LIKE ? ESCAPE '\\' OR t.name LIKE ? ESCAPE '\\')`,
        );
        parameters.push(term, term);
      }

      if (type) {
        conditions.push("ap.type = ?");
        parameters.push(type);
      }

      if (status) {
        conditions.push("ap.status = ?");
        parameters.push(status);
      }

      if (veterinarianId) {
        conditions.push("ap.veterinarian_id = ?");
        parameters.push(veterinarianId);
      }

      const where = conditions.length
        ? `WHERE ${conditions.join(" AND ")}`
        : "";
      const rows = connection
        .prepare(
          `SELECT ap.*,
                  a.name AS animal_name,
                  a.species AS animal_species,
                  t.id AS tutor_id,
                  t.name AS tutor_name,
                  u.name AS veterinarian_name
           FROM appointments ap
           INNER JOIN animals a ON a.id = ap.animal_id
           INNER JOIN tutors t ON t.id = a.tutor_id
           INNER JOIN users u ON u.id = ap.veterinarian_id
           ${where}
           ORDER BY ap.scheduled_at ASC`,
        )
        .all(...parameters);

      return rows.map(mapAppointmentRow);
    },

    getAppointmentById,

    createAppointment({
      animalId,
      veterinarianId,
      type,
      scheduledAt,
      durationMinutes,
      notes = null,
      createdBy = null,
    }) {
      if (!TYPES.has(type)) {
        throw domainError("INVALID_TYPE", "Tipo de agendamento inválido.");
      }

      assertReferences(animalId, veterinarianId);
      const schedule = normalizeSchedule(scheduledAt, durationMinutes);
      const id = randomUUID();
      const timestamp = nowIso();

      withTransaction(connection, () => {
        assertNoConflict({
          veterinarianId,
          scheduledAt: schedule.scheduledAt,
          endsAt: schedule.endsAt,
          status: "scheduled",
        });

        connection
          .prepare(
            `INSERT INTO appointments
               (id, animal_id, veterinarian_id, type, scheduled_at, ends_at,
                duration_minutes, status, notes, created_by, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', ?, ?, ?, ?)`,
          )
          .run(
            id,
            animalId,
            veterinarianId,
            type,
            schedule.scheduledAt,
            schedule.endsAt,
            schedule.durationMinutes,
            optionalText(notes),
            createdBy,
            timestamp,
            timestamp,
          );
      });

      return getAppointmentById(id);
    },

    updateAppointment(
      id,
      {
        animalId,
        veterinarianId,
        type,
        scheduledAt,
        durationMinutes,
        status = "scheduled",
        notes = null,
      },
    ) {
      if (!selectAppointmentById.get(id)) {
        throw domainError("APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
      }

      if (!TYPES.has(type)) {
        throw domainError("INVALID_TYPE", "Tipo de agendamento inválido.");
      }

      if (!STATUSES.has(status)) {
        throw domainError("INVALID_STATUS", "Situação do agendamento inválida.");
      }

      assertReferences(animalId, veterinarianId);
      const schedule = normalizeSchedule(scheduledAt, durationMinutes);

      withTransaction(connection, () => {
        assertNoConflict({
          id,
          veterinarianId,
          scheduledAt: schedule.scheduledAt,
          endsAt: schedule.endsAt,
          status,
        });

        connection
          .prepare(
            `UPDATE appointments
             SET animal_id = ?, veterinarian_id = ?, type = ?, scheduled_at = ?,
                 ends_at = ?, duration_minutes = ?, status = ?, notes = ?, updated_at = ?
             WHERE id = ?`,
          )
          .run(
            animalId,
            veterinarianId,
            type,
            schedule.scheduledAt,
            schedule.endsAt,
            schedule.durationMinutes,
            status,
            optionalText(notes),
            nowIso(),
            id,
          );
      });

      return getAppointmentById(id);
    },

    cancelAppointment(id) {
      const existing = selectAppointmentById.get(id);

      if (!existing) {
        throw domainError("APPOINTMENT_NOT_FOUND", "Agendamento não encontrado.");
      }

      connection
        .prepare(
          "UPDATE appointments SET status = 'cancelled', updated_at = ? WHERE id = ?",
        )
        .run(nowIso(), id);

      return getAppointmentById(id);
    },
  };
}
