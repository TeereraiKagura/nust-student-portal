// Results capture for lecturers (role ACADEMIC). Marks are saved as drafts and only
// become visible to students when the course's results are published.
const express = require('express');
const { gradeFor } = require('../../lib/grading');
const { audit } = require('../../lib/audit');

const router = express.Router();

function findSemesterAndCourse(db, semesterId, courseCode) {
  const semester = typeof semesterId === 'string'
    ? db.prepare('SELECT id, label FROM semesters WHERE id = ?').get(semesterId) : undefined;
  const course = typeof courseCode === 'string'
    ? db.prepare('SELECT code, name, level FROM courses WHERE code = ?').get(courseCode) : undefined;
  return { semester, course };
}

// The class list: students registered for the course that semester, plus anyone who
// already has a result for it (older results were loaded without registrations).
const CLASS_LIST_SQL = `
  SELECT s.id, s.student_number, s.first_name, s.last_name,
         r.id AS result_id, r.mark, r.published
  FROM students s
  LEFT JOIN results r
    ON r.student_id = s.id AND r.course_code = @course AND r.semester_id = @semester
  WHERE r.id IS NOT NULL
     OR s.id IN (SELECT student_id FROM registrations WHERE course_code = @course AND semester_id = @semester)
  ORDER BY s.student_number`;

const classList = (db, course, semester) =>
  db.prepare(CLASS_LIST_SQL).all({ course: course.code, semester: semester.id });

router.get('/options', (req, res) => {
  const semesters = req.db
    .prepare('SELECT id, label, is_current FROM semesters ORDER BY starts_on DESC')
    .all()
    .map((s) => ({ id: s.id, label: s.label, isCurrent: s.is_current === 1 }));
  const courses = req.db
    .prepare('SELECT code, name, level FROM courses ORDER BY level, code')
    .all();
  res.json({ semesters, courses });
});

router.get('/', (req, res) => {
  const { semester, course } = findSemesterAndCourse(req.db, req.query.semester, req.query.course);
  if (!semester || !course) return res.status(404).json({ error: 'Choose a valid semester and course.' });

  const students = classList(req.db, course, semester).map((r) => ({
    studentNumber: r.student_number,
    name: `${r.first_name} ${r.last_name}`,
    mark: r.mark,
    grade: r.mark === null ? null : gradeFor(r.mark).grade,
    status: r.result_id === null ? 'NONE' : r.published ? 'PUBLISHED' : 'DRAFT',
  }));

  res.json({
    semester,
    course,
    students,
    drafts: students.filter((s) => s.status === 'DRAFT').length,
  });
});

/** Saves marks as drafts. Body: { semesterId, courseCode, marks: [{ studentNumber, mark|null }] } */
router.put('/', (req, res) => {
  const { semesterId, courseCode, marks } = req.body ?? {};
  const { semester, course } = findSemesterAndCourse(req.db, semesterId, courseCode);
  if (!semester || !course) return res.status(404).json({ error: 'Choose a valid semester and course.' });

  if (!Array.isArray(marks) || marks.length === 0 || marks.length > 1000) {
    return res.status(400).json({ error: 'marks must be a non-empty list.' });
  }
  for (const m of marks) {
    if (typeof m?.studentNumber !== 'string') {
      return res.status(400).json({ error: 'Every mark needs a studentNumber.' });
    }
    if (m.mark !== null && !(Number.isInteger(m.mark) && m.mark >= 0 && m.mark <= 100)) {
      return res.status(400).json({
        error: `Mark for ${m.studentNumber} must be a whole number from 0 to 100, or blank.`,
      });
    }
  }

  const byNumber = new Map(classList(req.db, course, semester).map((r) => [r.student_number, r]));
  const outsiders = marks.filter((m) => !byNumber.has(m.studentNumber)).map((m) => m.studentNumber);
  if (outsiders.length) {
    return res.status(400).json({ error: `Not registered for ${course.code}: ${outsiders.join(', ')}` });
  }

  let changed = 0;
  req.db.transaction(() => {
    const insert = req.db.prepare(
      `INSERT INTO results (student_id, course_code, semester_id, mark, published, updated_by, updated_at)
       VALUES (?, ?, ?, ?, 0, ?, datetime('now'))`
    );
    const update = req.db.prepare(
      `UPDATE results SET mark = ?, published = 0, updated_by = ?, updated_at = datetime('now') WHERE id = ?`
    );
    const remove = req.db.prepare('DELETE FROM results WHERE id = ?');

    for (const m of marks) {
      const row = byNumber.get(m.studentNumber);
      if (m.mark === null) {
        if (row.result_id !== null) { remove.run(row.result_id); changed++; }
      } else if (row.result_id === null) {
        insert.run(row.id, course.code, semester.id, m.mark, req.staff.id);
        changed++;
      } else if (row.mark !== m.mark) {
        // Changing a published mark takes it back to draft until it's re-published.
        update.run(m.mark, req.staff.id, row.result_id);
        changed++;
      }
    }
    if (changed) {
      audit(req.db, req.staff.id, 'RESULTS_SAVED', `${course.code}, ${semester.label}: ${changed} mark(s) changed`);
    }
  })();

  res.json({ changed });
});

/** Publishes all draft marks for a course and notifies each affected student. */
router.post('/publish', (req, res) => {
  const { semesterId, courseCode } = req.body ?? {};
  const { semester, course } = findSemesterAndCourse(req.db, semesterId, courseCode);
  if (!semester || !course) return res.status(404).json({ error: 'Choose a valid semester and course.' });

  const drafts = req.db
    .prepare('SELECT student_id FROM results WHERE course_code = ? AND semester_id = ? AND published = 0')
    .all(course.code, semester.id);
  if (drafts.length === 0) {
    return res.status(409).json({ error: 'There are no draft marks to publish.' });
  }

  req.db.transaction(() => {
    req.db
      .prepare('UPDATE results SET published = 1 WHERE course_code = ? AND semester_id = ? AND published = 0')
      .run(course.code, semester.id);
    const message = req.db.prepare('INSERT INTO messages (student_id, subject, body) VALUES (?, ?, ?)');
    for (const d of drafts) {
      message.run(d.student_id, `Results published: ${course.code}`,
        `Your ${semester.label} result for ${course.code} ${course.name} is now available under Examinations Results.`);
    }
    audit(req.db, req.staff.id, 'RESULTS_PUBLISHED', `${course.code}, ${semester.label}: ${drafts.length} result(s)`);
  })();

  res.json({ published: drafts.length });
});

module.exports = { staffResultsRouter: router };
