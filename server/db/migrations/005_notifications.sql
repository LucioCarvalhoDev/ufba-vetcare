CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (
    event_type IN (
      'appointment_created',
      'appointment_updated',
      'appointment_cancelled'
    )
  ),
  appointment_id TEXT REFERENCES appointments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created_at
  ON notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_read_at
  ON notifications(user_id, read_at);
