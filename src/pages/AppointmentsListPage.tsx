import { useEffect, useState } from "react";
import { PencilIcon, SearchIcon } from "../components/icons";
import {
  cancelAppointment,
  fetchAppointments,
  fetchVeterinarians,
} from "../lib/api";
import {
  formatDate,
  formatTime,
  getInitials,
} from "../lib/format";
import { Link } from "../lib/navigation";
import { useFlashMessage } from "../lib/useFlashMessage";
import type { AuthUser } from "../types/auth";
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Veterinarian,
} from "../types/appointments";
import "./UsersPage.css";
import "./AppointmentsPage.css";

type AppointmentsListPageProps = {
  user: AuthUser;
};

const TYPE_LABELS: Record<AppointmentType, string> = {
  consultation: "Consulta",
  surgery: "Operação",
  vaccination: "Vacinação",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Agendada",
  completed: "Concluída",
  cancelled: "Cancelada",
};

export default function AppointmentsListPage({
  user,
}: AppointmentsListPageProps) {
  const canRead = user.permissions.includes("appointments.read");
  const canWrite = user.permissions.includes("appointments.write");

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [type, setType] = useState<AppointmentType | "">("");
  const [status, setStatus] = useState<AppointmentStatus | "">("");
  const [veterinarianId, setVeterinarianId] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [veterinariansError, setVeterinariansError] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [flash, setFlash] = useFlashMessage();

  const hasFilters =
    search.trim().length > 0 ||
    type.length > 0 ||
    status.length > 0 ||
    veterinarianId.length > 0;
  const countLabel = isLoading
    ? "Carregando..."
    : `${appointments.length} ${appointments.length === 1 ? "agendamento" : "agendamentos"}`;

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!canRead) {
      return;
    }

    let isActive = true;
    setVeterinariansError(null);

    fetchVeterinarians()
      .then((data) => {
        if (isActive) {
          setVeterinarians(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setVeterinarians([]);
          setVeterinariansError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar os veterinários.",
          );
        }
      });

    return () => {
      isActive = false;
    };
  }, [canRead]);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchAppointments({
      q: debouncedSearch,
      type,
      status,
      veterinarianId,
    })
      .then((data) => {
        if (isActive) {
          setAppointments(data);
        }
      })
      .catch((loadError) => {
        if (isActive) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Não foi possível carregar a agenda.",
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
  }, [canRead, debouncedSearch, type, status, veterinarianId, reloadToken]);

  function clearFilters() {
    setSearch("");
    setType("");
    setStatus("");
    setVeterinarianId("");
  }

  async function handleCancel(appointment: Appointment) {
    if (
      !window.confirm(
        `Cancelar o agendamento de ${appointment.animalName} em ${formatDate(appointment.scheduledAt)} às ${formatTime(appointment.scheduledAt)}?`,
      )
    ) {
      return;
    }

    setCancellingId(appointment.id);
    setActionError(null);

    try {
      await cancelAppointment(appointment.id);
      setFlash("Agendamento cancelado com sucesso.");
      setReloadToken((current) => current + 1);
    } catch (cancelError) {
      setActionError(
        cancelError instanceof Error
          ? cancelError.message
          : "Não foi possível cancelar o agendamento.",
      );
    } finally {
      setCancellingId(null);
    }
  }

  if (!canRead) {
    return (
      <div className="users-page">
        <div className="users-error" role="alert">
          Você não tem permissão para consultar a agenda.
        </div>
      </div>
    );
  }

  return (
    <div className="users-page">
      <header className="users-page__header">
        <div>
          <p className="users-page__eyebrow">Atendimento</p>
          <p className="users-page__description">
            Consulte e organize consultas, operações e vacinações.
          </p>
        </div>
      </header>

      {flash ? (
        <div className="users-flash" role="status">
          <span>{flash}</span>
          <button
            className="users-flash__close"
            type="button"
            aria-label="Fechar mensagem"
            onClick={() => setFlash(null)}
          >
            ×
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="users-error" role="alert">
          {actionError}
          <div>
            <button
              className="users-error__retry"
              type="button"
              onClick={() => setActionError(null)}
            >
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      <section
        className="users-filters appointments-filters"
        aria-label="Filtros da agenda"
      >
        <label className="filter-field filter-field--search">
          <span className="filter-field__label">Buscar</span>
          <span className="filter-search">
            <SearchIcon />
            <input
              className="filter-input"
              type="search"
              placeholder="Animal ou tutor"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </span>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Tipo</span>
          <select
            className="filter-select"
            value={type}
            onChange={(event) =>
              setType(event.target.value as AppointmentType | "")
            }
          >
            <option value="">Todos</option>
            <option value="consultation">Consulta</option>
            <option value="surgery">Operação</option>
            <option value="vaccination">Vacinação</option>
          </select>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Situação</span>
          <select
            className="filter-select"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as AppointmentStatus | "")
            }
          >
            <option value="">Todas</option>
            <option value="scheduled">Agendada</option>
            <option value="completed">Concluída</option>
            <option value="cancelled">Cancelada</option>
          </select>
        </label>

        <label className="filter-field">
          <span className="filter-field__label">Profissional</span>
          <select
            className="filter-select"
            value={veterinarianId}
            onChange={(event) => setVeterinarianId(event.target.value)}
          >
            <option value="">Todos</option>
            {veterinarians.map((veterinarian) => (
              <option value={veterinarian.id} key={veterinarian.id}>
                {veterinarian.name}
              </option>
            ))}
          </select>
          {veterinariansError ? (
            <span className="form-error" role="alert">
              {veterinariansError}
            </span>
          ) : null}
        </label>

        <button
          className="filters-clear"
          type="button"
          disabled={!hasFilters}
          onClick={clearFilters}
        >
          Limpar
        </button>
      </section>

      <section className="users-card" aria-busy={isLoading}>
        <header className="users-card__header">
          <h2>Agenda</h2>
          <span className="users-count">{countLabel}</span>
        </header>

        {error ? (
          <div className="users-error" role="alert">
            {error}
            <div>
              <button
                className="users-error__retry"
                type="button"
                onClick={() => setReloadToken((current) => current + 1)}
              >
                Tentar novamente
              </button>
            </div>
          </div>
        ) : isLoading ? (
          <div className="users-state" role="status">
            <strong>Carregando agenda...</strong>
          </div>
        ) : appointments.length === 0 ? (
          <div className="users-state">
            <strong>Nenhum agendamento encontrado.</strong>
            <p>Ajuste os filtros ou crie o primeiro agendamento.</p>
            {hasFilters ? (
              <button
                className="button button--ghost users-state__action"
                type="button"
                onClick={clearFilters}
              >
                Limpar filtros
              </button>
            ) : null}
          </div>
        ) : (
          <div className="users-table-wrap">
            <table className="users-table">
              <thead>
                <tr>
                  <th scope="col">Data e hora</th>
                  <th scope="col">Animal</th>
                  <th scope="col">Tipo</th>
                  <th scope="col">Profissional</th>
                  <th scope="col">Situação</th>
                  {canWrite ? (
                    <th scope="col" className="users-table__actions">
                      Ações
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {appointments.map((appointment) => (
                  <tr key={appointment.id}>
                    <td>
                      <div className="appointment-datetime">
                        <strong>{formatDate(appointment.scheduledAt)}</strong>
                        <span>
                          {formatTime(appointment.scheduledAt)} •{" "}
                          {appointment.durationMinutes} min
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="user-cell">
                        <span className="user-avatar" aria-hidden="true">
                          {getInitials(appointment.animalName)}
                        </span>
                        <span className="user-cell__text">
                          <strong>{appointment.animalName}</strong>
                          <span>
                            {appointment.animalSpecies} • {appointment.tutorName}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`appointment-type appointment-type--${appointment.type}`}
                      >
                        {TYPE_LABELS[appointment.type]}
                      </span>
                    </td>
                    <td>{appointment.veterinarianName}</td>
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
                    {canWrite ? (
                      <td className="users-table__actions">
                        <div className="appointment-actions">
                          {appointment.status === "scheduled" ? (
                            <button
                              className="appointment-cancel-button"
                              type="button"
                              disabled={cancellingId === appointment.id}
                              onClick={() => handleCancel(appointment)}
                            >
                              {cancellingId === appointment.id
                                ? "Cancelando..."
                                : "Cancelar"}
                            </button>
                          ) : null}
                          <Link
                            className="user-edit-button"
                            to={`/agenda/${appointment.id}/editar`}
                            aria-label={`Editar agendamento de ${appointment.animalName}`}
                          >
                            <PencilIcon />
                            <span>Editar</span>
                          </Link>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {canWrite ? (
        <Link className="users-fab" to="/agenda/novo">
          <span className="users-fab__icon" aria-hidden="true">
            +
          </span>
          <span>Novo agendamento</span>
        </Link>
      ) : null}
    </div>
  );
}
