CREATE TABLE IF NOT EXISTS veterinarian_availability (
  id TEXT PRIMARY KEY,
  veterinarian_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_minutes INTEGER NOT NULL CHECK (
    start_minutes >= 0
    AND start_minutes <= 1410
    AND start_minutes % 30 = 0
  ),
  created_at TEXT NOT NULL,
  UNIQUE (veterinarian_id, weekday, start_minutes)
);

CREATE INDEX IF NOT EXISTS idx_vet_availability_veterinarian
  ON veterinarian_availability(veterinarian_id, weekday, start_minutes);
