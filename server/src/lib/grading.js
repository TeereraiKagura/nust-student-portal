// Grading scale (business rule BR1). Adjust the bands here if the faculty scale differs.
const GRADE_BANDS = [
  { min: 75, grade: '1', description: 'First Class' },
  { min: 65, grade: '2.1', description: 'Upper Second' },
  { min: 60, grade: '2.2', description: 'Lower Second' },
  { min: 50, grade: 'P', description: 'Pass' },
  { min: 0, grade: 'F', description: 'Fail' },
];

function gradeFor(mark) {
  if (!Number.isFinite(mark) || mark < 0 || mark > 100) {
    throw new RangeError(`Invalid mark: ${mark}`);
  }
  return GRADE_BANDS.find((band) => mark >= band.min);
}

/** Credit-weighted average of [{ mark, credits }], rounded to 1 decimal place. */
function weightedAverage(rows) {
  const totalCredits = rows.reduce((sum, r) => sum + r.credits, 0);
  if (totalCredits === 0) return null;
  const weighted = rows.reduce((sum, r) => sum + r.mark * r.credits, 0);
  return Math.round((weighted / totalCredits) * 10) / 10;
}

module.exports = { GRADE_BANDS, gradeFor, weightedAverage };
