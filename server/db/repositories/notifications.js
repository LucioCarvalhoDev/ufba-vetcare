import { nowIso } from "../helpers.js";

function mapNotificationRow(row) {
  return {
    id: row.id,
    userId: row.user_id,
    eventType: row.event_type,
    appointmentId: row.appointment_id,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    readAt: row.read_at,
  };
}

export function createNotificationsRepository(connection) {
  const selectNotifications = connection.prepare(
    `SELECT id, user_id, event_type, appointment_id, title, description,
            created_at, read_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC, id DESC`,
  );
  const selectNotification = connection.prepare(
    `SELECT id, user_id, event_type, appointment_id, title, description,
            created_at, read_at
     FROM notifications
     WHERE user_id = ? AND id = ?`,
  );
  const selectUnreadCount = connection.prepare(
    `SELECT COUNT(*) AS total
     FROM notifications
     WHERE user_id = ? AND read_at IS NULL`,
  );
  const markNotificationRead = connection.prepare(
    `UPDATE notifications
     SET read_at = ?
     WHERE user_id = ? AND id = ? AND read_at IS NULL`,
  );
  const markAllNotificationsRead = connection.prepare(
    `UPDATE notifications
     SET read_at = ?
     WHERE user_id = ? AND read_at IS NULL`,
  );

  return {
    listNotifications(userId) {
      return selectNotifications
        .all(userId)
        .map(mapNotificationRow);
    },

    countUnreadNotifications(userId) {
      return Number(selectUnreadCount.get(userId).total);
    },

    markNotificationAsRead(userId, notificationId) {
      markNotificationRead.run(nowIso(), userId, notificationId);
      const row = selectNotification.get(userId, notificationId);
      return row ? mapNotificationRow(row) : null;
    },

    markAllNotificationsAsRead(userId) {
      return Number(markAllNotificationsRead.run(nowIso(), userId).changes);
    },
  };
}
