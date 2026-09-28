const test = require('node:test');
const assert = require('node:assert/strict');
const { gradeFor, weightedAverage } = require('../src/lib/grading');
const { validateSelection } = require('../src/lib/registrationRules');

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

const available = [
  { code: 'A', type: 'CORE', credits: 12 },
  { code: 'B', type: 'CORE', credits: 12 },
  { code: 'E1', type: 'ELECTIVE', credits: 12 },
  { code: 'E2', type: 'ELECTIVE', credits: 12 },
];

test('validateSelection accepts cores plus electives within the limit', () => {
  assert.deepEqual(validateSelection(available, ['A', 'B', 'E1'], 36), { ok: true, credits: 36 });
});

test('validateSelection rejects missing core, unknown course, too many credits, empty', () => {
  assert.match(validateSelection(available, ['A', 'E1']).error, /compulsory: B/);
  assert.match(validateSelection(available, ['A', 'B', 'X9']).error, /Not available/);
  assert.match(validateSelection(available, ['A', 'B', 'E1', 'E2'], 36).error, /Too many credits/);
  assert.equal(validateSelection(available, []).ok, false);
});

test('validateSelection ignores duplicate codes', () => {
  assert.deepEqual(validateSelection(available, ['A', 'B', 'A'], 36), { ok: true, credits: 24 });
});
