CREATE TABLE IF NOT EXISTS appointments (
  id TEXT PRIMARY KEY,
  animal_id TEXT NOT NULL REFERENCES animals(id) ON DELETE RESTRICT,
  veterinarian_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('consultation', 'surgery', 'vaccination')),
  scheduled_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30 CHECK (duration_minutes BETWEEN 15 AND 480),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  notes TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_at ON appointments(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_veterinarian ON appointments(veterinarian_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_appointments_animal ON appointments(animal_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
