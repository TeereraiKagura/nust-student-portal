const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { securityHeaders } = require('./middleware/securityHeaders');
const { requireAuth, requireStaff } = require('./middleware/auth');
const { authRouter } = require('./routes/auth');
const { staffAuthRouter } = require('./routes/staff/auth');
const { staffResultsRouter } = require('./routes/staff/results');
const { staffFeesRouter, staffAccountsRouter } = require('./routes/staff/finance');
const { staffAdminRouter } = require('./routes/staff/admin');
const { staffManageRouter } = require('./routes/staff/manage');
const { publicRouter } = require('./routes/public');
const { studentRouter } = require('./routes/student');
const { academicsRouter } = require('./routes/academics');
const { financeRouter } = require('./routes/finance');
const { communicationRouter } = require('./routes/communication');

const CLIENT_DIR = path.join(__dirname, '..', '..', 'client');
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // FR3

/**
 * Builds the Express app. The database is passed in (dependency injection) so the
 * tests can use an in-memory database instead of the real file.
 */
function createApp({ db, sessionSecret, isProduction = false }) {
  if (!sessionSecret) throw new Error('sessionSecret is required');

  const app = express();
  app.disable('x-powered-by');
  if (isProduction) app.set('trust proxy', 1); // behind a TLS-terminating proxy

  app.use(securityHeaders);
  app.use(express.json({ limit: '20kb' }));
  app.use(
    session({
      name: 'nust.sid',
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true, // every request resets the idle timer
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProduction, maxAge: IDLE_TIMEOUT_MS },
    })
  );
  app.use((req, res, next) => {
    req.db = db;
    next();
  });

  // Used by the hosting platform to check the app is up.
  app.get('/api/health', (req, res) => res.json({ ok: true }));

  // No login needed: programme/level lists for the sign-up form.
  app.use('/api/public', publicRouter);

  // ---- Staff API (mounted before the student catch-all below) ----
  // Each area is guarded by role: ACADEMIC → results, BURSARY → fees/accounts,
  // ADMIN → everything, including user/course/system management.
  app.use('/api/staff/auth', staffAuthRouter());
  app.use('/api/staff/manage', requireStaff('ADMIN'), staffManageRouter);
  app.use('/api/staff/results', requireStaff('ACADEMIC'), staffResultsRouter);
  app.use('/api/staff/fees', requireStaff('BURSARY'), staffFeesRouter);
  app.use('/api/staff/accounts', requireStaff('BURSARY'), staffAccountsRouter);
  app.use('/api/staff', requireStaff(), staffAdminRouter);
  app.use('/api/staff', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---- Student API ----
  app.use('/api/auth', authRouter());
  app.use('/api/me', requireAuth, studentRouter);
  app.use('/api', requireAuth, academicsRouter, financeRouter, communicationRouter);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

  // ---- Frontend ----
  // Page-level guards so a logged-out user never sees a portal shell, and a logged-in user
  // skips the landing/login pages and goes straight to their portal.
  const toOwnPortal = (req, res, next) => {
    if (req.session.studentId) return res.redirect('/dashboard.html');
    if (req.session.staffId) return res.redirect('/staff-portal.html');
    next();
  };
  app.get(['/', '/index.html', '/student.html', '/signup.html', '/staff.html'], toOwnPortal);
  app.get('/dashboard.html', (req, res, next) => (req.session.studentId ? next() : res.redirect('/student.html')));
  app.get('/staff-portal.html', (req, res, next) => (req.session.staffId ? next() : res.redirect('/staff.html')));
  app.use(express.static(CLIENT_DIR));

  // ---- Errors ----
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Malformed JSON.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

module.exports = { createApp };
