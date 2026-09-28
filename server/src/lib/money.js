/**
 * Converts a dollar amount from a request body (number or numeric string) to integer cents.
 * Returns null if it isn't a number, has more than 2 decimal places, or is outside the range.
 */
function parseAmountToCents(value, { minCents = 0, maxCents }) {
  const n = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() !== '' ? Number(value)
      : NaN;
  if (!Number.isFinite(n)) return null;

  const cents = Math.round(n * 100);
  if (Math.abs(n * 100 - cents) > 1e-6) return null; // e.g. 10.005
  if (cents < minCents || cents > maxCents) return null;
  return cents;
}

module.exports = { parseAmountToCents };
