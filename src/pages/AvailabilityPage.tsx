import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  fetchVeterinarianAvailability,
  updateVeterinarianAvailability,
} from "../lib/api";
import { Link } from "../lib/navigation";
import { STANDARD_TIME_SLOTS, TIME_SLOTS } from "../lib/schedule";
import { useFlashMessage } from "../lib/useFlashMessage";
import type { AuthUser } from "../types/auth";
import type {
  AvailabilitySlot,
  VeterinarianAvailability,
} from "../types/appointments";
import "./UsersPage.css";
import "./AppointmentsPage.css";
import "./AvailabilityPage.css";

type AvailabilityPageProps = {
  user: AuthUser;
  veterinarianId: string;
};

const DAYS = [
  { value: 1, short: "Seg", long: "segunda-feira" },
  { value: 2, short: "Ter", long: "terça-feira" },
  { value: 3, short: "Qua", long: "quarta-feira" },
  { value: 4, short: "Qui", long: "quinta-feira" },
  { value: 5, short: "Sex", long: "sexta-feira" },
  { value: 6, short: "Sáb", long: "sábado" },
  { value: 7, short: "Dom", long: "domingo" },
];

function slotKey(weekday: number, startMinutes: number) {
  return `${weekday}:${startMinutes}`;
}

function toSet(slots: AvailabilitySlot[]) {
  return new Set(slots.map((slot) => slotKey(slot.weekday, slot.startMinutes)));
}

function sameSet(a: Set<string>, b: Set<string>) {
  if (a.size !== b.size) {
    return false;
  }

  for (const value of a) {
    if (!b.has(value)) {
      return false;
    }
  }

  return true;
}

export default function AvailabilityPage({
  user,
  veterinarianId,
}: AvailabilityPageProps) {
  const canRead = user.permissions.includes("veterinarians.read");
  const canWrite = user.permissions.includes("veterinarians.write");

  const [data, setData] = useState<VeterinarianAvailability | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [initial, setInitial] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showNonStandard, setShowNonStandard] = useState(false);
  const [flash, setFlash] = useFlashMessage();
  const dragRef = useRef<{
    targetSelected: boolean;
    seen: Set<string>;
  } | null>(null);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    function endDrag() {
      if (!dragRef.current) {
        return;
      }

      dragRef.current = null;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }

    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);

    return () => {
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  useEffect(() => {
    if (!canRead) {
      setIsLoading(false);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setLoadError(null);

    fetchVeterinarianAvailability(veterinarianId)
      .then((response) => {
        if (!isActive) {
          return;
        }

        const next = toSet(response.slots);
        setData(response);
        setSelected(next);
        setInitial(next);
      })
      .catch((error) => {
        if (isActive) {
          setLoadError(
            error instanceof Error
              ? error.message
              : "Não foi possível carregar a disponibilidade.",
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
  }, [canRead, veterinarianId]);

  function setSlotState(key: string, isSelected: boolean) {
    setSelected((current) => {
      if (current.has(key) === isSelected) {
        return current;
      }

      const next = new Set(current);

      if (isSelected) {
        next.add(key);
      } else {
        next.delete(key);
      }

      return next;
    });
  }

  function toggleSlot(weekday: number, minutes: number) {
    if (!canWrite) {
      return;
    }

    const key = slotKey(weekday, minutes);
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }

      return next;
    });
  }

  function getCellKey(cell: HTMLButtonElement) {
    return slotKey(Number(cell.dataset.weekday), Number(cell.dataset.start));
  }

  function getCellFromEvent(event: {
    target: EventTarget | null;
  }) {
    return event.target instanceof Element
      ? event.target.closest<HTMLButtonElement>("button[data-weekday]")
      : null;
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLTableElement>) {
    if (!canWrite || event.pointerType === "touch") {
      return;
    }

    const cell = getCellFromEvent(event);

    if (!cell) {
      return;
    }

    const key = getCellKey(cell);
    const targetSelected = !selected.has(key);
    dragRef.current = {
      targetSelected,
      seen: new Set([key]),
    };
    suppressClickRef.current = true;
    setSlotState(key, targetSelected);
  }

  function handlePointerOver(event: ReactPointerEvent<HTMLTableElement>) {
    if (!canWrite || event.pointerType === "touch" || !dragRef.current) {
      return;
    }

    const cell = getCellFromEvent(event);

    if (!cell) {
      return;
    }

    const key = getCellKey(cell);

    if (dragRef.current.seen.has(key)) {
      return;
    }

    dragRef.current.seen.add(key);
    setSlotState(key, dragRef.current.targetSelected);
  }

  function handleClick(event: ReactMouseEvent<HTMLTableElement>) {
    if (!canWrite) {
      return;
    }

    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }

    const cell = getCellFromEvent(event);

    if (!cell) {
      return;
    }

    toggleSlot(Number(cell.dataset.weekday), Number(cell.dataset.start));
  }

  async function handleSave() {
    if (!canWrite || !data) {
      return;
    }

    const slots = [...selected]
      .map((key) => {
        const [weekday, startMinutes] = key.split(":").map(Number);
        return { weekday, startMinutes };
      })
      .sort((a, b) => a.weekday - b.weekday || a.startMinutes - b.startMinutes);

    setIsSaving(true);
    setSaveError(null);

    try {
      const response = await updateVeterinarianAvailability(
        veterinarianId,
        slots,
      );
      const next = toSet(response.slots);
      setData(response);
      setSelected(next);
      setInitial(next);
      setFlash("Disponibilidade atualizada com sucesso.");
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar a disponibilidade.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (!canRead) {
    return (
      <div className="availability-page">
        <div className="users-error" role="alert">
          Você não tem permissão para consultar a disponibilidade.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="availability-page">
        <section className="availability-card">
          <div className="users-state" role="status">
            <strong>Carregando disponibilidade...</strong>
          </div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="availability-page">
        <Link className="back-link" to={`/usuarios/${veterinarianId}/editar`}>
          ← Voltar para o usuário
        </Link>
        <div className="users-error" role="alert">
          {loadError}
        </div>
      </div>
    );
  }

  const isDirty = !sameSet(selected, initial);
  const visibleTimeSlots = showNonStandard
    ? TIME_SLOTS
    : STANDARD_TIME_SLOTS;

  return (
    <div className="availability-page">
      <Link className="back-link" to={`/usuarios/${veterinarianId}/editar`}>
        ← Voltar para o usuário
      </Link>

      <header className="users-page__header">
        <div>
          <p className="users-page__eyebrow">Veterinário</p>
          <p className="users-page__description">
            {data?.veterinarian.name} — clique nos quadrados de 30 minutos para
            incluir ou remover horários.
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

      {saveError ? (
        <div className="users-error" role="alert">
          {saveError}
        </div>
      ) : null}

      <section className="availability-card">
        <header className="availability-card__header">
          <div>
            <h2>Disponibilidade semanal</h2>
            <p>
              Os horários definidos aqui poderão ser usados para sugerir
              profissionais no agendamento.
            </p>
          </div>
          <span className="availability-count">
            {selected.size} {selected.size === 1 ? "horário" : "horários"}
          </span>
        </header>

        <div className="availability-toolbar">
          <span className="availability-toolbar__range">
            Horário padrão: 07:00–18:00
          </span>
          <label className="schedule-toggle">
            <input
              type="checkbox"
              role="switch"
              checked={showNonStandard}
              onChange={(event) => setShowNonStandard(event.target.checked)}
            />
            <span className="schedule-toggle__track" aria-hidden="true" />
            <span className="schedule-toggle__label">Horários não padrão</span>
          </label>
        </div>

        <div className="availability-scroll">
          <table
            className="availability-table"
            onPointerDown={handlePointerDown}
            onPointerOver={handlePointerOver}
            onClick={handleClick}
          >
            <thead>
              <tr>
                <th scope="col">Horário</th>
                {DAYS.map((day) => (
                  <th scope="col" key={day.value}>
                    {day.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTimeSlots.map((slot) => (
                <tr key={slot.minutes}>
                  <th scope="row">{slot.label}</th>
                  {DAYS.map((day) => {
                    const key = slotKey(day.value, slot.minutes);
                    const isSelected = selected.has(key);

                    return (
                      <td key={day.value}>
                        <button
                          className={`availability-cell${isSelected ? " is-selected" : ""}`}
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`${day.long}, ${slot.label}${isSelected ? ", disponível" : ", indisponível"}`}
                          data-weekday={day.value}
                          data-start={slot.minutes}
                          disabled={!canWrite}
                        >
                          {isSelected ? "✓" : ""}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="availability-card__footer">
          <span className="availability-card__state">
            {canWrite
              ? isDirty
                ? "Alterações não salvas."
                : "Disponibilidade salva."
              : "Somente leitura."}
          </span>

          {canWrite ? (
            <div className="availability-card__actions">
              <button
                className="button button--ghost"
                type="button"
                disabled={!isDirty || isSaving}
                onClick={() => setSelected(new Set(initial))}
              >
                Descartar
              </button>
              <button
                className="button button--primary"
                type="button"
                disabled={!isDirty || isSaving}
                onClick={handleSave}
              >
                {isSaving ? "Salvando..." : "Salvar disponibilidade"}
              </button>
            </div>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
