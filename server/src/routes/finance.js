const crypto = require('node:crypto');
const express = require('express');
const { currentSemester } = require('../db');
const { feeSummary, METHOD_LABELS } = require('../lib/fees');
const { parseAmountToCents } = require('../lib/money');
const { semesterDto } = require('./student');

const router = express.Router();

const ZIM_MOBILE = /^(?:\+263|0)7[1378]\d{7}$/; // Econet, NetOne and Telecel prefixes
const ONLINE_METHODS = ['ECOCASH', 'FBC_ONLINE']; // BANK deposits are recorded by the bursary

router.get('/fees/quote', (req, res) => {
  const id = req.session.studentId;
  const semester = currentSemester(req.db);
  const student = req.db
    .prepare(`SELECT s.student_number, s.first_name, s.last_name, s.level, p.name AS programme
              FROM students s JOIN programmes p ON p.code = s.programme_code WHERE s.id = ?`)
    .get(id);

  res.json({
    quoteNumber: `FQ-${semester.id}-${student.student_number}`,
    issuedOn: new Date().toISOString().slice(0, 10),
    semester: semesterDto(semester),
    student: {
      studentNumber: student.student_number,
      fullName: `${student.first_name} ${student.last_name}`,
      programme: student.programme,
      level: student.level,
    },
    ...feeSummary(req.db, id, semester.id),
  });
});

router.get('/payments', (req, res) => {
  const payments = req.db
    .prepare(`SELECT p.reference, p.method, p.amount_cents AS amountCents, p.status, p.paid_at AS paidAt,
                     s.label AS semester
              FROM payments p JOIN semesters s ON s.id = p.semester_id
              WHERE p.student_id = ?
              ORDER BY p.paid_at DESC, p.id DESC`)
    .all(req.session.studentId)
    .map((p) => ({ ...p, methodLabel: METHOD_LABELS[p.method] ?? p.method }));
  res.json({ payments });
});

/**
 * SIMULATED payment. A real integration would create a PENDING payment, send the
 * student to the gateway (or push an EcoCash USSD prompt) and mark it SUCCESS only
 * when the gateway's signed callback arrives.
 */
router.post('/payments', (req, res) => {
  const id = req.session.studentId;
  const { method, amount, phone } = req.body ?? {};

  if (!ONLINE_METHODS.includes(method)) {
    return res.status(400).json({ error: 'Choose a payment method.' });
  }
  const amountCents = parseAmountToCents(amount, { minCents: 100, maxCents: 1_000_000 });
  if (amountCents === null) {
    return res.status(400).json({ error: 'Amount must be between $1.00 and $10,000.00.' });
  }
  if (method === 'ECOCASH' && (typeof phone !== 'string' || !ZIM_MOBILE.test(phone.replace(/\s/g, '')))) {
    return res.status(400).json({ error: 'Enter a valid Zimbabwean mobile number, e.g. 0771234567.' });
  }

  const semester = currentSemester(req.db);
  const reference = `${method === 'ECOCASH' ? 'ECO' : 'FBC'}-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;

  req.db.transaction(() => {
    req.db
      .prepare(`INSERT INTO payments (student_id, semester_id, reference, method, amount_cents, status)
                VALUES (?, ?, ?, ?, ?, 'SUCCESS')`)
      .run(id, semester.id, reference, method, amountCents);
    req.db
      .prepare('INSERT INTO messages (student_id, subject, body) VALUES (?, ?, ?)')
      .run(id, 'Payment received',
        `We have received your ${METHOD_LABELS[method]} payment of $${(amountCents / 100).toFixed(2)}. Reference: ${reference}.`);
  })();

  res.status(201).json({ reference, amountCents, method, ...feeSummary(req.db, id, semester.id) });
});

module.exports = { financeRouter: router };
