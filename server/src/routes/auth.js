const express = require('express');
const { createLoginLimiter } = require('../middleware/loginLimiter');
const { requireAuth, destroySession } = require('../middleware/auth');
const { hashPassword, verifyPassword, passwordPolicyError } = require('../lib/passwords');

function authRouter() {
  const router = express.Router();
  const loginLimiter = createLoginLimiter();

  router.post('/login', loginLimiter, (req, res, next) => {
    const { studentNumber, password } = req.body ?? {};
    if (typeof studentNumber !== 'string' || typeof password !== 'string' ||
        !studentNumber.trim() || !password) {
      return res.status(400).json({ error: 'Enter your student number and password.' });
    }

    const student = req.db
      .prepare('SELECT id, password_hash FROM students WHERE student_number = ?')
      .get(studentNumber.trim().toUpperCase());

    if (!verifyPassword(password, student?.password_hash)) {
      req.recordLoginFailure();
      return res.status(401).json({ error: 'Invalid student number or password.' });
    }

    req.clearLoginFailures();
    // New session ID on login prevents session fixation.
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.studentId = student.id;
      res.json({ ok: true });
    });
  });

  router.post('/logout', destroySession);

  router.get('/me', requireAuth, (req, res) => {
    const me = req.db
      .prepare(`SELECT student_number, first_name, last_name,
                       (SELECT COUNT(*) FROM messages m WHERE m.student_id = s.id AND m.is_read = 0) AS unread
                FROM students s WHERE id = ?`)
      .get(req.session.studentId);
    if (!me) return res.status(401).json({ error: 'Account not found.' });
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
