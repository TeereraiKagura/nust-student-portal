// Administration (role ADMIN): manage users, courses and system information.
// Every change is written to the audit log in the same transaction as the change itself.
const express = require('express');
const { hashPassword, passwordPolicyError } = require('../../lib/passwords');
const { audit } = require('../../lib/audit');
const { offeredProgrammes } = require('../../lib/studentAccounts');
const { SETTINGS, getSettings, saveSetting } = require('../../lib/settings');
const {
  STAFF_NUMBER, PERSON_NAME, EMAIL, COURSE_CODE, LEVEL, SEMESTER_ID, isIsoDate, text,
} = require('../../lib/validation');
const { version } = require('../../../package.json');

const router = express.Router();

const ROLES = ['ACADEMIC', 'BURSARY', 'ADMIN'];
const ROLE_LABELS = { ACADEMIC: 'Lecturer', BURSARY: 'Bursary', ADMIN: 'Administrator' };
const bad = (res, error, status = 400) => res.status(status).json({ error });
const isFkError = (err) => err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
const isUniqueError = (err) => err.code === 'SQLITE_CONSTRAINT_UNIQUE' || err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';

// ============================================================================
// Users
// ============================================================================

router.get('/users', (req, res) => {
  const students = req.db
    .prepare(`SELECT s.student_number, s.first_name, s.last_name, s.email, s.programme_code, s.level,
                     s.is_active, s.created_at
              FROM students s ORDER BY s.student_number`)
    .all()
    .map((s) => ({
      studentNumber: s.student_number,
      name: `${s.first_name} ${s.last_name}`,
      email: s.email,
      programmeCode: s.programme_code,
      level: s.level,
      isActive: s.is_active === 1,
      createdAt: s.created_at,
    }));

  const staff = req.db
    .prepare(`SELECT st.staff_number, st.first_name, st.last_name, st.email, st.role, st.is_active,
                     (SELECT COUNT(*) FROM courses c WHERE c.lecturer_id = st.id) AS courses
              FROM staff st ORDER BY st.staff_number`)
    .all()
    .map((s) => ({
      staffNumber: s.staff_number,
      name: `${s.first_name} ${s.last_name}`,
      email: s.email,
      role: s.role,
      roleLabel: ROLE_LABELS[s.role],
      isActive: s.is_active === 1,
      courses: s.courses,
      isMe: s.staff_number === req.staff.staff_number,
    }));

  res.json({ students, staff, roles: ROLES.map((r) => ({ value: r, label: ROLE_LABELS[r] })), programmes: offeredProgrammes(req.db) });
});

router.post('/staff', (req, res) => {
  const body = req.body ?? {};
  const s = {
    staffNumber: text(body.staffNumber).toUpperCase(),
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    email: text(body.email).toLowerCase(),
    role: text(body.role),
    password: typeof body.password === 'string' ? body.password : '',
  };
  if (!STAFF_NUMBER.test(s.staffNumber)) return bad(res, 'Staff number must look like S2001.');
  if (!PERSON_NAME.test(s.firstName) || !PERSON_NAME.test(s.lastName)) return bad(res, 'Enter a first and last name.');
  if (s.email.length > 100 || !EMAIL.test(s.email)) return bad(res, 'Enter a valid email address.');
  if (!ROLES.includes(s.role)) return bad(res, 'Choose a role.');
  const passwordError = passwordPolicyError(s.password);
  if (passwordError) return bad(res, passwordError);

  try {
    req.db.transaction(() => {
      req.db
        .prepare(`INSERT INTO staff (staff_number, password_hash, first_name, last_name, email, role)
                  VALUES (?, ?, ?, ?, ?, ?)`)
        .run(s.staffNumber, hashPassword(s.password), s.firstName, s.lastName, s.email, s.role);
      audit(req.db, req.staff.id, 'STAFF_CREATED', `${s.staffNumber} ${s.firstName} ${s.lastName} (${ROLE_LABELS[s.role]})`);
    })();
  } catch (err) {
    if (isUniqueError(err)) return bad(res, 'That staff number is already in use.', 409);
    throw err;
  }
  res.status(201).json({ ok: true });
});

router.patch('/staff/:number', (req, res) => {
  const target = req.db.prepare('SELECT * FROM staff WHERE staff_number = ?').get(String(req.params.number).toUpperCase());
  if (!target) return bad(res, 'Staff member not found.', 404);

  const { role, isActive } = req.body ?? {};
  if (role !== undefined && !ROLES.includes(role)) return bad(res, 'Choose a valid role.');
  if (isActive !== undefined && typeof isActive !== 'boolean') return bad(res, 'isActive must be true or false.');
  // Stops an administrator locking themselves (and possibly everyone) out.
  if (target.id === req.staff.id && ((role && role !== target.role) || isActive === false)) {
    return bad(res, 'You cannot change your own role or deactivate your own account.');
  }

  const newRole = role ?? target.role;
  const newActive = isActive === undefined ? target.is_active : Number(isActive);
  const changes = [];
  if (newRole !== target.role) changes.push(`role ${ROLE_LABELS[target.role]} → ${ROLE_LABELS[newRole]}`);
  if (newActive !== target.is_active) changes.push(newActive ? 'activated' : 'deactivated');
  if (changes.length === 0) return res.json({ ok: true, unassignedCourses: 0 });

  let unassigned = 0;
  req.db.transaction(() => {
    req.db.prepare('UPDATE staff SET role = ?, is_active = ? WHERE id = ?').run(newRole, newActive, target.id);
    // Someone who is no longer an active lecturer can't keep teaching courses.
    if (newRole !== 'ACADEMIC' || !newActive) {
      unassigned = req.db.prepare('UPDATE courses SET lecturer_id = NULL WHERE lecturer_id = ?').run(target.id).changes;
      if (unassigned) changes.push(`${unassigned} course(s) unassigned`);
    }
    audit(req.db, req.staff.id, 'STAFF_UPDATED', `${target.staff_number}: ${changes.join(', ')}`);
  })();
  res.json({ ok: true, unassignedCourses: unassigned });
});

router.patch('/students/:number', (req, res) => {
  const target = req.db.prepare('SELECT * FROM students WHERE student_number = ?').get(String(req.params.number).toUpperCase());
  if (!target) return bad(res, 'Student not found.', 404);

  const { isActive, level } = req.body ?? {};
  if (isActive !== undefined && typeof isActive !== 'boolean') return bad(res, 'isActive must be true or false.');
  if (level !== undefined) {
    const programme = offeredProgrammes(req.db).find((p) => p.code === target.programme_code);
    if (!programme?.levels.includes(level)) return bad(res, 'Choose a level that offers six courses.');
  }

  const newActive = isActive === undefined ? target.is_active : Number(isActive);
  const newLevel = level ?? target.level;
  const changes = [];
  if (newActive !== target.is_active) changes.push(newActive ? 'activated' : 'deactivated');
  if (newLevel !== target.level) changes.push(`level ${target.level} → ${newLevel}`);
  if (changes.length === 0) return res.json({ ok: true });

  req.db.transaction(() => {
    req.db.prepare('UPDATE students SET is_active = ?, level = ? WHERE id = ?').run(newActive, newLevel, target.id);
    audit(req.db, req.staff.id, 'STUDENT_UPDATED', `${target.student_number}: ${changes.join(', ')}`);
  })();
  res.json({ ok: true });
});

function passwordReset(table, numberColumn, label) {
  return (req, res) => {
    const target = req.db
      .prepare(`SELECT id, ${numberColumn} AS number FROM ${table} WHERE ${numberColumn} = ?`)
      .get(String(req.params.number).toUpperCase());
    if (!target) return bad(res, `${label} not found.`, 404);

    const { newPassword } = req.body ?? {};
    if (typeof newPassword !== 'string') return bad(res, 'Enter a new password.');
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return bad(res, policyError);

    req.db.transaction(() => {
      req.db.prepare(`UPDATE ${table} SET password_hash = ? WHERE id = ?`).run(hashPassword(newPassword), target.id);
      audit(req.db, req.staff.id, 'PASSWORD_RESET', `${label} ${target.number}`); // never log the password
    })();
    res.json({ ok: true });
  };
}
router.post('/students/:number/password', passwordReset('students', 'student_number', 'Student'));
router.post('/staff/:number/password', passwordReset('staff', 'staff_number', 'Staff member'));

// ============================================================================
// Courses
// ============================================================================

router.get('/courses', (req, res) => {
  const courses = req.db
    .prepare(`SELECT c.code, c.name, c.credits, c.level, c.type, c.programme_code AS programmeCode,
                     st.staff_number AS lecturerNumber,
                     CASE WHEN st.id IS NULL THEN NULL ELSE st.first_name || ' ' || st.last_name END AS lecturerName,
                     (SELECT COUNT(*) FROM registrations r WHERE r.course_code = c.code) AS registrations
              FROM courses c LEFT JOIN staff st ON st.id = c.lecturer_id
              ORDER BY c.programme_code, c.level, c.type, c.code`)
    .all();
  const lecturers = req.db
    .prepare(`SELECT staff_number AS staffNumber, first_name || ' ' || last_name AS name
              FROM staff WHERE role = 'ACADEMIC' AND is_active = 1 ORDER BY last_name`)
    .all();
  const programmes = req.db.prepare('SELECT code, name FROM programmes ORDER BY code').all();
  res.json({ courses, lecturers, programmes });
});

/** Validates the editable course fields. Returns { value } or { error }. */
function validateCourse(db, body = {}) {
  const v = {
    name: text(body.name),
    credits: body.credits === undefined ? NaN : Number(body.credits),
    level: text(body.level),
    type: text(body.type),
    programmeCode: text(body.programmeCode),
    lecturerNumber: text(body.lecturerNumber).toUpperCase(),
  };
  if (v.name.length < 3 || v.name.length > 100) return { error: 'Course name must be 3–100 characters.' };
  if (!Number.isInteger(v.credits) || v.credits < 1 || v.credits > 60) return { error: 'Credits must be a whole number from 1 to 60.' };
  if (!LEVEL.test(v.level)) return { error: 'Level must look like 2.1.' };
  if (!['CORE', 'ELECTIVE'].includes(v.type)) return { error: 'Type must be Core or Elective.' };
  if (!db.prepare('SELECT 1 FROM programmes WHERE code = ?').get(v.programmeCode)) return { error: 'Choose a programme.' };

  v.lecturerId = null;
  if (v.lecturerNumber) {
    const lecturer = db
      .prepare("SELECT id FROM staff WHERE staff_number = ? AND role = 'ACADEMIC' AND is_active = 1")
      .get(v.lecturerNumber);
    if (!lecturer) return { error: 'The lecturer must be an active staff member with the Lecturer role.' };
    v.lecturerId = lecturer.id;
  }
  return { value: v };
}

router.post('/courses', (req, res) => {
  const code = text(req.body?.code).toUpperCase();
  if (!COURSE_CODE.test(code)) return bad(res, 'Course code must look like SCS2114.');
  const { value: c, error } = validateCourse(req.db, req.body);
  if (error) return bad(res, error);

  try {
    req.db.transaction(() => {
      req.db
        .prepare(`INSERT INTO courses (code, name, credits, programme_code, level, type, lecturer_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(code, c.name, c.credits, c.programmeCode, c.level, c.type, c.lecturerId);
      audit(req.db, req.staff.id, 'COURSE_ADDED', `${code} ${c.name} (Level ${c.level}, ${c.type})`);
    })();
  } catch (err) {
    if (isUniqueError(err)) return bad(res, `Course ${code} already exists.`, 409);
    throw err;
  }
  res.status(201).json({ ok: true });
});

router.put('/courses/:code', (req, res) => {
  const existing = req.db
    .prepare(`SELECT c.*, st.staff_number AS lecturer_number FROM courses c
              LEFT JOIN staff st ON st.id = c.lecturer_id WHERE c.code = ?`)
    .get(String(req.params.code).toUpperCase());
  if (!existing) return bad(res, 'Course not found.', 404);
  const { value: c, error } = validateCourse(req.db, req.body);
  if (error) return bad(res, error);

  const changes = [];
  if (c.name !== existing.name) changes.push(`name → ${c.name}`);
  if (c.credits !== existing.credits) changes.push(`credits ${existing.credits} → ${c.credits}`);
  if (c.level !== existing.level) changes.push(`level ${existing.level} → ${c.level}`);
  if (c.type !== existing.type) changes.push(`type ${existing.type} → ${c.type}`);
  if (c.programmeCode !== existing.programme_code) changes.push(`programme → ${c.programmeCode}`);
  if (c.lecturerId !== existing.lecturer_id) {
    changes.push(`lecturer ${existing.lecturer_number ?? 'none'} → ${c.lecturerNumber || 'none'}`);
  }
  if (changes.length === 0) return res.json({ ok: true });

  req.db.transaction(() => {
    req.db
      .prepare(`UPDATE courses SET name = ?, credits = ?, level = ?, type = ?, programme_code = ?, lecturer_id = ?
                WHERE code = ?`)
      .run(c.name, c.credits, c.level, c.type, c.programmeCode, c.lecturerId, existing.code);
    audit(req.db, req.staff.id, 'COURSE_UPDATED', `${existing.code}: ${changes.join(', ')}`);
  })();
  res.json({ ok: true });
});

router.delete('/courses/:code', (req, res) => {
  const existing = req.db.prepare('SELECT code, name FROM courses WHERE code = ?').get(String(req.params.code).toUpperCase());
  if (!existing) return bad(res, 'Course not found.', 404);
  try {
    req.db.transaction(() => {
      req.db.prepare('DELETE FROM courses WHERE code = ?').run(existing.code);
      audit(req.db, req.staff.id, 'COURSE_DELETED', `${existing.code} ${existing.name}`);
    })();
  } catch (err) {
    // The database refuses to delete a course that registrations, results or exams point to.
    if (isFkError(err)) {
      return bad(res, `${existing.code} has registrations, results or exams, so it can't be deleted. Edit it instead.`, 409);
    }
    throw err;
  }
  res.status(204).end();
});

// ============================================================================
// System information
// ============================================================================

router.get('/system', (req, res) => {
  const db = req.db;
  const semesters = db
    .prepare('SELECT * FROM semesters ORDER BY starts_on DESC')
    .all()
    .map((s) => ({
      id: s.id,
      label: s.label,
      startsOn: s.starts_on,
      endsOn: s.ends_on,
      isCurrent: s.is_current === 1,
      registrationOpen: s.registration_open === 1,
    }));
  const stats = db
    .prepare(`SELECT
        (SELECT COUNT(*) FROM students) AS students,
        (SELECT COUNT(*) FROM students WHERE is_active = 1) AS activeStudents,
        (SELECT COUNT(*) FROM staff WHERE is_active = 1) AS activeStaff,
        (SELECT COUNT(*) FROM courses) AS courses,
        (SELECT COUNT(*) FROM courses WHERE lecturer_id IS NULL) AS unassignedCourses,
        (SELECT COUNT(*) FROM registrations r JOIN semesters s ON s.id = r.semester_id AND s.is_current = 1) AS currentRegistrations,
        (SELECT COUNT(*) FROM results WHERE published = 1) AS publishedResults,
        (SELECT COUNT(*) FROM results WHERE published = 0) AS draftResults`)
    .get();
  res.json({
    semesters,
    settings: getSettings(db),
    stats,
    system: { version, node: process.version, schemaVersion: db.pragma('user_version', { simple: true }) },
  });
});

router.put('/settings', (req, res) => {
  const updates = {};
  for (const [name, rule] of Object.entries(SETTINGS)) {
    if (req.body?.[name] === undefined) continue;
    const value = text(req.body[name]);
    if (value.length > rule.maxLength) return bad(res, `${name} must be at most ${rule.maxLength} characters.`);
    updates[name] = value;
  }
  if (Object.keys(updates).length === 0) return bad(res, 'Nothing to update.');

  req.db.transaction(() => {
    for (const [name, value] of Object.entries(updates)) saveSetting(req.db, name, value);
    audit(req.db, req.staff.id, 'SETTINGS_UPDATED', `Updated: ${Object.keys(updates).join(', ')}`);
  })();
  res.json({ ok: true, settings: getSettings(req.db) });
});

router.post('/semesters', (req, res) => {
  const s = {
    id: text(req.body?.id),
    label: text(req.body?.label),
    startsOn: text(req.body?.startsOn),
    endsOn: text(req.body?.endsOn),
  };
  if (!SEMESTER_ID.test(s.id)) return bad(res, 'Semester ID must look like 2027-28-S1.');
  if (s.label.length < 3 || s.label.length > 60) return bad(res, 'Label must be 3–60 characters.');
  if (!isIsoDate(s.startsOn) || !isIsoDate(s.endsOn) || s.startsOn >= s.endsOn) {
    return bad(res, 'Enter a start date before the end date.');
  }

  try {
    req.db.transaction(() => {
      req.db
        .prepare('INSERT INTO semesters (id, label, starts_on, ends_on) VALUES (?, ?, ?, ?)')
        .run(s.id, s.label, s.startsOn, s.endsOn);
      audit(req.db, req.staff.id, 'SEMESTER_ADDED', `${s.id} ${s.label} (${s.startsOn} to ${s.endsOn})`);
    })();
  } catch (err) {
    if (isUniqueError(err)) return bad(res, `Semester ${s.id} already exists.`, 409);
    throw err;
  }
  res.status(201).json({ ok: true });
});

router.patch('/semesters/:id', (req, res) => {
  const semester = req.db.prepare('SELECT * FROM semesters WHERE id = ?').get(req.params.id);
  if (!semester) return bad(res, 'Semester not found.', 404);

  const { isCurrent, registrationOpen } = req.body ?? {};
  if (isCurrent !== undefined && isCurrent !== true) {
    return bad(res, 'To change the current semester, make another semester current.');
  }
  if (registrationOpen !== undefined && typeof registrationOpen !== 'boolean') {
    return bad(res, 'registrationOpen must be true or false.');
  }

  const changes = [];
  req.db.transaction(() => {
    if (isCurrent && !semester.is_current) {
      // Exactly one semester is current at a time.
      req.db.prepare('UPDATE semesters SET is_current = 0').run();
      req.db.prepare('UPDATE semesters SET is_current = 1 WHERE id = ?').run(semester.id);
      changes.push('made current semester');
    }
    if (registrationOpen !== undefined && Number(registrationOpen) !== semester.registration_open) {
      req.db.prepare('UPDATE semesters SET registration_open = ? WHERE id = ?').run(Number(registrationOpen), semester.id);
      changes.push(registrationOpen ? 'registration opened' : 'registration closed');
    }
    if (changes.length) audit(req.db, req.staff.id, 'SEMESTER_UPDATED', `${semester.label}: ${changes.join(', ')}`);
  })();
  res.json({ ok: true });
});

module.exports = { staffManageRouter: router };
