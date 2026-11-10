import { useEffect, useMemo, useState } from "react";
import { fetchClinicDashboard } from "../lib/api";
import type { ClinicDashboard } from "../types/dashboard";
import "./ClinicDashboardPage.css";

const CHART_COLORS = ["#4caf96", "#ff9d59", "#7598bd", "#a78bca", "#e77878"];
const MONTHS_SHORT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

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
  return new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function MonthlyConsultationsChart({
  values,
}: {
  values: ClinicDashboard["monthlyConsultations"];
}) {
  const maximum = Math.max(1, ...values.map((item) => item.count));
  const points = values.map((item, index) => {
    const x = values.length < 2 ? 280 : (index / (values.length - 1)) * 560;
    const y = 158 - (item.count / maximum) * 138;
    return { ...item, x, y };
  });
  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="clinic-chart">
      <svg
        className="clinic-chart__svg"
        viewBox="0 0 560 180"
        role="img"
        aria-label="Consultas realizadas por mês nos últimos dez meses"
        preserveAspectRatio="none"
      >
        {[20, 66, 112, 158].map((y) => (
          <line
            key={y}
            x1="0"
            x2="560"
            y1={y}
            y2={y}
            className="clinic-chart__gridline"
          />
        ))}
        <polyline points={polyline} className="clinic-chart__line" />
        {points.map((point) => (
          <circle
            key={point.month}
            cx={point.x}
            cy={point.y}
            r="3.5"
            className="clinic-chart__point"
          >
            <title>
              {`${MONTHS_SHORT[Number(point.month.slice(5)) - 1]}: ${formatNumber(point.count)} consultas`}
            </title>
          </circle>
        ))}
      </svg>
      <div className="clinic-chart__labels" aria-hidden="true">
        {values.map((item) => (
          <span key={item.month}>
            {MONTHS_SHORT[Number(item.month.slice(5)) - 1]}
          </span>
        ))}
      </div>
    </div>
  );
}

function SpeciesChart({
  values,
}: {
  values: ClinicDashboard["speciesDistribution"];
}) {
  const total = values.reduce((sum, item) => sum + item.count, 0);
  let accumulated = 0;
  const segments = values.map((item, index) => {
    const start = accumulated;
    accumulated += total ? (item.count / total) * 100 : 0;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start}% ${accumulated}%`;
  });

  return (
    <div className="clinic-species">
      {total > 0 ? (
        <div
          className="clinic-species__donut"
          role="img"
          aria-label={`Distribuição de ${formatNumber(total)} pacientes por espécie`}
          style={{ background: `conic-gradient(${segments.join(", ")})` }}
        >
          <div className="clinic-species__center">Espécies</div>
        </div>
      ) : (
        <div className="clinic-species__empty">Nenhum paciente cadastrado</div>
      )}
      {total > 0 && (
        <ul className="clinic-species__legend">
          {values.map((item, index) => (
            <li key={item.species}>
              <span
                className="clinic-species__swatch"
                style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                aria-hidden="true"
              />
              <span>{item.species}</span>
              <strong>{Math.round((item.count / total) * 100)}%</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ClinicDashboardPage() {
  const [selectedMonth, setSelectedMonth] = useState(() =>
    monthKey(new Date()),
  );
  const [dashboard, setDashboard] = useState<ClinicDashboard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryVersion, setRetryVersion] = useState(0);
  const currentMonth = useMemo(() => monthKey(new Date()), []);
  const selectedDashboard =
    dashboard?.month === selectedMonth ? dashboard : null;

  useEffect(() => {
    let isActive = true;
    setIsLoading(true);
    setError(null);

    fetchClinicDashboard({ month: selectedMonth })
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
              : "Não foi possível carregar o dashboard da clínica.",
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
  }, [retryVersion, selectedMonth]);

  const metrics = selectedDashboard
    ? [
        {
          key: "patients",
          label: "Total de Pacientes",
          value: selectedDashboard.metrics.activePatients,
          note: "Pacientes ativos",
        },
        {
          key: "consultations",
          label: "Consultas do Mês",
          value: selectedDashboard.metrics.consultationsThisMonth,
          note: monthLabel(selectedMonth),
        },
        {
          key: "tutors",
          label: "Tutores Ativos",
          value: selectedDashboard.metrics.activeTutors,
          note: "Cadastros ativos",
        },
        {
          key: "vaccinations",
          label: "Vacinas Pendentes",
          value: selectedDashboard.metrics.pendingVaccinations,
          note: "Agendamentos futuros",
        },
      ]
    : [];

  return (
    <section className="clinic-dashboard" aria-busy={isLoading}>
      <header className="clinic-dashboard__intro">
        <div>
          <h2>Visão geral</h2>
          <p>Acompanhe a saúde da sua operação.</p>
        </div>
        <div className="clinic-dashboard__month">
          <button
            type="button"
            onClick={() => setSelectedMonth((value) => shiftMonth(value, -1))}
            aria-label="Mês anterior"
          >
            ‹
          </button>
          <span>{monthLabel(selectedMonth)}</span>
          <button
            type="button"
            onClick={() => setSelectedMonth((value) => shiftMonth(value, 1))}
            aria-label="Próximo mês"
            disabled={selectedMonth >= currentMonth}
          >
            ›
          </button>
        </div>
      </header>

      {error && (
        <div className="clinic-dashboard__error" role="alert">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryVersion((value) => value + 1)}
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!selectedDashboard && isLoading && (
        <div className="clinic-dashboard__state" role="status">
          Carregando indicadores...
        </div>
      )}

      {selectedDashboard && (
        <>
          <div className="clinic-dashboard__metrics">
            {metrics.map((metric) => (
              <article
                className="clinic-metric"
                key={metric.key}
                aria-label={`${metric.label}: ${formatNumber(metric.value)}`}
              >
                <div className="clinic-metric__top">
                  <span>{metric.label}</span>
                  <span className={`clinic-metric__icon clinic-metric__icon--${metric.key}`} aria-hidden="true">
                    {metric.key === "patients" && "✣"}
                    {metric.key === "consultations" && "♡"}
                    {metric.key === "tutors" && "♙"}
                    {metric.key === "vaccinations" && "✚"}
                  </span>
                </div>
                <strong>{formatNumber(metric.value)}</strong>
                <small>{metric.note}</small>
              </article>
            ))}
          </div>

          <div className="clinic-dashboard__charts">
            <section
              className="clinic-card clinic-card--consultations"
              aria-labelledby="clinic-consultations-title"
            >
              <header className="clinic-card__header">
                <div>
                  <h3 id="clinic-consultations-title">Consultas por mês</h3>
                  <p>Últimos dez meses até {monthLabel(selectedMonth)}</p>
                </div>
              </header>
              <MonthlyConsultationsChart
                values={selectedDashboard.monthlyConsultations}
              />
            </section>

            <section
              className="clinic-card clinic-card--species"
              aria-labelledby="clinic-species-title"
            >
              <header className="clinic-card__header">
                <h3 id="clinic-species-title">Pacientes por espécie</h3>
              </header>
              <SpeciesChart values={selectedDashboard.speciesDistribution} />
            </section>
          </div>
        </>
      )}
    </section>
  );
}
