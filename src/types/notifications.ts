export type NotificationEventType =
  | "appointment_created"
  | "appointment_updated"
  | "appointment_cancelled";

export type Notification = {
  id: string;
  eventType: NotificationEventType;
  title: string;
  description: string;
  createdAt: string;
  readAt: string | null;
  isRead: boolean;
  appointmentId: string | null;
};

export type NotificationListResponse = {
  notifications: Notification[];
  unreadCount: number;
};

export type NotificationReadResponse = {
  notification: Notification;
};

export type NotificationReadAllResponse = {
  updatedCount: number;
};
