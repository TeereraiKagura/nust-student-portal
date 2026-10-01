const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeFor, weightedAverage } = require('../src/lib/grading');
const { validateSelection } = require('../src/lib/registrationRules');
const { overallRemark } = require('../src/lib/remarks');

test('gradeFor maps marks to the grading scale boundaries', () => {
  assert.equal(gradeFor(100).grade, '1');
  assert.equal(gradeFor(75).grade, '1');
  assert.equal(gradeFor(74).grade, '2.1');
  assert.equal(gradeFor(65).grade, '2.1');
  assert.equal(gradeFor(64).grade, '2.2');
  assert.equal(gradeFor(60).grade, '2.2');
  assert.equal(gradeFor(59).grade, 'P');
  assert.equal(gradeFor(50).grade, 'P');
  assert.equal(gradeFor(49).grade, 'F');
  assert.equal(gradeFor(0).grade, 'F');
});

test('gradeFor rejects impossible marks', () => {
  assert.throws(() => gradeFor(-1), RangeError);
  assert.throws(() => gradeFor(101), RangeError);
  assert.throws(() => gradeFor(NaN), RangeError);
});

test('weightedAverage weights by credits', () => {
  assert.equal(weightedAverage([{ mark: 80, credits: 12 }, { mark: 50, credits: 24 }]), 60);
  assert.equal(weightedAverage([]), null);
});

// ---- Registration: exactly six courses ------------------------------------

const available = [
  { code: 'C1', type: 'CORE', credits: 12 },
  { code: 'C2', type: 'CORE', credits: 12 },
  { code: 'C3', type: 'CORE', credits: 12 },
  { code: 'C4', type: 'CORE', credits: 12 },
  { code: 'C5', type: 'CORE', credits: 12 },
  { code: 'E1', type: 'ELECTIVE', credits: 12 },
  { code: 'E2', type: 'ELECTIVE', credits: 16 },
];
const cores = ['C1', 'C2', 'C3', 'C4', 'C5'];

test('validateSelection accepts exactly six courses including every core', () => {
  assert.deepEqual(validateSelection(available, [...cores, 'E1']), { ok: true, credits: 72 });
  assert.deepEqual(validateSelection(available, [...cores, 'E2']), { ok: true, credits: 76 });
});

test('validateSelection rejects too few, too many, missing core, unknown, empty', () => {
  assert.match(validateSelection(available, cores).error, /exactly 6 courses \(you selected 5\)/);
  assert.match(validateSelection(available, [...cores, 'E1', 'E2']).error, /exactly 6 courses \(you selected 7\)/);
  assert.match(validateSelection(available, ['C2', 'C3', 'C4', 'C5', 'E1', 'E2']).error, /compulsory: C1/);
  assert.match(validateSelection(available, [...cores, 'X9']).error, /Not available: X9|Not available at your level: X9/);
  assert.equal(validateSelection(available, []).ok, false);
  assert.equal(validateSelection(available, 'C1').ok, false);
});

test('validateSelection counts duplicate codes once', () => {
  assert.match(validateSelection(available, [...cores, 'C1']).error, /you selected 5/);
});

// ---- Overall remark (BR5) ----------------------------------------------------

const six = (marks) => marks.map((mark, i) => ({ code: `C${i + 1}`, mark }));

test('remark: all six passed → PASS', () => {
  assert.deepEqual(overallRemark(six([50, 60, 70, 80, 90, 55])), { code: 'PASS', failed: [], text: 'PASS' });
});

test('remark: 1 or 2 failed → PROCEED CARRYING with codes', () => {
  assert.deepEqual(overallRemark(six([49, 60, 70, 80, 90, 55])),
    { code: 'PROCEED_CARRYING', failed: ['C1'], text: 'PROCEED CARRYING C1' });
  assert.equal(overallRemark(six([49, 60, 0, 80, 90, 55])).text, 'PROCEED CARRYING C1, C3');
});

test('remark: 3 or more failed → REPEAT with codes', () => {
  assert.equal(overallRemark(six([49, 30, 0, 80, 90, 55])).text, 'REPEAT C1, C2, C3');
  assert.equal(overallRemark(six([0, 0, 0, 0, 0, 0])).text, 'REPEAT C1, C2, C3, C4, C5, C6');
});

test('remark: boundary — 50 passes, 49 fails', () => {
  assert.equal(overallRemark(six([50, 50, 50, 50, 50, 50])).code, 'PASS');
  assert.equal(overallRemark(six([49, 50, 50, 50, 50, 50])).code, 'PROCEED_CARRYING');
});

test('remark: PENDING until all six marks exist, but failures so far are reported', () => {
  const r = overallRemark(six([40, 60, null, null, 70, 80]));
  assert.equal(r.code, 'PENDING');
  assert.equal(r.text, 'PENDING — 4 of 6 results available');
  assert.deepEqual(r.failed, ['C1']);
  assert.equal(overallRemark([]).code, 'PENDING');
});
