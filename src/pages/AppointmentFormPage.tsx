import { useEffect, useRef, useState, type FormEvent } from "react";
import ScheduleGrid from "../components/ScheduleGrid";
import { SearchIcon } from "../components/icons";
import {
  ApiError,
  createAppointment,
  fetchAnimals,
  fetchAppointment,
  fetchSchedule,
  fetchVeterinarians,
  updateAppointment,
} from "../lib/api";
import {
  formatDate,
  formatTime,
  fromDateTimeLocal,
  getInitials,
  toDateTimeLocal,
} from "../lib/format";
import { Link, navigate, setFlash } from "../lib/navigation";
import type { Animal } from "../types/registry";
import type { AuthUser } from "../types/auth";
import type {
  AppointmentStatus,
  AppointmentType,
  ScheduleWeek,
  Veterinarian,
  VeterinarianAvailabilityFilter,
} from "../types/appointments";
import "./UsersPage.css";
import "./AppointmentsPage.css";

type AppointmentFormPageProps = {
  user: AuthUser;
  mode: "create" | "edit";
  appointmentId?: string;
};

type FormErrors = Record<string, string>;

const TYPES: { value: AppointmentType; label: string }[] = [
  { value: "consultation", label: "Consulta" },
  { value: "surgery", label: "Operação" },
  { value: "vaccination", label: "Vacinação" },
];

const STATUSES: { value: AppointmentStatus; label: string }[] = [
  { value: "scheduled", label: "Agendada" },
  { value: "completed", label: "Concluída" },
  { value: "cancelled", label: "Cancelada" },
];

function localDateKey(date: Date) {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function startOfWeekKey(date: Date) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return localDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset),
  );
}

function addDaysToKey(value: string, days: number) {
  const date = parseDateKey(value);
  return localDateKey(
    new Date(date.getFullYear(), date.getMonth(), date.getDate() + days),
  );
}

function displayDateKey(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function slotKey(date: string, startMinutes: number) {
  return `${date}:${startMinutes}`;
}

function getAvailabilityFilter(
  scheduledAt: string,
  durationMinutes: string,
): VeterinarianAvailabilityFilter | null {
  const date = new Date(scheduledAt);
  const duration = Number(durationMinutes);

  if (
    !scheduledAt ||
    Number.isNaN(date.getTime()) ||
    !Number.isInteger(duration) ||
    duration < 15 ||
    duration > 480
  ) {
    return null;
  }

  return {
    weekday: date.getDay() === 0 ? 7 : date.getDay(),
    startMinutes: date.getHours() * 60 + date.getMinutes(),
    durationMinutes: duration,
    date: localDateKey(date),
  };
}

export default function AppointmentFormPage({
  user,
  mode,
  appointmentId,
}: AppointmentFormPageProps) {
  const isEdit = mode === "edit";
  const canWrite = user.permissions.includes("appointments.write");

  const [animalId, setAnimalId] = useState("");
  const [veterinarianId, setVeterinarianId] = useState("");
  const [type, setType] = useState<AppointmentType>("consultation");
  const [scheduledAt, setScheduledAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("30");
  const [status, setStatus] = useState<AppointmentStatus>("scheduled");
  const [notes, setNotes] = useState("");
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [vetSearch, setVetSearch] = useState("");
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [isLoadingVets, setIsLoadingVets] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [vetsError, setVetsError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => startOfWeekKey(new Date()));
  const [schedule, setSchedule] = useState<ScheduleWeek | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set());
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(true);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const gridDragRef = useRef<{
    date: string;
    anchor: number;
  } | null>(null);
  const suppressGridClickRef = useRef(false);

  useEffect(() => {
    if (!canWrite) {
      setIsLoadingData(false);
      return;
    }

    if (isEdit && !appointmentId) {
      setLoadError("Agendamento não informado.");
      setIsLoadingData(false);
      return;
    }

    let isActiveRequest = true;
    setIsLoadingData(true);
    setLoadError(null);

    const appointmentRequest =
      isEdit && appointmentId
        ? fetchAppointment(appointmentId)
        : Promise.resolve(null);

    Promise.all([fetchAnimals(), appointmentRequest])
      .then(([animalData, appointment]) => {
        if (!isActiveRequest) {
          return;
        }

        setAnimals(animalData);

        if (appointment) {
          setAnimalId(appointment.animalId);
          setVeterinarianId(appointment.veterinarianId);
          setType(appointment.type);
          setScheduledAt(toDateTimeLocal(appointment.scheduledAt));
          setDurationMinutes(String(appointment.durationMinutes));
          setStatus(appointment.status);
          setNotes(appointment.notes ?? "");
        }
      })
      .catch((error) => {
        if (isActiveRequest) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar o agendamento.",
          );
        }
      })
      .finally(() => {
        if (isActiveRequest) {
          setIsLoadingData(false);
        }
      });

    return () => {
      isActiveRequest = false;
    };
  }, [canWrite, isEdit, appointmentId]);

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    let isActiveRequest = true;
    const filter = getAvailabilityFilter(scheduledAt, durationMinutes);
    setIsLoadingVets(true);
    setVetsError(null);

    fetchVeterinarians(filter ?? undefined)
      .then((data) => {
        if (!isActiveRequest) {
          return;
        }

        setVeterinarians(data);

        if (filter) {
          setVeterinarianId((current) =>
            current && !data.some((veterinarian) => veterinarian.id === current)
              ? ""
              : current,
          );
        }
      })
      .catch((error) => {
        if (isActiveRequest) {
          setVeterinarians([]);
          setVetsError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar os profissionais.",
          );
        }
      })
      .finally(() => {
        if (isActiveRequest) {
          setIsLoadingVets(false);
        }
      });

    return () => {
      isActiveRequest = false;
    };
  }, [canWrite, scheduledAt, durationMinutes]);

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    let isActiveRequest = true;
    setIsLoadingSchedule(true);
    setScheduleError(null);

    fetchSchedule(weekStart)
      .then((data) => {
        if (isActiveRequest) {
          setSchedule(data);
        }
      })
      .catch((error) => {
        if (isActiveRequest) {
          setSchedule(null);
          setScheduleError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a agenda.",
          );
        }
      })
      .finally(() => {
        if (isActiveRequest) {
          setIsLoadingSchedule(false);
        }
      });

    return () => {
      isActiveRequest = false;
    };
  }, [canWrite, weekStart]);

  useEffect(() => {
    if (!scheduledAt) {
      setSelectedSlots(new Set());
      return;
    }

    const date = new Date(scheduledAt);
    const duration = Number(durationMinutes);

    if (
      Number.isNaN(date.getTime()) ||
      !Number.isInteger(duration) ||
      duration < 15
    ) {
      return;
    }

    const dateKey = localDateKey(date);
    const nextWeek = startOfWeekKey(date);
    setWeekStart((current) => (current === nextWeek ? current : nextWeek));
    const start = date.getHours() * 60 + date.getMinutes();
    const count = Math.max(1, Math.min(16, Math.ceil(duration / 30)));

    setSelectedSlots(
      new Set(
        Array.from({ length: count }, (_, index) =>
          slotKey(dateKey, start + index * 30),
        ),
      ),
    );
  }, [scheduledAt, durationMinutes]);

  useEffect(() => {
    function endGridDrag() {
      if (!gridDragRef.current) {
        return;
      }

      gridDragRef.current = null;
      window.setTimeout(() => {
        suppressGridClickRef.current = false;
      }, 0);
    }

    window.addEventListener("pointerup", endGridDrag);
    window.addEventListener("pointercancel", endGridDrag);

    return () => {
      window.removeEventListener("pointerup", endGridDrag);
      window.removeEventListener("pointercancel", endGridDrag);
    };
  }, []);

  function clearError(field: string) {
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function slotStatus(date: string, startMinutes: number) {
    const day = schedule?.days.find((item) => item.date === date);
    return day?.slots[Math.floor(startMinutes / 30)] ?? "closed";
  }

  function applyGridSelection(date: string, first: number, last: number) {
    const start = Math.min(first, last);
    const end = Math.max(first, last);
    const count = (end - start) / 30 + 1;

    if (count < 1 || count > 16) {
      return;
    }

    setSelectedSlots(
      new Set(
        Array.from({ length: count }, (_, index) =>
          slotKey(date, start + index * 30),
        ),
      ),
    );

    const hours = String(Math.floor(start / 60)).padStart(2, "0");
    const minutes = String(start % 60).padStart(2, "0");
    setScheduledAt(`${date}T${hours}:${minutes}`);
    setDurationMinutes(String(count * 30));
    setErrors((current) => {
      if (!current.scheduledAt && !current.durationMinutes) {
        return current;
      }

      const next = { ...current };
      delete next.scheduledAt;
      delete next.durationMinutes;
      return next;
    });
  }

  function handleGridPointerDown(
    date: string,
    startMinutes: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    if (event.pointerType === "touch" || slotStatus(date, startMinutes) !== "free") {
      return;
    }

    gridDragRef.current = { date, anchor: startMinutes };
    suppressGridClickRef.current = true;
    applyGridSelection(date, startMinutes, startMinutes);
  }

  function handleGridPointerOver(
    date: string,
    startMinutes: number,
    event: React.PointerEvent<HTMLButtonElement>,
  ) {
    const drag = gridDragRef.current;

    if (!drag || event.pointerType === "touch" || drag.date !== date) {
      return;
    }

    const first = Math.min(drag.anchor, startMinutes);
    const last = Math.max(drag.anchor, startMinutes);
    const count = (last - first) / 30 + 1;

    if (count > 16) {
      return;
    }

    for (let minutes = first; minutes <= last; minutes += 30) {
      if (slotStatus(date, minutes) !== "free") {
        return;
      }
    }

    applyGridSelection(date, first, last);
  }

  function handleGridClick(
    date: string,
    startMinutes: number,
    _event: React.MouseEvent<HTMLButtonElement>,
  ) {
    if (suppressGridClickRef.current) {
      suppressGridClickRef.current = false;
      return;
    }

    if (slotStatus(date, startMinutes) !== "free") {
      return;
    }

    const starts = [...selectedSlots]
      .filter((key) => key.startsWith(`${date}:`))
      .map((key) => Number(key.split(":")[1]));

    if (starts.length > 0) {
      const min = Math.min(...starts);
      const max = Math.max(...starts);

      if (startMinutes === min - 30 || startMinutes === max + 30) {
        applyGridSelection(
          date,
          Math.min(min, startMinutes),
          Math.max(max, startMinutes),
        );
        return;
      }
    }

    applyGridSelection(date, startMinutes, startMinutes);
  }

  function changeWeek(days: number) {
    setWeekStart((current) => addDaysToKey(current, days));
    setSelectedSlots(new Set());
    setScheduledAt("");
  }

  function goToCurrentWeek() {
    setWeekStart(startOfWeekKey(new Date()));
    setSelectedSlots(new Set());
    setScheduledAt("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      isSubmitting ||
      isLoadingData ||
      isLoadingVets ||
      loadError
    ) {
      return;
    }

    const nextErrors: FormErrors = {};
    const duration = Number(durationMinutes);
    const isoDate = fromDateTimeLocal(scheduledAt);

    if (!animalId) {
      nextErrors.animalId = "Selecione o animal.";
    }

    if (!veterinarianId) {
      nextErrors.veterinarianId = "Selecione o veterinário.";
    }

    if (!scheduledAt || !isoDate) {
      nextErrors.scheduledAt = "Informe data e horário.";
    }

    if (!Number.isInteger(duration) || duration < 15 || duration > 480) {
      nextErrors.durationMinutes = "A duração deve estar entre 15 e 480 minutos.";
    }

    setErrors(nextErrors);
    setSubmitError(null);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setIsSubmitting(true);

    try {
      const input = {
        animalId,
        veterinarianId,
        type,
        scheduledAt: isoDate,
        durationMinutes: duration,
        notes: notes.trim() || null,
        status,
      };

      if (isEdit && appointmentId) {
        await updateAppointment(appointmentId, input);
        setFlash("Agendamento atualizado com sucesso.");
      } else {
        await createAppointment(input);
        setFlash("Agendamento criado com sucesso.");
      }

      navigate("/agenda");
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.code === "appointment_conflict") {
          setSubmitError(error.message);
        } else if (
          error.code === "invalid_animal" ||
          error.code === "animal_not_found"
        ) {
          setErrors({ animalId: error.message });
        } else if (
          error.code === "invalid_veterinarian" ||
          error.code === "veterinarian_not_found"
        ) {
          setErrors({ veterinarianId: error.message });
        } else {
          setSubmitError(error.message);
        }
      } else {
        setSubmitError(
          error instanceof Error
            ? error.message
            : "Não foi possível salvar o agendamento.",
        );
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canWrite) {
    return (
      <div className="user-form-page">
        <div className="users-error" role="alert">
          Você não tem permissão para gerenciar agendamentos.
        </div>
      </div>
    );
  }

  if (isLoadingData) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/agenda">
          ← Voltar para a agenda
        </Link>
        <section className="user-form-card">
          <div className="users-state" role="status">
            <strong>Carregando agendamento...</strong>
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="user-form-page">
        <Link className="back-link" to="/agenda">
          ← Voltar para a agenda
        </Link>
        <div className="users-error" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  const hasSchedule = Boolean(
    scheduledAt && !Number.isNaN(new Date(scheduledAt).getTime()),
  );
  const hasNoVets = !isLoadingVets && veterinarians.length === 0;
  const missingData = animals.length === 0 || hasNoVets;
  const search = vetSearch.trim().toLocaleLowerCase("pt-BR");
  const visibleVeterinarians = veterinarians.filter(
    (veterinarian) =>
      !search ||
      veterinarian.name.toLocaleLowerCase("pt-BR").includes(search) ||
      (veterinarian.email ?? "").toLocaleLowerCase("pt-BR").includes(search),
  );
  const availabilityLabel = hasSchedule
    ? `Disponíveis em ${formatDate(scheduledAt)} às ${formatTime(scheduledAt)}`
    : "Selecione data e horário para filtrar automaticamente pela disponibilidade.";
  const weekLabel = `${displayDateKey(weekStart)} – ${displayDateKey(
    addDaysToKey(weekStart, 6),
  )}`;

  return (
    <div className="user-form-page appointment-form-page">
      <Link className="back-link" to="/agenda">
        ← Voltar para a agenda
      </Link>

      <ScheduleGrid
        schedule={schedule}
        selected={selectedSlots}
        isLoading={isLoadingSchedule}
        error={scheduleError}
        weekLabel={weekLabel}
        onPreviousWeek={() => changeWeek(-7)}
        onNextWeek={() => changeWeek(7)}
        onCurrentWeek={goToCurrentWeek}
        onPointerDown={handleGridPointerDown}
        onPointerOver={handleGridPointerOver}
        onClick={handleGridClick}
      />

      <div className="appointment-form-layout">
        <section
          className="user-form-card"
          aria-labelledby="appointment-form-title"
        >
          <header className="user-form-card__header">
            <h2 id="appointment-form-title">
              {isEdit ? "Editar agendamento" : "Novo agendamento"}
            </h2>
            <p>
              {isEdit
                ? "Atualize o animal, o profissional, o horário ou a situação."
                : "Agende uma consulta, operação ou vacinação."}
            </p>
          </header>

          {missingData ? (
            <div className="form-alert" role="alert">
              {animals.length === 0
                ? "Nenhum animal cadastrado. Cadastre um pet antes de agendar."
                : hasSchedule
                  ? "Nenhum profissional disponível para o horário selecionado."
                  : "Nenhum veterinário ativo encontrado. Solicite ao administrador a criação de um usuário com papel Veterinário."}
            </div>
          ) : null}

          <form className="user-form" noValidate onSubmit={handleSubmit}>
            {submitError ? (
              <div className="form-alert" role="alert">
                {submitError}
              </div>
            ) : null}

            <div className="form-field form-field--full">
              <label htmlFor="appointment-animal">Animal</label>
              <select
                id="appointment-animal"
                value={animalId}
                aria-invalid={Boolean(errors.animalId)}
                onChange={(event) => {
                  setAnimalId(event.target.value);
                  clearError("animalId");
                }}
              >
                <option value="">Selecione o animal</option>
                {animals.map((animal) => (
                  <option value={animal.id} key={animal.id}>
                    {animal.name} — {animal.tutorName}
                  </option>
                ))}
              </select>
              {errors.animalId ? (
                <p className="form-error" role="alert">
                  {errors.animalId}
                </p>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="appointment-veterinarian">Profissional</label>
              <select
                id="appointment-veterinarian"
                value={veterinarianId}
                disabled={isLoadingVets || veterinarians.length === 0}
                aria-invalid={Boolean(errors.veterinarianId)}
                onChange={(event) => {
                  setVeterinarianId(event.target.value);
                  clearError("veterinarianId");
                }}
              >
                <option value="">
                  {isLoadingVets
                    ? "Carregando profissionais..."
                    : "Selecione o veterinário"}
                </option>
                {veterinarians.map((veterinarian) => (
                  <option value={veterinarian.id} key={veterinarian.id}>
                    {veterinarian.name}
                  </option>
                ))}
              </select>
              {errors.veterinarianId ? (
                <p className="form-error" role="alert">
                  {errors.veterinarianId}
                </p>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="appointment-type">Tipo</label>
              <select
                id="appointment-type"
                value={type}
                onChange={(event) =>
                  setType(event.target.value as AppointmentType)
                }
              >
                {TYPES.map((option) => (
                  <option value={option.value} key={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label htmlFor="appointment-datetime">Data e horário</label>
              <input
                id="appointment-datetime"
                type="datetime-local"
                value={scheduledAt}
                aria-invalid={Boolean(errors.scheduledAt)}
                onChange={(event) => {
                  setScheduledAt(event.target.value);
                  clearError("scheduledAt");
                }}
              />
              {errors.scheduledAt ? (
                <p className="form-error" role="alert">
                  {errors.scheduledAt}
                </p>
              ) : null}
            </div>

            <div className="form-field">
              <label htmlFor="appointment-duration">Duração (minutos)</label>
              <input
                id="appointment-duration"
                type="number"
                min={15}
                max={480}
                step={15}
                value={durationMinutes}
                aria-invalid={Boolean(errors.durationMinutes)}
                onChange={(event) => {
                  setDurationMinutes(event.target.value);
                  clearError("durationMinutes");
                }}
              />
              {errors.durationMinutes ? (
                <p className="form-error" role="alert">
                  {errors.durationMinutes}
                </p>
              ) : null}
            </div>

            {isEdit ? (
              <div className="form-field">
                <label htmlFor="appointment-status">Situação</label>
                <select
                  id="appointment-status"
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as AppointmentStatus)
                  }
                >
                  {STATUSES.map((option) => (
                    <option value={option.value} key={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="form-field form-field--full">
              <label htmlFor="appointment-notes">Observações</label>
              <textarea
                id="appointment-notes"
                rows={3}
                placeholder="Motivo, preparo, observações do atendimento..."
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </div>

            <div className="form-actions">
              <Link className="button button--ghost" to="/agenda">
                Cancelar
              </Link>
              <button
                className="button button--primary"
                type="submit"
                disabled={
                  isSubmitting ||
                  missingData ||
                  isLoadingVets ||
                  !veterinarianId
                }
              >
                {isSubmitting
                  ? isEdit
                    ? "Salvando..."
                    : "Agendando..."
                  : isEdit
                    ? "Salvar alterações"
                    : "Agendar"}
              </button>
            </div>
          </form>
        </section>

        <aside
          className="doctor-picker"
          aria-labelledby="doctor-picker-title"
        >
          <header className="doctor-picker__header">
            <div>
              <h2 id="doctor-picker-title">Profissionais</h2>
              <p>Selecione quem realizará o atendimento.</p>
            </div>
            <span className="doctor-picker__count">
              {visibleVeterinarians.length}
            </span>
          </header>

          <label className="doctor-picker__search">
            <span className="filter-search">
              <SearchIcon />
              <input
                className="filter-input"
                type="search"
                placeholder="Buscar por nome ou e-mail"
                value={vetSearch}
                onChange={(event) => setVetSearch(event.target.value)}
              />
            </span>
          </label>

          <p className="doctor-picker__hint">{availabilityLabel}</p>

          {isLoadingVets ? (
            <div className="doctor-picker__state" role="status">
              <strong>Carregando profissionais...</strong>
            </div>
          ) : vetsError ? (
            <div className="users-error" role="alert">
              {vetsError}
            </div>
          ) : visibleVeterinarians.length === 0 ? (
            <div className="doctor-picker__state">
              <strong>
                {search
                  ? "Nenhum profissional encontrado para a busca."
                  : hasSchedule
                    ? "Nenhum profissional disponível neste horário."
                    : "Nenhum veterinário ativo encontrado."}
              </strong>
              {hasSchedule && !search ? (
                <p>Ajuste a data, o horário ou a duração do atendimento.</p>
              ) : null}
            </div>
          ) : (
            <div className="doctor-picker__list">
              {visibleVeterinarians.map((veterinarian) => {
                const isSelected = veterinarian.id === veterinarianId;

                return (
                  <button
                    className={`doctor-option${isSelected ? " is-selected" : ""}`}
                    type="button"
                    key={veterinarian.id}
                    aria-pressed={isSelected}
                    onClick={() => {
                      setVeterinarianId(veterinarian.id);
                      clearError("veterinarianId");
                    }}
                  >
                    <span className="user-avatar" aria-hidden="true">
                      {getInitials(veterinarian.name)}
                    </span>
                    <span className="doctor-option__text">
                      <strong>{veterinarian.name}</strong>
                      <small>{veterinarian.email ?? "Veterinário"}</small>
                    </span>
                    {isSelected ? (
                      <span className="doctor-option__check" aria-hidden="true">
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
