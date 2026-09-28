// Available to every staff member (overview) and to ADMIN only (activity log).
const express = require('express');
const { currentSemester } = require('../../db');
const { requireStaff } = require('../../middleware/auth');

const router = express.Router();

router.get('/overview', (req, res) => {
  const db = req.db;
  const semester = currentSemester(db);

  const feeTotal = db
    .prepare('SELECT COALESCE(SUM(amount_cents), 0) AS n FROM fee_items WHERE semester_id = ?')
    .get(semester.id).n;
  const paidByStudent = `SELECT student_id, SUM(amount_cents) AS paid FROM payments
                         WHERE semester_id = @sem AND status = 'SUCCESS' GROUP BY student_id`;

  const stats = db
    .prepare(`SELECT
        (SELECT COUNT(*) FROM students) AS students,
        (SELECT COUNT(*) FROM results WHERE published = 0) AS draftResults,
        (SELECT COALESCE(SUM(paid), 0) FROM (${paidByStudent})) AS collected,
        (SELECT COALESCE(SUM(MAX(@total - COALESCE(p.paid, 0), 0)), 0)
           FROM students s LEFT JOIN (${paidByStudent}) p ON p.student_id = s.id) AS outstanding`)
    .get({ sem: semester.id, total: feeTotal });

  res.json({
    semester: { id: semester.id, label: semester.label },
    stats: {
      students: stats.students,
      draftResults: stats.draftResults,
      feeTotalCents: feeTotal,
      collectedCents: stats.collected,
      outstandingCents: stats.outstanding,
    },
  });
});

router.get('/audit', requireStaff('ADMIN'), (req, res) => {
  const entries = req.db
    .prepare(`SELECT a.id, a.action, a.details, a.created_at AS createdAt,
                     s.staff_number AS staffNumber, s.first_name || ' ' || s.last_name AS staffName
              FROM audit_log a JOIN staff s ON s.id = a.staff_id
              ORDER BY a.id DESC LIMIT 200`)
    .all();
  res.json({ entries });
});

module.exports = { staffAdminRouter: router };
