import { useEffect, useState } from "react";
import { fetchVeterinarianDashboard } from "../lib/api";
import { formatTime } from "../lib/format";
import { Link } from "../lib/navigation";
import type { AuthUser } from "../types/auth";
import type { AppointmentStatus } from "../types/appointments";
import type { VeterinarianDashboard } from "../types/dashboard";
import "./AppointmentsPage.css";
import "./VeterinarianDashboardPage.css";

type VeterinarianDashboardPageProps = {
  user: AuthUser;
};

const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split("-").map(Number);
  return monthKey(new Date(year, month - 1 + offset, 1));
}

function monthLabel(value: string) {
  const [year, month] = value.split("-").map(Number);
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function longDateLabel(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(year, month - 1, day));
}

function calendarCells(value: string) {
  const [year, month] = value.split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells: (number | null)[] = Array.from({ length: first.getDay() }, () => null);

  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }

  while (cells.length % 7 !== 0 || cells.length < 42) {
    cells.push(null);
  }

  return cells;
}

function isVeterinarian(user: AuthUser) {
  return user.roles.some((role) => role.slug === "veterinario");
}

export default function VeterinarianDashboardPage({
  user,
}: VeterinarianDashboardPageProps) {
  const [dashboard, setDashboard] = useState<VeterinarianDashboard | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isVeterinarian(user)) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchVeterinarianDashboard({ month: selectedMonth })
      .then((data) => {
        if (isActive) {
          setDashboard(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar sua agenda.",
          );
        }
      })
      .finally(() => {
        if (isActive) {
          setIsLoading(false);
        }
      });

    return () => {
      isActive = false;
    };
  }, [selectedMonth, user]);

  if (!isVeterinarian(user)) {
    return (
      <div className="doctor-dashboard">
        <div className="users-error" role="alert">
          A tela Minha Agenda é exclusiva para veterinários.
        </div>
      </div>
    );
  }

  if (isLoading && !dashboard) {
    return (
      <div className="doctor-dashboard">
        <div className="users-state" role="status">
          <strong>Carregando sua agenda...</strong>
        </div>
      </div>
    );
  }

  if (error && !dashboard) {
    return (
      <div className="doctor-dashboard">
        <div className="users-error" role="alert">
          {error}
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return null;
  }

  const activeMonth = dashboard.month.key;
  const counts = new Map(
    dashboard.month.days.map((day) => [day.date, day.count]),
  );
  const cells = calendarCells(activeMonth);
  const maxWeekCount = Math.max(
    1,
    ...dashboard.week.days.map((day) => day.count),
  );
  const metrics = [
    { key: "total", label: "Consultas", value: dashboard.metrics.total },
    {
      key: "completed",
      label: "Concluídas",
      value: dashboard.metrics.completed,
    },
    { key: "pending", label: "Pendentes", value: dashboard.metrics.pending },
    {
      key: "cancelled",
      label: "Canceladas",
      value: dashboard.metrics.cancelled,
    },
  ];

  return (
    <div className="doctor-dashboard" aria-busy={isLoading}>
      <div className="doctor-dashboard__breadcrumb">
        <Link to="/agenda">Agenda</Link>
        <span>/</span>
        <strong>Minha Agenda</strong>
      </div>

      {error ? (
        <div className="users-error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="doctor-metrics" aria-label="Métricas do dia">
        {metrics.map((metric) => (
          <article
            className={`doctor-metric doctor-metric--${metric.key}`}
            key={metric.key}
          >
            <strong>{metric.value}</strong>
            <span>{metric.label}</span>
          </article>
        ))}
      </section>

      <div className="doctor-dashboard__grid">
        <section className="doctor-card doctor-today">
          <header className="doctor-card__header">
            <div>
              <h2>Consultas de hoje</h2>
              <p>{longDateLabel(dashboard.date)}</p>
            </div>
            <span className="doctor-card__count">
              {dashboard.appointments.length}
            </span>
          </header>

          {dashboard.appointments.length === 0 ? (
            <div className="users-state">
              <strong>Nenhuma consulta para hoje.</strong>
              <p>Seus próximos atendimentos aparecerão aqui.</p>
            </div>
          ) : (
            <div className="doctor-table-wrap">
              <table className="doctor-table">
                <thead>
                  <tr>
                    <th scope="col">Horário</th>
                    <th scope="col">Pet</th>
                    <th scope="col">Tutor</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dashboard.appointments.map((appointment) => (
                    <tr key={appointment.id}>
                      <td>
                        <strong className="doctor-table__time">
                          {formatTime(appointment.scheduledAt)}
                        </strong>
                      </td>
                      <td>
                        <strong>{appointment.animalName}</strong>
                        <span className="doctor-table__detail">
                          {appointment.animalSpecies}
                        </span>
                      </td>
                      <td>{appointment.tutorName}</td>
                      <td>
                        <span
                          className={`status-badge status-badge--${appointment.status}`}
                        >
                          <span
                            className="status-badge__dot"
                            aria-hidden="true"
                          />
                          {STATUS_LABELS[appointment.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="doctor-dashboard__aside">
          <section className="doctor-card doctor-calendar">
            <header className="doctor-card__header">
              <h2>{monthLabel(activeMonth)}</h2>
              <div className="doctor-calendar__nav">
                <button
                  type="button"
                  aria-label="Mês anterior"
                  onClick={() =>
                    setSelectedMonth((current) => shiftMonth(current, -1))
                  }
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Próximo mês"
                  onClick={() =>
                    setSelectedMonth((current) => shiftMonth(current, 1))
                  }
                >
                  ›
                </button>
              </div>
            </header>

            <div className="doctor-calendar__grid">
              {WEEKDAY_SHORT.map((weekday) => (
                <span className="doctor-calendar__weekday" key={weekday}>
                  {weekday}
                </span>
              ))}
              {cells.map((day, index) => {
                if (!day) {
                  return (
                    <span
                      className="doctor-calendar__day doctor-calendar__day--empty"
                      key={`empty-${index}`}
                    />
                  );
                }

                const key = `${activeMonth}-${pad(day)}`;
                const count = counts.get(key) ?? 0;

                return (
                  <span
                    className={`doctor-calendar__day${key === dashboard.date ? " is-today" : ""}${count > 0 ? " has-appointments" : ""}`}
                    key={key}
                    aria-label={`${day} de ${monthLabel(activeMonth)}${count > 0 ? `, ${count} consulta(s)` : ""}`}
                  >
                    <span>{day}</span>
                    {count > 0 ? (
                      <span className="doctor-calendar__dots" aria-hidden="true">
                        {Array.from(
                          { length: Math.min(count, 3) },
                          (_, dotIndex) => (
                            <i key={dotIndex} />
                          ),
                        )}
                      </span>
                    ) : null}
                  </span>
                );
              })}
            </div>

            <footer className="doctor-calendar__legend">
              <span>
                <i className="doctor-calendar__legend-dot" />
                Dias com consultas
              </span>
              <span>
                <i className="doctor-calendar__legend-today" />
                Hoje
              </span>
            </footer>
          </section>

          <section className="doctor-card doctor-week">
            <header className="doctor-card__header">
              <div>
                <h2>Resumo da semana</h2>
                <p>Consultas por dia</p>
              </div>
              <span className="doctor-week__total">
                {dashboard.week.total} consultas
              </span>
            </header>

            <div className="doctor-week__chart">
              {dashboard.week.days.map((day) => {
                const isToday = day.date === dashboard.date;
                const height =
                  day.count === 0
                    ? 4
                    : Math.max(10, Math.round((day.count / maxWeekCount) * 100));

                return (
                  <div
                    className={`doctor-week__item${isToday ? " is-today" : ""}`}
                    key={day.date}
                  >
                    <span className="doctor-week__value">{day.count}</span>
                    <span
                      className="doctor-week__bar"
                      style={{ height: `${height}%` }}
                    />
                    <span className="doctor-week__label">
                      {WEEKDAY_SHORT[day.weekday === 7 ? 0 : day.weekday]}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
