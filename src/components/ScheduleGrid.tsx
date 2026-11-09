import {
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  ScheduleStatus,
  ScheduleWeek,
} from "../types/appointments";
import "../pages/AvailabilityPage.css";

type ScheduleGridProps = {
  schedule: ScheduleWeek | null;
  selected: Set<string>;
  isLoading: boolean;
  error: string | null;
  weekLabel: string;
  onPreviousWeek: () => void;
  onNextWeek: () => void;
  onCurrentWeek: () => void;
  onPointerDown: (
    date: string,
    startMinutes: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onPointerOver: (
    date: string,
    startMinutes: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => void;
  onClick: (
    date: string,
    startMinutes: number,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => void;
};

const WEEKDAY_LABELS: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  7: "Dom",
};

const TIME_SLOTS = Array.from({ length: 48 }, (_, index) => {
  const minutes = index * 30;
  const hours = String(Math.floor(minutes / 60)).padStart(2, "0");
  const rest = String(minutes % 60).padStart(2, "0");

  return { minutes, label: `${hours}:${rest}` };
});

const STANDARD_START = 7 * 60;
const STANDARD_END = 18 * 60;
const STANDARD_SLOTS = TIME_SLOTS.filter(
  (slot) => slot.minutes >= STANDARD_START && slot.minutes < STANDARD_END,
);

const STATUS_LABELS: Record<ScheduleStatus, string> = {
  free: "horário livre",
  busy: "sem médicos livres",
  closed: "sem médicos atendendo",
};

function formatDayDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

export default function ScheduleGrid({
  schedule,
  selected,
  isLoading,
  error,
  weekLabel,
  onPreviousWeek,
  onNextWeek,
  onCurrentWeek,
  onPointerDown,
  onPointerOver,
  onClick,
}: ScheduleGridProps) {
  const [showNonStandard, setShowNonStandard] = useState(false);
  const visibleTimeSlots = showNonStandard ? TIME_SLOTS : STANDARD_SLOTS;

  return (
    <section className="availability-card schedule-card">
      <header className="availability-card__header schedule-card__header">
        <div>
          <h2>Agenda visual</h2>
          <p>Clique ou arraste para selecionar horários livres e contínuos.</p>
        </div>
        <div className="schedule-nav" aria-label="Navegação da semana">
          <button
            className="schedule-nav__button"
            type="button"
            aria-label="Semana anterior"
            onClick={onPreviousWeek}
          >
            ‹
          </button>
          <button
            className="schedule-nav__button schedule-nav__today"
            type="button"
            onClick={onCurrentWeek}
          >
            Hoje
          </button>
          <button
            className="schedule-nav__button"
            type="button"
            aria-label="Próxima semana"
            onClick={onNextWeek}
          >
            ›
          </button>
        </div>
      </header>

      <div className="schedule-subheader">
        <span className="schedule-week">{weekLabel}</span>
        <div className="schedule-controls">
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

          <div className="schedule-legend" aria-label="Legenda da agenda">
            <span className="schedule-legend__item">
              <i className="schedule-legend__swatch schedule-cell--free" />
              Livre
            </span>
            <span className="schedule-legend__item">
              <i className="schedule-legend__swatch schedule-cell--busy" />
              Sem médicos livres
            </span>
            <span className="schedule-legend__item">
              <i className="schedule-legend__swatch schedule-cell--closed" />
              Sem atendimento
            </span>
            <span className="schedule-legend__item">
              <i className="schedule-legend__swatch is-selected" />
              Selecionado
            </span>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="users-state" role="status">
          <strong>Carregando agenda...</strong>
        </div>
      ) : error ? (
        <div className="users-error" role="alert">
          {error}
        </div>
      ) : !schedule ? (
        <div className="users-state">
          <strong>Nenhum horário disponível para exibir.</strong>
        </div>
      ) : (
        <div className="availability-scroll schedule-grid-scroll">
          <table className="availability-table schedule-table">
            <thead>
              <tr>
                <th scope="col">Horário</th>
                {schedule.days.map((day) => (
                  <th scope="col" key={day.date}>
                    <span className="schedule-day">
                      {WEEKDAY_LABELS[day.weekday]}
                    </span>
                    <span className="schedule-date">
                      {formatDayDate(day.date)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTimeSlots.map((slot) => (
                <tr key={slot.minutes}>
                  <th scope="row">{slot.label}</th>
                  {schedule.days.map((day) => {
                    const status =
                      day.slots[Math.floor(slot.minutes / 30)] ?? "closed";
                    const key = `${day.date}:${slot.minutes}`;
                    const isSelected = selected.has(key);
                    const isFree = status === "free";

                    return (
                      <td key={day.date}>
                        <button
                          className={`availability-cell schedule-cell schedule-cell--${status}${isSelected ? " is-selected" : ""}`}
                          type="button"
                          aria-pressed={isSelected}
                          aria-label={`${day.date} ${slot.label}: ${STATUS_LABELS[status]}`}
                          data-date={day.date}
                          data-start={slot.minutes}
                          disabled={!isFree}
                          onPointerDown={(event) =>
                            onPointerDown(day.date, slot.minutes, event)
                          }
                          onPointerOver={(event) =>
                            onPointerOver(day.date, slot.minutes, event)
                          }
                          onClick={(event) =>
                            onClick(day.date, slot.minutes, event)
                          }
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
      )}
    </section>
  );
}
