// Every student registers for exactly six courses per semester (functional requirement FR6).
const COURSES_REQUIRED = 6;

/**
 * Validates a course selection.
 * @param {Array<{code:string,type:string,credits:number}>} available courses the student may take
 * @param {string[]} selectedCodes course codes the student ticked
 * @returns {{ ok: true, credits: number } | { ok: false, error: string }}
 */
function validateSelection(available, selectedCodes, required = COURSES_REQUIRED) {
  if (!Array.isArray(selectedCodes) || selectedCodes.length === 0) {
    return { ok: false, error: `Select exactly ${required} courses.` };
  }

  const unique = [...new Set(selectedCodes)];
  const byCode = new Map(available.map((c) => [c.code, c]));

  const unknown = unique.filter((code) => !byCode.has(code));
  if (unknown.length) {
    return { ok: false, error: `Not available at your level: ${unknown.join(', ')}` };
  }

  if (unique.length !== required) {
    return { ok: false, error: `Select exactly ${required} courses (you selected ${unique.length}).` };
  }

  const missingCore = available
    .filter((c) => c.type === 'CORE' && !unique.includes(c.code))
    .map((c) => c.code);
  if (missingCore.length) {
    return { ok: false, error: `Core courses are compulsory: ${missingCore.join(', ')}` };
  }

  const credits = unique.reduce((sum, code) => sum + byCode.get(code).credits, 0);
  return { ok: true, credits };
}

module.exports = { COURSES_REQUIRED, validateSelection };
