import { randomUUID } from "node:crypto";
import { domainError, nowIso } from "../helpers.js";
import { withTransaction } from "../transactions.js";

const MAX_SLOTS = 7 * 48;

function normalizeSlots(slots) {
  if (!Array.isArray(slots) || slots.length > MAX_SLOTS) {
    throw domainError(
      "INVALID_AVAILABILITY",
      "A disponibilidade deve conter no máximo 336 horários.",
    );
  }

  const unique = new Map();

  for (const slot of slots) {
    const weekday = Number(slot?.weekday);
    const startMinutes = Number(slot?.startMinutes);

    if (
      !Number.isInteger(weekday) ||
      weekday < 1 ||
      weekday > 7 ||
      !Number.isInteger(startMinutes) ||
      startMinutes < 0 ||
      startMinutes > 1410 ||
      startMinutes % 30 !== 0
    ) {
      throw domainError(
        "INVALID_AVAILABILITY",
        "Horário de disponibilidade inválido.",
      );
    }

    unique.set(`${weekday}:${startMinutes}`, { weekday, startMinutes });
  }

  return [...unique.values()].sort(
    (a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes,
  );
}

export function createAvailabilityRepository(connection) {
  const selectVeterinarian = connection.prepare(
    `SELECT u.id, u.name, u.email
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.id = ? AND u.is_active = 1 AND r.slug = 'veterinario'`,
  );
  const selectSlots = connection.prepare(
    `SELECT weekday, start_minutes
     FROM veterinarian_availability
     WHERE veterinarian_id = ?
     ORDER BY weekday ASC, start_minutes ASC`,
  );
  const deleteSlots = connection.prepare(
    "DELETE FROM veterinarian_availability WHERE veterinarian_id = ?",
  );
  const insertSlot = connection.prepare(
    `INSERT INTO veterinarian_availability
       (id, veterinarian_id, weekday, start_minutes, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  );

  function requireVeterinarian(id) {
    const veterinarian = selectVeterinarian.get(id);

    if (!veterinarian) {
      throw domainError(
        "VETERINARIAN_NOT_FOUND",
        "Veterinário não encontrado ou inativo.",
      );
    }

    return veterinarian;
  }

  function readAvailability(id) {
    const veterinarian = requireVeterinarian(id);
    const slots = selectSlots
      .all(id)
      .map((slot) => ({
        weekday: slot.weekday,
        startMinutes: slot.start_minutes,
      }));

    return { veterinarian, slots };
  }

  return {
    getVeterinarianAvailability(id) {
      return readAvailability(id);
    },

    setVeterinarianAvailability(id, slots) {
      requireVeterinarian(id);
      const normalized = normalizeSlots(slots);
      const timestamp = nowIso();

      withTransaction(connection, () => {
        deleteSlots.run(id);

        for (const slot of normalized) {
          insertSlot.run(
            randomUUID(),
            id,
            slot.weekday,
            slot.startMinutes,
            timestamp,
          );
        }
      });

      return readAvailability(id);
    },
  };
}
