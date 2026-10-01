// Overall remark for a semester's six courses (business rule BR5):
//   no failed courses      → PASS
//   1 or 2 failed courses  → PROCEED CARRYING <failed course codes>
//   3 or more failed       → REPEAT <failed course codes>
// The remark is only final once every course has a published mark; until then it is PENDING.
const { isFail } = require('./grading');

const MAX_FAILS_TO_PROCEED = 2;

/**
 * @param {Array<{code: string, mark: number|null}>} courses  mark is null while not yet published
 * @returns {{ code: 'PASS'|'PROCEED_CARRYING'|'REPEAT'|'PENDING', failed: string[], text: string }}
 */
function overallRemark(courses) {
  const total = courses.length;
  const marked = courses.filter((c) => Number.isFinite(c.mark));
  const failed = marked.filter((c) => isFail(c.mark)).map((c) => c.code);

  if (total === 0 || marked.length < total) {
    return { code: 'PENDING', failed, text: `PENDING — ${marked.length} of ${total} results available` };
  }
  if (failed.length === 0) {
    return { code: 'PASS', failed, text: 'PASS' };
  }
  if (failed.length <= MAX_FAILS_TO_PROCEED) {
    return { code: 'PROCEED_CARRYING', failed, text: `PROCEED CARRYING ${failed.join(', ')}` };
  }
  return { code: 'REPEAT', failed, text: `REPEAT ${failed.join(', ')}` };
}

module.exports = { overallRemark, MAX_FAILS_TO_PROCEED };
