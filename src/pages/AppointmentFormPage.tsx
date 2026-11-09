import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  createAppointment,
  fetchAnimals,
  fetchAppointment,
  fetchVeterinarians,
  updateAppointment,
} from "../lib/api";
import {
  fromDateTimeLocal,
  toDateTimeLocal,
} from "../lib/format";
import { Link, navigate, setFlash } from "../lib/navigation";
import type { Animal } from "../types/registry";
import type { AuthUser } from "../types/auth";
import type {
  AppointmentStatus,
  AppointmentType,
  Veterinarian,
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
  const [isLoadingData, setIsLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

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

    Promise.all([
      fetchAnimals(),
      fetchVeterinarians(),
      appointmentRequest,
    ])
      .then(([animalData, veterinarianData, appointment]) => {
        if (!isActiveRequest) {
          return;
        }

        setAnimals(animalData);
        setVeterinarians(veterinarianData);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isSubmitting || isLoadingData || loadError) {
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

  const missingData = animals.length === 0 || veterinarians.length === 0;

  return (
    <div className="user-form-page">
      <Link className="back-link" to="/agenda">
        ← Voltar para a agenda
      </Link>

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
              aria-invalid={Boolean(errors.veterinarianId)}
              onChange={(event) => {
                setVeterinarianId(event.target.value);
                clearError("veterinarianId");
              }}
            >
              <option value="">Selecione o veterinário</option>
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
              disabled={isSubmitting || missingData}
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
    </div>
  );
}
