// Bursary tools (role BURSARY): fee structure per semester, student balances, bank deposits.
const express = require('express');
const { currentSemester } = require('../../db');
const { feeSummary, METHOD_LABELS } = require('../../lib/fees');
const { parseAmountToCents } = require('../../lib/money');
const { audit } = require('../../lib/audit');

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

function listSemesters(db) {
  return db
    .prepare('SELECT id, label, is_current FROM semesters ORDER BY starts_on DESC')
    .all()
    .map((s) => ({ id: s.id, label: s.label, isCurrent: s.is_current === 1 }));
}

/** ?semester=ID, or the current semester when omitted. undefined if the ID is unknown. */
function semesterFromQuery(db, id) {
  if (id === undefined) return currentSemester(db);
  return typeof id === 'string' ? db.prepare('SELECT * FROM semesters WHERE id = ?').get(id) : undefined;
}

// ---- Fee structure -----------------------------------------------------------

const feesRouter = express.Router();

function validateFeeItem(body) {
  const { description, amount } = body ?? {};
  if (typeof description !== 'string' || description.trim().length < 2 || description.length > 80) {
    return { error: 'Description must be 2–80 characters.' };
  }
  const amountCents = parseAmountToCents(amount, { minCents: 0, maxCents: 10_000_000 });
  if (amountCents === null) return { error: 'Amount must be between $0.00 and $100,000.00.' };
  return { description: description.trim(), amountCents };
}

feesRouter.get('/', (req, res) => {
  const semester = semesterFromQuery(req.db, req.query.semester);
  if (!semester) return res.status(404).json({ error: 'Semester not found.' });

  const items = req.db
    .prepare('SELECT id, description, amount_cents AS amountCents FROM fee_items WHERE semester_id = ? ORDER BY id')
    .all(semester.id);
  res.json({
    semesters: listSemesters(req.db),
    semester: { id: semester.id, label: semester.label },
    items,
    totalCents: items.reduce((s, i) => s + i.amountCents, 0),
  });
});

feesRouter.post('/', (req, res) => {
  const semester = semesterFromQuery(req.db, req.body?.semesterId);
  if (!semester) return res.status(400).json({ error: 'Choose a valid semester.' });
  const item = validateFeeItem(req.body);
  if (item.error) return res.status(400).json(item);

  let id;
  req.db.transaction(() => {
    id = req.db
      .prepare('INSERT INTO fee_items (semester_id, description, amount_cents) VALUES (?, ?, ?)')
      .run(semester.id, item.description, item.amountCents).lastInsertRowid;
    audit(req.db, req.staff.id, 'FEE_ADDED', `${semester.label}: ${item.description} ${money(item.amountCents)}`);
  })();
  res.status(201).json({ id });
});

feesRouter.put('/:id', (req, res) => {
  const existing = req.db
    .prepare('SELECT f.*, s.label FROM fee_items f JOIN semesters s ON s.id = f.semester_id WHERE f.id = ?')
    .get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Fee item not found.' });
  const item = validateFeeItem(req.body);
  if (item.error) return res.status(400).json(item);

  req.db.transaction(() => {
    req.db
      .prepare('UPDATE fee_items SET description = ?, amount_cents = ? WHERE id = ?')
      .run(item.description, item.amountCents, existing.id);
    audit(req.db, req.staff.id, 'FEE_UPDATED',
      `${existing.label}: ${existing.description} ${money(existing.amount_cents)} → ${item.description} ${money(item.amountCents)}`);
  })();
  res.json({ ok: true });
});

feesRouter.delete('/:id', (req, res) => {
  const existing = req.db
    .prepare('SELECT f.*, s.label FROM fee_items f JOIN semesters s ON s.id = f.semester_id WHERE f.id = ?')
    .get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: 'Fee item not found.' });

  req.db.transaction(() => {
    req.db.prepare('DELETE FROM fee_items WHERE id = ?').run(existing.id);
    audit(req.db, req.staff.id, 'FEE_DELETED', `${existing.label}: ${existing.description} ${money(existing.amount_cents)}`);
  })();
  res.status(204).end();
});

// ---- Student accounts --------------------------------------------------------

const accountsRouter = express.Router();

accountsRouter.get('/', (req, res) => {
  const semester = semesterFromQuery(req.db, req.query.semester);
  if (!semester) return res.status(404).json({ error: 'Semester not found.' });

  const totalCents = req.db
    .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM fee_items WHERE semester_id = ?')
    .get(semester.id).total;
  const students = req.db
    .prepare(`SELECT s.student_number, s.first_name, s.last_name, s.level,
                     COALESCE((SELECT SUM(p.amount_cents) FROM payments p
                               WHERE p.student_id = s.id AND p.semester_id = ? AND p.status = 'SUCCESS'), 0) AS paid
              FROM students s ORDER BY s.student_number`)
    .all(semester.id)
    .map((s) => ({
      studentNumber: s.student_number,
      name: `${s.first_name} ${s.last_name}`,
      level: s.level,
      paidCents: s.paid,
      balanceCents: totalCents - s.paid,
    }));

  res.json({ semesters: listSemesters(req.db), semester: { id: semester.id, label: semester.label }, totalCents, students });
});

function findStudent(db, number) {
  return db
    .prepare(`SELECT s.id, s.student_number, s.first_name, s.last_name, s.level, s.phone, s.email,
                     p.name AS programme
              FROM students s JOIN programmes p ON p.code = s.programme_code
              WHERE s.student_number = ?`)
    .get(String(number).toUpperCase());
}

accountsRouter.get('/:number', (req, res) => {
  const student = findStudent(req.db, req.params.number);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const semester = semesterFromQuery(req.db, req.query.semester);
  if (!semester) return res.status(404).json({ error: 'Semester not found.' });

  const payments = req.db
    .prepare(`SELECT p.reference, p.method, p.amount_cents AS amountCents, p.status, p.paid_at AS paidAt,
                     sm.label AS semester,
                     CASE WHEN st.id IS NULL THEN NULL ELSE st.first_name || ' ' || st.last_name END AS recordedBy
              FROM payments p
              JOIN semesters sm ON sm.id = p.semester_id
              LEFT JOIN staff st ON st.id = p.recorded_by
              WHERE p.student_id = ?
              ORDER BY p.paid_at DESC, p.id DESC`)
    .all(student.id)
    .map((p) => ({ ...p, methodLabel: METHOD_LABELS[p.method] ?? p.method }));

  res.json({
    semesters: listSemesters(req.db),
    semester: { id: semester.id, label: semester.label },
    student: {
      studentNumber: student.student_number,
      name: `${student.first_name} ${student.last_name}`,
      programme: student.programme,
      level: student.level,
      phone: student.phone,
      email: student.email,
    },
    summary: feeSummary(req.db, student.id, semester.id),
    payments,
  });
});

const BANK_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9/-]{3,29}$/;

/** Records a bank deposit seen on the university's bank statement. */
accountsRouter.post('/:number/payments', (req, res) => {
  const student = findStudent(req.db, req.params.number);
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const { semesterId, amount, reference, paidOn } = req.body ?? {};
  const semester = semesterFromQuery(req.db, semesterId);
  if (!semester) return res.status(400).json({ error: 'Choose a valid semester.' });

  const amountCents = parseAmountToCents(amount, { minCents: 100, maxCents: 1_000_000 });
  if (amountCents === null) return res.status(400).json({ error: 'Amount must be between $1.00 and $10,000.00.' });
  if (typeof reference !== 'string' || !BANK_REFERENCE.test(reference.trim())) {
    return res.status(400).json({ error: 'Bank reference must be 4–30 letters, numbers, "-" or "/".' });
  }

  // Allow "tomorrow" in UTC so a deposit made just after midnight in Zimbabwe (UTC+2) is accepted.
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  if (typeof paidOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paidOn) ||
      Number.isNaN(Date.parse(paidOn)) || paidOn > tomorrow) {
    return res.status(400).json({ error: 'Enter the deposit date (not in the future).' });
  }

  const ref = reference.trim().toUpperCase();
  const paidAt = `${paidOn} ${new Date().toISOString().slice(11, 19)}`;
  try {
    req.db.transaction(() => {
      req.db
        .prepare(`INSERT INTO payments (student_id, semester_id, reference, method, amount_cents, status, paid_at, recorded_by)
                  VALUES (?, ?, ?, 'BANK', ?, 'SUCCESS', ?, ?)`)
        .run(student.id, semester.id, ref, amountCents, paidAt, req.staff.id);
      req.db
        .prepare('INSERT INTO messages (student_id, subject, body) VALUES (?, ?, ?)')
        .run(student.id, 'Payment received',
          `Your bank deposit of ${money(amountCents)} (reference ${ref}) has been receipted to ${semester.label}.`);
      audit(req.db, req.staff.id, 'PAYMENT_RECORDED',
        `${student.student_number}: ${money(amountCents)} bank deposit ${ref} (${semester.label})`);
    })();
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'A payment with that reference has already been recorded.' });
    }
    throw err;
  }

  res.status(201).json({ reference: ref, summary: feeSummary(req.db, student.id, semester.id) });
});

module.exports = { staffFeesRouter: feesRouter, staffAccountsRouter: accountsRouter };
