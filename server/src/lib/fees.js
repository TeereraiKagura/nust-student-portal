/** Fee items, total, amount paid and balance for one student in one semester (BR3). */
function feeSummary(db, studentId, semesterId) {
  const items = db
    .prepare('SELECT description, amount_cents AS amountCents FROM fee_items WHERE semester_id = ? ORDER BY id')
    .all(semesterId);
  const totalCents = items.reduce((s, i) => s + i.amountCents, 0);
  const paidCents = db
    .prepare(`SELECT COALESCE(SUM(amount_cents), 0) AS paid FROM payments
              WHERE student_id = ? AND semester_id = ? AND status = 'SUCCESS'`)
    .get(studentId, semesterId).paid;
  return { items, totalCents, paidCents, balanceCents: totalCents - paidCents };
}

const METHOD_LABELS = { ECOCASH: 'EcoCash', FBC_ONLINE: 'FBC Online', BANK: 'Bank deposit' };

module.exports = { feeSummary, METHOD_LABELS };
