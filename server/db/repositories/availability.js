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

function parseDateKey(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function formatDateKey(date) {
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createAvailabilityRepository(connection) {
  const selectActiveVeterinarians = connection.prepare(
    `SELECT DISTINCT u.id, u.name, u.email
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.is_active = 1 AND r.slug = 'veterinario'
     ORDER BY u.name COLLATE NOCASE ASC`,
  );
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

    listAvailableVeterinarians({
      weekday,
      startMinutes,
      durationMinutes,
      date = "",
    }) {
      const day = Number(weekday);
      const start = Number(startMinutes);
      const duration = Number(durationMinutes);

      if (
        !Number.isInteger(day) ||
        day < 1 ||
        day > 7 ||
        !Number.isInteger(start) ||
        start < 0 ||
        start > 1439 ||
        !Number.isInteger(duration) ||
        duration < 15 ||
        duration > 480
      ) {
        throw domainError(
          "INVALID_AVAILABILITY_QUERY",
          "Filtro de disponibilidade inválido.",
        );
      }

      if (start + duration > 1440) {
        return [];
      }

      const required = [];
      const firstSlot = Math.floor(start / 30) * 30;

      for (let minutes = firstSlot; minutes < start + duration; minutes += 30) {
        required.push(minutes);
      }

      const slotsByVeterinarian = new Map();
      const rows = connection
        .prepare(
          `SELECT veterinarian_id, start_minutes
           FROM veterinarian_availability
           WHERE weekday = ?`,
        )
        .all(day);

      for (const row of rows) {
        if (!slotsByVeterinarian.has(row.veterinarian_id)) {
          slotsByVeterinarian.set(row.veterinarian_id, new Set());
        }
        slotsByVeterinarian
          .get(row.veterinarian_id)
          .add(row.start_minutes);
      }

      const available = selectActiveVeterinarians
        .all()
        .filter((veterinarian) =>
          required.every((minutes) =>
            slotsByVeterinarian.get(veterinarian.id)?.has(minutes),
          ),
        );

      if (!date) {
        return available;
      }

      const dateValue = parseDateKey(date);

      if (!dateValue) {
        throw domainError(
          "INVALID_AVAILABILITY_QUERY",
          "Data de disponibilidade inválida.",
        );
      }

      const localStart = new Date(
        dateValue.getFullYear(),
        dateValue.getMonth(),
        dateValue.getDate(),
        0,
        start,
        0,
        0,
      );
      const localEnd = new Date(localStart.getTime() + duration * 60_000);
      const conflicts = new Set(
        connection
          .prepare(
            `SELECT DISTINCT veterinarian_id
             FROM appointments
             WHERE status != 'cancelled'
               AND scheduled_at < ?
               AND ends_at > ?`,
          )
          .all(localEnd.toISOString(), localStart.toISOString())
          .map((row) => row.veterinarian_id),
      );

      return available.filter((veterinarian) => !conflicts.has(veterinarian.id));
    },

    getSchedule(from) {
      const startDate = parseDateKey(from);

      if (!startDate) {
        throw domainError(
          "INVALID_SCHEDULE_RANGE",
          "Data inicial da agenda inválida.",
        );
      }

      const rangeStart = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate(),
        0,
        0,
        0,
        0,
      );
      const rangeEnd = new Date(
        startDate.getFullYear(),
        startDate.getMonth(),
        startDate.getDate() + 7,
        0,
        0,
        0,
        0,
      );
      const activeVeterinarians = selectActiveVeterinarians.all();
      const activeIds = new Set(
        activeVeterinarians.map((veterinarian) => veterinarian.id),
      );
      const working = new Map();

      for (const row of connection
        .prepare(
          `SELECT veterinarian_id, weekday, start_minutes
           FROM veterinarian_availability`,
        )
        .all()) {
        if (!activeIds.has(row.veterinarian_id)) {
          continue;
        }

        const key = `${row.weekday}:${row.start_minutes}`;

        if (!working.has(key)) {
          working.set(key, new Set());
        }

        working.get(key).add(row.veterinarian_id);
      }

      const booked = new Map();
      const appointments = connection
        .prepare(
          `SELECT veterinarian_id, scheduled_at, duration_minutes
           FROM appointments
           WHERE status != 'cancelled'
             AND scheduled_at >= ?
             AND scheduled_at < ?`,
        )
        .all(rangeStart.toISOString(), rangeEnd.toISOString());

      for (const appointment of appointments) {
        const appointmentStart = new Date(appointment.scheduled_at);
        const appointmentEnd = new Date(
          appointmentStart.getTime() +
            Number(appointment.duration_minutes) * 60_000,
        );
        const cursor = new Date(appointmentStart);
        cursor.setSeconds(0, 0);
        cursor.setMinutes(Math.floor(cursor.getMinutes() / 30) * 30);

        while (cursor < appointmentEnd) {
          if (cursor >= rangeStart && cursor < rangeEnd) {
            const key = `${formatDateKey(cursor)}:${
              cursor.getHours() * 60 + cursor.getMinutes()
            }`;

            if (!booked.has(key)) {
              booked.set(key, new Set());
            }

            booked.get(key).add(appointment.veterinarian_id);
          }

          cursor.setTime(cursor.getTime() + 30 * 60_000);
        }
      }

      const days = [];

      for (let index = 0; index < 7; index += 1) {
        const date = new Date(
          startDate.getFullYear(),
          startDate.getMonth(),
          startDate.getDate() + index,
        );
        const weekday = date.getDay() === 0 ? 7 : date.getDay();
        const dateKey = formatDateKey(date);
        const slots = [];

        for (let slot = 0; slot < 48; slot += 1) {
          const minutes = slot * 30;
          const workingSet = working.get(`${weekday}:${minutes}`);

          if (!workingSet || workingSet.size === 0) {
            slots.push("closed");
            continue;
          }

          const bookedSet = booked.get(`${dateKey}:${minutes}`) ?? new Set();
          const allBusy = [...workingSet].every((id) => bookedSet.has(id));
          slots.push(allBusy ? "busy" : "free");
        }

        days.push({ date: dateKey, weekday, slots });
      }

      return { from: formatDateKey(startDate), days };
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
