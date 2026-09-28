/** Records who changed what. Call inside the same transaction as the change itself. */
function audit(db, staffId, action, details) {
  db.prepare('INSERT INTO audit_log (staff_id, action, details) VALUES (?, ?, ?)').run(staffId, action, details);
}

module.exports = { audit };
