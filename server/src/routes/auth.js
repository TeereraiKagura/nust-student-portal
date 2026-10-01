const express = require('express');
const { createLoginLimiter, createRequestLimiter } = require('../middleware/loginLimiter');
const { requireAuth, destroySession } = require('../middleware/auth');
const { hashPassword, verifyPassword, passwordPolicyError } = require('../lib/passwords');
const { validateSignup } = require('../lib/studentAccounts');

function startStudentSession(req, res, next, studentId, status = 200) {
  // New session ID on login prevents session fixation.
  req.session.regenerate((err) => {
    if (err) return next(err);
    req.session.studentId = studentId;
    res.status(status).json({ ok: true });
  });
}

function authRouter() {
  const router = express.Router();
  const loginLimiter = createLoginLimiter();
  const signupLimiter = createRequestLimiter({
    max: 5,
    windowMs: 60 * 60 * 1000,
    message: 'Too many sign-up attempts from this network. Please try again later.',
  });

  router.post('/login', loginLimiter, (req, res, next) => {
    const { studentNumber, password } = req.body ?? {};
    if (typeof studentNumber !== 'string' || typeof password !== 'string' ||
        !studentNumber.trim() || !password) {
      return res.status(400).json({ error: 'Enter your student number and password.' });
    }

    const student = req.db
      .prepare('SELECT id, password_hash, is_active FROM students WHERE student_number = ?')
      .get(studentNumber.trim().toUpperCase());

    // A deactivated account is treated exactly like a wrong password.
    if (!verifyPassword(password, student?.is_active ? student.password_hash : undefined)) {
      req.recordLoginFailure();
      return res.status(401).json({ error: 'Invalid student number or password.' });
    }

    req.clearLoginFailures();
    startStudentSession(req, res, next, student.id);
  });

  // Student self-registration: creates the account and logs the student in.
  router.post('/signup', signupLimiter, (req, res, next) => {
    const result = validateSignup(req.db, req.body);
    if (result.error) return res.status(400).json({ error: result.error });
    const s = result.value;

    let studentId;
    try {
      req.db.transaction(() => {
        studentId = req.db
          .prepare(`INSERT INTO students
            (student_number, password_hash, first_name, last_name, national_id, address_line1, address_line2,
             country, phone, email, gender, date_of_birth, place_of_birth, programme_code, level)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'Zimbabwe', ?, ?, ?, ?, ?, ?, ?)`)
          .run(s.studentNumber, hashPassword(s.password), s.firstName, s.lastName, s.nationalId,
            s.addressLine1, s.addressLine2, s.phone, s.email, s.gender, s.dateOfBirth, s.placeOfBirth,
            s.programmeCode, s.level)
          .lastInsertRowid;
        req.db
          .prepare('INSERT INTO messages (student_id, subject, body) VALUES (?, ?, ?)')
          .run(studentId, 'Welcome to the Student Portal',
            'Your account has been created. Use New Registration to register for your six courses this semester.');
      })();
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return res.status(409).json({ error: 'An account with that student number already exists. Try logging in.' });
      }
      throw err;
    }

    startStudentSession(req, res, next, studentId, 201);
  });

  router.post('/logout', destroySession);

  router.get('/me', requireAuth, (req, res) => {
    const me = req.db
      .prepare(`SELECT student_number, first_name, last_name,
                       (SELECT COUNT(*) FROM messages m WHERE m.student_id = s.id AND m.is_read = 0) AS unread
                FROM students s WHERE id = ?`)
      .get(req.session.studentId);
    res.json({
      studentNumber: me.student_number,
      fullName: `${me.first_name} ${me.last_name}`,
      unreadMessages: me.unread,
    });
  });

  router.put('/password', requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'Both passwords are required.' });
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) return res.status(400).json({ error: policyError });

    const row = req.db.prepare('SELECT password_hash FROM students WHERE id = ?').get(req.session.studentId);
    if (!verifyPassword(currentPassword, row.password_hash)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    req.db
      .prepare('UPDATE students SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPassword), req.session.studentId);
    res.json({ ok: true });
  });

  return router;
}

module.exports = { authRouter };
