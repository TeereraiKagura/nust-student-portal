const express = require('express');
const { currentSemester } = require('../db');
const { COURSES_REQUIRED, validateSelection } = require('../lib/registrationRules');
const { studentResults } = require('../lib/results');
const { semesterDto } = require('./student');

const router = express.Router();

function availableCourses(db, studentId) {
  return db
    .prepare(`SELECT c.code, c.name, c.type, c.credits
              FROM courses c JOIN students s
                ON s.programme_code = c.programme_code AND s.level = c.level
              WHERE s.id = ?
              ORDER BY c.type, c.code`)
    .all(studentId);
}

function registeredCodes(db, studentId, semesterId) {
  return db
    .prepare('SELECT course_code FROM registrations WHERE student_id = ? AND semester_id = ?')
    .all(studentId, semesterId)
    .map((r) => r.course_code);
}

/** Once any mark exists for the semester, the student's six courses are fixed. */
function hasMarks(db, studentId, semesterId) {
  return db
    .prepare('SELECT 1 FROM results WHERE student_id = ? AND semester_id = ? LIMIT 1')
    .get(studentId, semesterId) !== undefined;
}

// ---- Registration -------------------------------------------------------

router.get('/registration', (req, res) => {
  const id = req.session.studentId;
  const semester = currentSemester(req.db);
  const registered = new Set(registeredCodes(req.db, id, semester.id));

  res.json({
    semester: semesterDto(semester),
    required: COURSES_REQUIRED,
    isRegistered: registered.size > 0,
    locked: hasMarks(req.db, id, semester.id),
    courses: availableCourses(req.db, id).map((c) => ({ ...c, registered: registered.has(c.code) })),
  });
});

router.post('/registration', (req, res) => {
  const id = req.session.studentId;
  const semester = currentSemester(req.db);
  if (!semester.registration_open) {
    return res.status(409).json({ error: `Registration for ${semester.label} is closed.` });
  }
  if (hasMarks(req.db, id, semester.id)) {
    return res.status(409).json({ error: 'Marks have already been entered for your courses, so your registration can no longer be changed.' });
  }

  const { courseCodes } = req.body ?? {};
  if (!Array.isArray(courseCodes) || !courseCodes.every((c) => typeof c === 'string')) {
    return res.status(400).json({ error: 'courseCodes must be a list of course codes.' });
  }

  const result = validateSelection(availableCourses(req.db, id), courseCodes);
  if (!result.ok) return res.status(400).json({ error: result.error });

  // Replace the whole selection atomically: either every row is saved or none are.
  const save = req.db.transaction((codes) => {
    req.db.prepare('DELETE FROM registrations WHERE student_id = ? AND semester_id = ?').run(id, semester.id);
    const insert = req.db.prepare(
      'INSERT INTO registrations (student_id, course_code, semester_id) VALUES (?, ?, ?)'
    );
    for (const code of codes) insert.run(id, code, semester.id);
  });
  save([...new Set(courseCodes)]);

  res.json({ ok: true, credits: result.credits, semester: semester.label });
});

// ---- Results --------------------------------------------------------------

// Marks, failed courses and the overall remark (PASS / PROCEED CARRYING / REPEAT) per semester.
router.get('/results', (req, res) => {
  res.json(studentResults(req.db, req.session.studentId));
});

// ---- Continuous assessment ----------------------------------------------

router.get('/assessments', (req, res) => {
  const semester = currentSemester(req.db);
  const rows = req.db
    .prepare(`SELECT a.course_code AS code, c.name, a.title, a.mark, a.max_mark
              FROM assessments a JOIN courses c ON c.code = a.course_code
              WHERE a.student_id = ? AND a.semester_id = ?
              ORDER BY a.course_code, a.id`)
    .all(req.session.studentId, semester.id);

  const courses = [];
  for (const row of rows) {
    let course = courses.find((c) => c.code === row.code);
    if (!course) {
      course = { code: row.code, name: row.name, items: [] };
      courses.push(course);
    }
    course.items.push({
      title: row.title,
      mark: row.mark,
      maxMark: row.max_mark,
      percent: Math.round((row.mark / row.max_mark) * 1000) / 10,
    });
  }
  for (const c of courses) {
    const total = c.items.reduce((s, i) => s + i.mark, 0);
    const max = c.items.reduce((s, i) => s + i.maxMark, 0);
    c.percent = Math.round((total / max) * 1000) / 10;
  }

  res.json({ semester: semesterDto(semester), courses });
});

// ---- Exam timetable -------------------------------------------------------

router.get('/timetable', (req, res) => {
  const semester = currentSemester(req.db);
  const exams = req.db
    .prepare(`SELECT e.course_code AS code, c.name, e.exam_date AS date, e.start_time AS startTime,
                     e.duration_hours AS durationHours, e.venue
              FROM exam_timetable e
              JOIN courses c ON c.code = e.course_code
              JOIN registrations r ON r.course_code = e.course_code AND r.semester_id = e.semester_id
              WHERE r.student_id = ? AND e.semester_id = ?
              ORDER BY e.exam_date, e.start_time`)
    .all(req.session.studentId, semester.id);

  res.json({ semester: semesterDto(semester), exams });
});

module.exports = { academicsRouter: router };
