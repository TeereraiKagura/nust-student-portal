const express = require('express');
const { createLoginLimiter } = require('../../middleware/loginLimiter');
const { requireStaff, destroySession } = require('../../middleware/auth');
const { verifyPassword } = require('../../lib/passwords');

const ROLE_LABELS = { ACADEMIC: 'Lecturer', BURSARY: 'Bursary', ADMIN: 'Administrator' };

function staffAuthRouter() {
  const router = express.Router();
  const loginLimiter = createLoginLimiter();

  router.post('/login', loginLimiter, (req, res, next) => {
    const { staffNumber, password } = req.body ?? {};
    if (typeof staffNumber !== 'string' || typeof password !== 'string' || !staffNumber.trim() || !password) {
      return res.status(400).json({ error: 'Enter your staff number and password.' });
    }

    const staff = req.db
      .prepare('SELECT id, password_hash, is_active FROM staff WHERE staff_number = ?')
      .get(staffNumber.trim().toUpperCase());

    // A deactivated account is treated exactly like a wrong password.
    if (!verifyPassword(password, staff?.is_active ? staff.password_hash : undefined)) {
      req.recordLoginFailure();
      return res.status(401).json({ error: 'Invalid staff number or password.' });
    }

    req.clearLoginFailures();
    req.session.regenerate((err) => {
      if (err) return next(err);
      req.session.staffId = staff.id;
      res.json({ ok: true });
    });
  });

  router.post('/logout', destroySession);

  router.get('/me', requireStaff(), (req, res) => {
    const s = req.staff;
    res.json({
      staffNumber: s.staff_number,
      fullName: `${s.first_name} ${s.last_name}`,
      role: s.role,
      roleLabel: ROLE_LABELS[s.role],
    });
  });

  return router;
}

module.exports = { staffAuthRouter };
