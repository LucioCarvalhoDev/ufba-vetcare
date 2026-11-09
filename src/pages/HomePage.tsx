import { APP_VERSION } from "../lib/version";

type NotificationTone = "blue" | "green" | "amber" | "red";

type NotificationItem = {
  title: string;
  description: string;
  time: string;
  tone: NotificationTone;
};

type NoticeItem = {
  title: string;
  description: string;
  tone: "amber" | "blue" | "green";
};

const NOTIFICATIONS: NotificationItem[] = [
  {
    title: "Vacina de Thor vence em 3 dias",
    description: "Lembrete enviado ao tutor Mariana Souza.",
    time: "há 5 min",
    tone: "blue",
  },
  {
    title: "Consulta confirmada: Mia",
    description: "Carlos Lima confirmou a consulta das 08:45.",
    time: "há 20 min",
    tone: "green",
  },
  {
    title: "Pagamento pendente",
    description: "O atendimento de Luna aguarda registro de pagamento.",
    time: "há 1 h",
    tone: "amber",
  },
  {
    title: "Prontuário atualizado",
    description: "O prontuário de Bolinha foi atualizado pela Dra. Ana.",
    time: "há 2 h",
    tone: "blue",
  },
  {
    title: "Consulta cancelada",
    description: "Pedro Gomes cancelou a consulta das 15:00.",
    time: "há 3 h",
    tone: "red",
  },
  {
    title: "Estoque baixo",
    description: "Vacina antirrábica abaixo do nível mínimo.",
    time: "ontem",
    tone: "amber",
  },
];

const UPDATES = [
  "Nova agenda com visão diária, semanal e mensal",
  "Cadastro de tutores e pets integrado",
  "Prontuário e prescrições digitais",
  "Central de notificações para os tutores",
];

const NOTICES: NoticeItem[] = [
  {
    title: "Manutenção programada",
    description:
      "Sábado, 18/10, das 22h às 23h o sistema ficará indisponível.",
    tone: "amber",
  },
  {
    title: "Reunião de equipe",
    description: "Segunda-feira às 08h, na sala de reuniões.",
    tone: "blue",
  },
  {
    title: "Campanha de vacinação",
    description: "Antirrábica com 20% de desconto até 31/10.",
    tone: "green",
  },
];

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
    >
      <path
        d="m3.5 8.3 3 3.1 6-6.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  return (
    <div className="home__grid">
      <section
        className="card notifications"
        aria-labelledby="notifications-title"
      >
        <header className="card__header card__header--notifications">
          <div className="card__heading">
            <h2 id="notifications-title">Notificações</h2>
            <span className="badge">6 novas</span>
          </div>
          <a className="card__action" href="#notificacoes">
            Marcar todas como lidas
          </a>
        </header>

        <ul className="notifications__list">
          {NOTIFICATIONS.map((notification) => (
            <li className="notification" key={notification.title}>
              <span
                className={`notification__dot notification__dot--${notification.tone}`}
                aria-hidden="true"
              />
              <div className="notification__body">
                <div className="notification__headline">
                  <h3>{notification.title}</h3>
                  <span className="notification__time">
                    {notification.time}
                  </span>
                </div>
                <p>{notification.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="home__side">
        <section className="card updates" aria-labelledby="updates-title">
          <header className="card__header">
            <div className="card__heading">
              <h2 id="updates-title">Notas da Atualização</h2>
              <span className="badge">v{APP_VERSION}</span>
            </div>
          </header>

          <ul className="updates__list">
            {UPDATES.map((update) => (
              <li className="update" key={update}>
                <span className="check" aria-hidden="true">
                  <CheckIcon />
                </span>
                <span>{update}</span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card notices" aria-labelledby="notices-title">
          <header className="card__header">
            <h2 id="notices-title">Avisos da Clínica</h2>
          </header>

          <ul className="notices__list">
            {NOTICES.map((notice) => (
              <li className={`notice notice--${notice.tone}`} key={notice.title}>
                <div className="notice__content">
                  <h3>{notice.title}</h3>
                  <p>{notice.description}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
