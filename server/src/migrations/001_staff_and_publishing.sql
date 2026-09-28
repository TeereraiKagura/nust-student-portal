-- v0.2: staff accounts, draft/published results, audit trail.

CREATE TABLE staff (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_number   TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  first_name     TEXT NOT NULL,
  last_name      TEXT NOT NULL,
  email          TEXT,
  role           TEXT NOT NULL CHECK (role IN ('ACADEMIC', 'BURSARY', 'ADMIN')),
  is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Existing results stay visible (published = 1); marks captured by staff start as drafts.
ALTER TABLE results ADD COLUMN published INTEGER NOT NULL DEFAULT 1 CHECK (published IN (0, 1));
ALTER TABLE results ADD COLUMN updated_by INTEGER REFERENCES staff(id);
ALTER TABLE results ADD COLUMN updated_at TEXT;

ALTER TABLE payments ADD COLUMN recorded_by INTEGER REFERENCES staff(id);

CREATE TABLE audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  staff_id    INTEGER NOT NULL REFERENCES staff(id),
  action      TEXT NOT NULL,
  details     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_results_course ON results(course_code, semester_id);
CREATE INDEX idx_audit_created  ON audit_log(created_at);
