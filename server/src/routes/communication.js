const express = require('express');

const router = express.Router();

const ENQUIRY_CATEGORIES = [
  'Fees & Payments',
  'Registration',
  'Examinations & Results',
  'Accommodation',
  'ICT Support',
  'Other',
];

router.get('/messages', (req, res) => {
  const messages = req.db
    .prepare(`SELECT id, subject, body, is_read AS isRead, created_at AS createdAt
              FROM messages WHERE student_id = ? ORDER BY created_at DESC, id DESC`)
    .all(req.session.studentId)
    .map((m) => ({ ...m, isRead: m.isRead === 1 }));
  res.json({ messages, unread: messages.filter((m) => !m.isRead).length });
});

router.patch('/messages/:id/read', (req, res) => {
  // student_id in the WHERE clause stops one student marking another student's message.
  const info = req.db
    .prepare('UPDATE messages SET is_read = 1 WHERE id = ? AND student_id = ?')
    .run(Number(req.params.id), req.session.studentId);
  if (info.changes === 0) return res.status(404).json({ error: 'Message not found.' });
  res.status(204).end();
});

router.get('/enquiries', (req, res) => {
  const enquiries = req.db
    .prepare(`SELECT id, category, subject, message, status, created_at AS createdAt
              FROM enquiries WHERE student_id = ? ORDER BY created_at DESC, id DESC`)
    .all(req.session.studentId);
  res.json({ categories: ENQUIRY_CATEGORIES, enquiries });
});

router.post('/enquiries', (req, res) => {
  const { category, subject, message } = req.body ?? {};
  if (!ENQUIRY_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: 'Choose a category.' });
  }
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 120) {
    return res.status(400).json({ error: 'Subject is required (max 120 characters).' });
  }
  if (typeof message !== 'string' || message.trim().length < 10 || message.length > 2000) {
    return res.status(400).json({ error: 'Message must be 10–2000 characters.' });
  }

  const info = req.db
    .prepare('INSERT INTO enquiries (student_id, category, subject, message) VALUES (?, ?, ?, ?)')
    .run(req.session.studentId, category, subject.trim(), message.trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

module.exports = { communicationRouter: router };
