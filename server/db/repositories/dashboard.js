import { domainError } from "../helpers.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

function parseMonthKey(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ""));

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (month < 1 || month > 12) {
    return null;
  }

  return new Date(year, month - 1, 1);
}

function startOfDay(date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    0,
    0,
    0,
    0,
  );
}

function addDays(date, days) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + days,
    0,
    0,
    0,
    0,
  );
}

function startOfWeek(date) {
  const day = date.getDay();
  return addDays(date, day === 0 ? -6 : 1 - day);
}

export function createDashboardRepository(connection) {
  const selectClinicTotals = connection.prepare(
    `SELECT
       (SELECT COUNT(*) FROM animals WHERE is_active = 1) AS active_patients,
       (SELECT COUNT(*) FROM tutors WHERE is_active = 1) AS active_tutors`,
  );
  const selectClinicConsultations = connection.prepare(
    `SELECT scheduled_at
     FROM appointments
     WHERE type = 'consultation'
       AND status != 'cancelled'
       AND scheduled_at >= ?
       AND scheduled_at < ?`,
  );
  const selectClinicPendingVaccinations = connection.prepare(
    `SELECT COUNT(*) AS total
     FROM appointments
     WHERE type = 'vaccination'
       AND status = 'scheduled'
       AND scheduled_at >= ?`,
  );
  const selectClinicSpecies = connection.prepare(
    `SELECT species, COUNT(*) AS total
     FROM animals
     WHERE is_active = 1
     GROUP BY species COLLATE NOCASE
     ORDER BY total DESC, species COLLATE NOCASE ASC`,
  );
  const selectVeterinarian = connection.prepare(
    `SELECT u.id, u.name, u.email
     FROM users u
     INNER JOIN user_roles ur ON ur.user_id = u.id
     INNER JOIN roles r ON r.id = ur.role_id
     WHERE u.id = ? AND u.is_active = 1 AND r.slug = 'veterinario'`,
  );
  const selectTodayAppointments = connection.prepare(
    `SELECT ap.id, ap.scheduled_at, ap.duration_minutes, ap.status, ap.type,
            a.name AS animal_name, a.species AS animal_species,
            t.name AS tutor_name
     FROM appointments ap
     INNER JOIN animals a ON a.id = ap.animal_id
     INNER JOIN tutors t ON t.id = a.tutor_id
     WHERE ap.veterinarian_id = ?
       AND ap.scheduled_at >= ?
       AND ap.scheduled_at < ?
     ORDER BY ap.scheduled_at ASC`,
  );
  const selectUpcoming = connection.prepare(
    `SELECT ap.id, ap.scheduled_at, ap.duration_minutes, ap.status, ap.type,
            a.name AS animal_name, a.species AS animal_species,
            t.name AS tutor_name
     FROM appointments ap
     INNER JOIN animals a ON a.id = ap.animal_id
     INNER JOIN tutors t ON t.id = a.tutor_id
     WHERE ap.veterinarian_id = ?
       AND ap.status != 'cancelled'
       AND ap.scheduled_at >= ?
       AND ap.scheduled_at < ?
     ORDER BY ap.scheduled_at ASC`,
  );
  const selectRange = connection.prepare(
    `SELECT scheduled_at
     FROM appointments
     WHERE veterinarian_id = ?
       AND status != 'cancelled'
       AND scheduled_at >= ?
       AND scheduled_at < ?`,
  );

  return {
    getClinicDashboard({ month = "", now = new Date() } = {}) {
      const currentMonth = month
        ? parseMonthKey(month)
        : new Date(now.getFullYear(), now.getMonth(), 1);

      if (!currentMonth) {
        throw domainError(
          "INVALID_DASHBOARD_QUERY",
          "Mês do dashboard inválido.",
        );
      }

      const rangeStart = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() - 9,
        1,
      );
      const rangeEnd = new Date(
        currentMonth.getFullYear(),
        currentMonth.getMonth() + 1,
        1,
      );
      const consultationCounts = new Map();

      for (const row of selectClinicConsultations.all(
        rangeStart.toISOString(),
        rangeEnd.toISOString(),
      )) {
        const key = formatDateKey(new Date(row.scheduled_at)).slice(0, 7);
        consultationCounts.set(
          key,
          (consultationCounts.get(key) ?? 0) + 1,
        );
      }

      const monthlyConsultations = Array.from({ length: 10 }, (_, index) => {
        const date = new Date(
          rangeStart.getFullYear(),
          rangeStart.getMonth() + index,
          1,
        );
        const key = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;

        return {
          month: key,
          count: consultationCounts.get(key) ?? 0,
        };
      });
      const totals = selectClinicTotals.get();

      return {
        month: `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}`,
        metrics: {
          activePatients: Number(totals.active_patients),
          consultationsThisMonth:
            consultationCounts.get(
              `${currentMonth.getFullYear()}-${pad(currentMonth.getMonth() + 1)}`,
            ) ?? 0,
          activeTutors: Number(totals.active_tutors),
          pendingVaccinations: Number(
            selectClinicPendingVaccinations.get(now.toISOString()).total,
          ),
        },
        monthlyConsultations,
        speciesDistribution: selectClinicSpecies.all().map((row) => ({
          species: row.species,
          count: Number(row.total),
        })),
      };
    },

    getVeterinarianDashboard(
      userId,
      { date = "", month = "" } = {},
    ) {
      const veterinarian = selectVeterinarian.get(userId);

      if (!veterinarian) {
        throw domainError(
          "VETERINARIAN_ONLY",
          "A tela Minha Agenda é exclusiva para veterinários.",
        );
      }

      const today = date ? parseDateKey(date) : startOfDay(new Date());

      if (!today) {
        throw domainError(
          "INVALID_DASHBOARD_QUERY",
          "Data do dashboard inválida.",
        );
      }

      const monthStart = month
        ? parseMonthKey(month)
        : new Date(today.getFullYear(), today.getMonth(), 1);

      if (!monthStart) {
        throw domainError(
          "INVALID_DASHBOARD_QUERY",
          "Mês do dashboard inválido.",
        );
      }

      const todayStart = startOfDay(today);
      const todayEnd = addDays(todayStart, 1);
      const monthEnd = new Date(
        monthStart.getFullYear(),
        monthStart.getMonth() + 1,
        1,
      );
      const weekStart = startOfWeek(todayStart);
      const weekEnd = addDays(weekStart, 7);

      const mapAppointment = (row) => ({
        id: row.id,
        scheduledAt: row.scheduled_at,
        durationMinutes: row.duration_minutes,
        status: row.status,
        type: row.type,
        animalName: row.animal_name,
        animalSpecies: row.animal_species,
        tutorName: row.tutor_name,
      });
      const rows = selectTodayAppointments.all(
        veterinarian.id,
        todayStart.toISOString(),
        todayEnd.toISOString(),
      );
      const appointments = rows.map(mapAppointment);
      const upcoming = selectUpcoming
        .all(
          veterinarian.id,
          todayStart.toISOString(),
          addDays(todayStart, 2).toISOString(),
        )
        .map((row) => ({
          ...mapAppointment(row),
          date: formatDateKey(new Date(row.scheduled_at)),
        }));
      const metrics = {
        total: appointments.length,
        completed: appointments.filter((item) => item.status === "completed")
          .length,
        pending: appointments.filter((item) => item.status === "scheduled")
          .length,
        cancelled: appointments.filter((item) => item.status === "cancelled")
          .length,
      };

      const monthCounts = new Map();

      for (const row of selectRange.all(
        veterinarian.id,
        monthStart.toISOString(),
        monthEnd.toISOString(),
      )) {
        const key = formatDateKey(new Date(row.scheduled_at));
        monthCounts.set(key, (monthCounts.get(key) ?? 0) + 1);
      }

      const weekCounts = new Map();

      for (const row of selectRange.all(
        veterinarian.id,
        weekStart.toISOString(),
        weekEnd.toISOString(),
      )) {
        const key = formatDateKey(new Date(row.scheduled_at));
        weekCounts.set(key, (weekCounts.get(key) ?? 0) + 1);
      }

      const weekDays = Array.from({ length: 7 }, (_, index) => {
        const day = addDays(weekStart, index);
        const key = formatDateKey(day);
        return {
          date: key,
          weekday: day.getDay() === 0 ? 7 : day.getDay(),
          count: weekCounts.get(key) ?? 0,
        };
      });

      return {
        date: formatDateKey(todayStart),
        veterinarian: {
          id: veterinarian.id,
          name: veterinarian.name,
        },
        metrics,
        appointments,
        upcoming,
        month: {
          key: `${monthStart.getFullYear()}-${pad(monthStart.getMonth() + 1)}`,
          days: [...monthCounts.entries()]
            .map(([day, count]) => ({ date: day, count }))
            .sort((a, b) => a.date.localeCompare(b.date)),
        },
        week: {
          from: formatDateKey(weekStart),
          days: weekDays,
          total: weekDays.reduce((sum, day) => sum + day.count, 0),
        },
      };
    },
  };
}
