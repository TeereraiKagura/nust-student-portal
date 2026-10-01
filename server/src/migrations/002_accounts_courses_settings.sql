-- v0.3: student self-registration and account status, lecturer ↔ course assignment, system settings.

-- Admins can deactivate a student account; existing students stay active.
ALTER TABLE students ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1));

-- Each course is taught (and marked) by one lecturer. NULL = not yet assigned (only admins can mark it).
ALTER TABLE courses ADD COLUMN lecturer_id INTEGER REFERENCES staff(id);
CREATE INDEX idx_courses_lecturer ON courses(lecturer_id);

-- System information that administrators can edit without touching code.
CREATE TABLE settings (
  key    TEXT PRIMARY KEY,
  value  TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES
  ('announcement', ''),
  ('helpdesk_contact', 'ICT Help Desk — helpdesk@example.ac.zw');
