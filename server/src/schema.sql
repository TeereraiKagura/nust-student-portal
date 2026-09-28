-- NUST Student Portal schema (SQLite). Money is stored in cents to avoid floating-point errors.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS programmes (
  code     TEXT PRIMARY KEY,
  name     TEXT NOT NULL,
  faculty  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semesters (
  id                 TEXT PRIMARY KEY,
  label              TEXT NOT NULL,
  starts_on          TEXT NOT NULL,
  ends_on            TEXT NOT NULL,
  is_current         INTEGER NOT NULL DEFAULT 0 CHECK (is_current IN (0, 1)),
  registration_open  INTEGER NOT NULL DEFAULT 0 CHECK (registration_open IN (0, 1))
);

CREATE TABLE IF NOT EXISTS students (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  student_number  TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  national_id     TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  country         TEXT,
  phone           TEXT,
  email           TEXT,
  gender          TEXT CHECK (gender IN ('Male', 'Female')),
  date_of_birth   TEXT,
  place_of_birth  TEXT,
  programme_code  TEXT NOT NULL REFERENCES programmes(code),
  level           TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS courses (
  code            TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  credits         INTEGER NOT NULL CHECK (credits > 0),
  programme_code  TEXT NOT NULL REFERENCES programmes(code),
  level           TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'CORE' CHECK (type IN ('CORE', 'ELECTIVE'))
);

CREATE TABLE IF NOT EXISTS registrations (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code    TEXT NOT NULL REFERENCES courses(code),
  semester_id    TEXT NOT NULL REFERENCES semesters(id),
  registered_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (student_id, course_code, semester_id)
);

CREATE TABLE IF NOT EXISTS results (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code  TEXT NOT NULL REFERENCES courses(code),
  semester_id  TEXT NOT NULL REFERENCES semesters(id),
  mark         INTEGER NOT NULL CHECK (mark BETWEEN 0 AND 100),
  UNIQUE (student_id, course_code, semester_id)
);

CREATE TABLE IF NOT EXISTS assessments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id   INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  course_code  TEXT NOT NULL REFERENCES courses(code),
  semester_id  TEXT NOT NULL REFERENCES semesters(id),
  title        TEXT NOT NULL,
  mark         REAL NOT NULL CHECK (mark >= 0),
  max_mark     REAL NOT NULL CHECK (max_mark > 0)
);

CREATE TABLE IF NOT EXISTS exam_timetable (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code     TEXT NOT NULL REFERENCES courses(code),
  semester_id     TEXT NOT NULL REFERENCES semesters(id),
  exam_date       TEXT NOT NULL,
  start_time      TEXT NOT NULL,
  duration_hours  REAL NOT NULL,
  venue           TEXT NOT NULL,
  UNIQUE (course_code, semester_id)
);

CREATE TABLE IF NOT EXISTS fee_items (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  semester_id   TEXT NOT NULL REFERENCES semesters(id),
  description   TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL CHECK (amount_cents >= 0)
);

CREATE TABLE IF NOT EXISTS payments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id    INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  semester_id   TEXT NOT NULL REFERENCES semesters(id),
  reference     TEXT NOT NULL UNIQUE,
  method        TEXT NOT NULL CHECK (method IN ('ECOCASH', 'FBC_ONLINE', 'BANK')),
  amount_cents  INTEGER NOT NULL CHECK (amount_cents > 0),
  status        TEXT NOT NULL CHECK (status IN ('SUCCESS', 'PENDING', 'FAILED')),
  paid_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS enquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id  INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category    TEXT NOT NULL,
  subject     TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registrations_student ON registrations(student_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_results_student       ON results(student_id);
CREATE INDEX IF NOT EXISTS idx_assessments_student   ON assessments(student_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_payments_student      ON payments(student_id, semester_id);
CREATE INDEX IF NOT EXISTS idx_messages_student      ON messages(student_id);
CREATE INDEX IF NOT EXISTS idx_enquiries_student     ON enquiries(student_id);
