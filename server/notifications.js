function publicNotification(notification) {
  return {
    id: notification.id,
    eventType: notification.eventType,
    title: notification.title,
    description: notification.description,
    createdAt: notification.createdAt,
    readAt: notification.readAt,
    isRead: notification.readAt !== null,
    appointmentId: notification.appointmentId,
  };
}

/**
 * @param {{
 *   database: object,
 *   requirePermission: Function,
 *   isSameOriginRequest: Function,
 *   sendJson: Function,
 *   HttpError: Function,
 * }} context
 */
export function createNotificationsRouter({
  database,
  requirePermission,
  isSameOriginRequest,
  sendJson,
  HttpError,
}) {
  return function handleNotifications(req, res, pathname) {
    if (pathname === "/api/notifications") {
      if (req.method !== "GET") {
        throw new HttpError(
          405,
          "method_not_allowed",
          "Método não permitido.",
        );
      }

      const authUser = requirePermission(req, res, "notifications.manage");
      const notifications = database.listNotifications(authUser.id);

      return sendJson(res, 200, {
        notifications: notifications.map(publicNotification),
        unreadCount: database.countUnreadNotifications(authUser.id),
      });
    }

    if (pathname === "/api/notifications/read-all") {
      if (req.method !== "POST") {
        throw new HttpError(
          405,
          "method_not_allowed",
          "Método não permitido.",
        );
      }

      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, "notifications.manage");
      const updatedCount = database.markAllNotificationsAsRead(authUser.id);

      return sendJson(res, 200, { updatedCount });
    }

    const readMatch = pathname.match(
      /^\/api\/notifications\/([^/]+)\/read$/,
    );

    if (readMatch) {
      if (req.method !== "PATCH") {
        throw new HttpError(
          405,
          "method_not_allowed",
          "Método não permitido.",
        );
      }

      if (!isSameOriginRequest(req)) {
        throw new HttpError(403, "forbidden_origin", "Origem não autorizada.");
      }

      const authUser = requirePermission(req, res, "notifications.manage");
      let notificationId;

      try {
        notificationId = decodeURIComponent(readMatch[1]);
      } catch {
        throw new HttpError(
          400,
          "invalid_notification_id",
          "Identificador inválido.",
        );
      }

      const notification = database.markNotificationAsRead(
        authUser.id,
        notificationId,
      );

      if (!notification) {
        throw new HttpError(
          404,
          "notification_not_found",
          "Notificação não encontrada.",
        );
      }

      return sendJson(res, 200, {
        notification: publicNotification(notification),
      });
    }

    throw new HttpError(404, "not_found", "Rota não encontrada.");
  };
}
