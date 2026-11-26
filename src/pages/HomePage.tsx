import { useEffect, useRef, useState } from "react";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "../lib/api";
import { APP_VERSION } from "../lib/version";
import type {
  Notification,
  NotificationEventType,
} from "../types/notifications";

type NotificationTone = "blue" | "green" | "amber" | "red";

type NoticeItem = {
  title: string;
  description: string;
  tone: "amber" | "blue" | "green";
};

type NotificationLoadState = "loading" | "success" | "error";
type PendingAction =
  | { type: "notification"; id: string }
  | { type: "all" }
  | null;

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

const NOTIFICATION_TONES: Record<NotificationEventType, NotificationTone> = {
  appointment_created: "green",
  appointment_updated: "blue",
  appointment_cancelled: "red",
};

function getRelativeTime(createdAt: string): string {
  const timestamp = Date.parse(createdAt);

  if (!Number.isFinite(timestamp)) {
    return "Data indisponível";
  }

  const elapsedMinutes = Math.max(
    0,
    Math.floor((Date.now() - timestamp) / 60_000),
  );

  if (elapsedMinutes === 0) {
    return "agora";
  }

  if (elapsedMinutes < 60) {
    return `há ${elapsedMinutes} min`;
  }

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) {
    return `há ${elapsedHours} h`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return elapsedDays === 1 ? "ontem" : `há ${elapsedDays} dias`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadState, setLoadState] = useState<NotificationLoadState>("loading");
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [reloadAttempt, setReloadAttempt] = useState(0);
  const isActionPending = useRef(false);

  useEffect(() => {
    let isActive = true;
    setLoadState("loading");
    setLoadError("");

    fetchNotifications()
      .then((response) => {
        if (!isActive) {
          return;
        }

        setNotifications(response.notifications);
        setUnreadCount(response.unreadCount);
        setLoadState("success");
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setLoadError(
          getErrorMessage(
            error,
            "Não foi possível carregar as notificações.",
          ),
        );
        setLoadState("error");
      });

    return () => {
      isActive = false;
    };
  }, [reloadAttempt]);

  async function handleMarkNotificationAsRead(notification: Notification) {
    if (notification.isRead || isActionPending.current) {
      return;
    }

    isActionPending.current = true;
    setPendingAction({ type: "notification", id: notification.id });
    setActionError("");

    try {
      const response = await markNotificationAsRead(notification.id);
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? response.notification : item,
        ),
      );

      if (response.notification.isRead) {
        setUnreadCount((current) => Math.max(0, current - 1));
      }
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(
          error,
          "Não foi possível marcar a notificação como lida.",
        ),
      );
    } finally {
      isActionPending.current = false;
      setPendingAction(null);
    }
  }

  async function handleMarkAllAsRead() {
    if (unreadCount === 0 || isActionPending.current) {
      return;
    }

    isActionPending.current = true;
    setPendingAction({ type: "all" });
    setActionError("");

    try {
      const response = await markAllNotificationsAsRead();
      setNotifications((current) =>
        current.map((notification) =>
          notification.isRead
            ? notification
            : { ...notification, isRead: true },
        ),
      );
      setUnreadCount((current) =>
        Math.max(0, current - response.updatedCount),
      );

      try {
        const refreshed = await fetchNotifications();
        setNotifications(refreshed.notifications);
        setUnreadCount(refreshed.unreadCount);
      } catch (error: unknown) {
        setActionError(
          getErrorMessage(
            error,
            "As notificações foram marcadas, mas não foi possível atualizar a lista.",
          ),
        );
      }
    } catch (error: unknown) {
      setActionError(
        getErrorMessage(error, "Não foi possível marcar todas como lidas."),
      );
    } finally {
      isActionPending.current = false;
      setPendingAction(null);
    }
  }

  const unreadLabel =
    loadState === "loading"
      ? "..."
      : loadState === "error"
        ? "—"
        : `${unreadCount} ${unreadCount === 1 ? "nova" : "novas"}`;

  return (
    <div className="home__grid">
      <section
        className="card notifications"
        id="notifications"
        aria-labelledby="notifications-title"
        aria-busy={loadState === "loading"}
      >
        <header className="card__header card__header--notifications">
          <div className="card__heading">
            <h2 id="notifications-title">Notificações</h2>
            <span className="badge">{unreadLabel}</span>
          </div>
          <button
            className="card__action"
            type="button"
            onClick={handleMarkAllAsRead}
            disabled={
              loadState !== "success" ||
              unreadCount === 0 ||
              pendingAction !== null
            }
          >
            {pendingAction?.type === "all"
              ? "Marcando..."
              : "Marcar todas como lidas"}
          </button>
        </header>

        {actionError ? (
          <p className="notifications__feedback" role="alert">
            {actionError}
          </p>
        ) : null}

        <ul className="notifications__list">
          {loadState === "loading" ? (
            <li className="notifications__state" role="status">
              Carregando notificações...
            </li>
          ) : null}

          {loadState === "error" ? (
            <li className="notifications__state">
              <p role="alert">{loadError}</p>
              <button
                className="notifications__retry"
                type="button"
                onClick={() => setReloadAttempt((current) => current + 1)}
              >
                Tentar novamente
              </button>
            </li>
          ) : null}

          {loadState === "success" && notifications.length === 0 ? (
            <li className="notifications__state">
              Não existem notificações no momento.
            </li>
          ) : null}

          {loadState === "success"
            ? notifications.map((notification) => {
                const tone = NOTIFICATION_TONES[notification.eventType];
                const isPending =
                  pendingAction?.type === "notification" &&
                  pendingAction.id === notification.id;

                return (
                  <li
                    className={`notification${notification.isRead ? " notification--read" : " notification--unread"}`}
                    key={notification.id}
                  >
                    <span
                      className={`notification__dot notification__dot--${tone}${notification.isRead ? " notification__dot--read" : ""}`}
                      aria-hidden="true"
                    />
                    <div className="notification__body">
                      <div className="notification__headline">
                        <h3>{notification.title}</h3>
                        <span className="notification__time">
                          {getRelativeTime(notification.createdAt)}
                        </span>
                      </div>
                      <p>{notification.description}</p>
                      <div className="notification__actions">
                        <span
                          className={`notification__read-status${notification.isRead ? " notification__read-status--read" : " notification__read-status--unread"}`}
                        >
                          {notification.isRead ? "Lida" : "Não lida"}
                        </span>
                        {!notification.isRead ? (
                          <button
                            className="notification__read-action"
                            type="button"
                            disabled={pendingAction !== null}
                            aria-label={`Marcar notificação "${notification.title}" como lida`}
                            onClick={() =>
                              handleMarkNotificationAsRead(notification)
                            }
                          >
                            {isPending ? "Salvando..." : "Marcar como lida"}
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })
            : null}
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
