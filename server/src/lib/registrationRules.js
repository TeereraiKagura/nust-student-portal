const MAX_CREDITS = 84;

/**
 * Validates a course selection (functional requirement FR6).
 * @param {Array<{code:string,type:string,credits:number}>} available courses the student may take
 * @param {string[]} selectedCodes course codes the student ticked
 * @returns {{ ok: true, credits: number } | { ok: false, error: string }}
 */
function validateSelection(available, selectedCodes, maxCredits = MAX_CREDITS) {
  if (!Array.isArray(selectedCodes) || selectedCodes.length === 0) {
    return { ok: false, error: 'Select at least one course.' };
  }

  const unique = [...new Set(selectedCodes)];
  const byCode = new Map(available.map((c) => [c.code, c]));

  const unknown = unique.filter((code) => !byCode.has(code));
  if (unknown.length) {
    return { ok: false, error: `Not available at your level: ${unknown.join(', ')}` };
  }

  const missingCore = available
    .filter((c) => c.type === 'CORE' && !unique.includes(c.code))
    .map((c) => c.code);
  if (missingCore.length) {
    return { ok: false, error: `Core courses are compulsory: ${missingCore.join(', ')}` };
  }

  const credits = unique.reduce((sum, code) => sum + byCode.get(code).credits, 0);
  if (credits > maxCredits) {
    return { ok: false, error: `Too many credits (${credits}). The maximum is ${maxCredits}.` };
  }

  return { ok: true, credits };
}

module.exports = { MAX_CREDITS, validateSelection };
