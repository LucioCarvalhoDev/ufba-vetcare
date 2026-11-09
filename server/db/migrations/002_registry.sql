CREATE TABLE IF NOT EXISTS tutors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cpf TEXT UNIQUE,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS animals (
  id TEXT PRIMARY KEY,
  tutor_id TEXT NOT NULL REFERENCES tutors(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  species TEXT NOT NULL,
  breed TEXT,
  sex TEXT NOT NULL DEFAULT 'unknown' CHECK (sex IN ('male', 'female', 'unknown')),
  birth_date TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tutors_name ON tutors(name);
CREATE INDEX IF NOT EXISTS idx_tutors_cpf ON tutors(cpf);
CREATE INDEX IF NOT EXISTS idx_animals_tutor_id ON animals(tutor_id);
CREATE INDEX IF NOT EXISTS idx_animals_name ON animals(name);
