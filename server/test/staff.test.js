const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const Database = require('better-sqlite3');
const { openDatabase, migrate } = require('../src/db');
const { createApp } = require('../src/app');
const { seed, DEMO_PASSWORD, STAFF_PASSWORD } = require('../src/seed');

const CURRENT = '2026-27-S1';

function setup() {
  const db = openDatabase(':memory:');
  seed(db);
  return { db, app: createApp({ db, sessionSecret: 'test-secret' }) };
}

async function loginStaff(app, staffNumber) {
  const agent = request.agent(app);
  const res = await agent.post('/api/staff/auth/login').send({ staffNumber, password: STAFF_PASSWORD });
  assert.equal(res.status, 200, `staff login ${staffNumber}`);
  return agent;
}

async function loginStudent(app, studentNumber = 'N01234567A') {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').send({ studentNumber, password: DEMO_PASSWORD });
  assert.equal(res.status, 200);
  return agent;
}

// ---- Migrations ----------------------------------------------------------------

test('migration upgrades a v0.1 database and keeps existing results visible', () => {
  const db = new Database(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'schema.sql'), 'utf8'));
  db.exec(`INSERT INTO programmes VALUES ('P', 'Prog', 'Fac');
           INSERT INTO semesters VALUES ('S', 'Sem', '2025-01-01', '2025-06-01', 1, 0);
           INSERT INTO courses VALUES ('C1', 'Course', 12, 'P', '1.1', 'CORE');
           INSERT INTO students (student_number, password_hash, first_name, last_name, national_id, programme_code, level)
             VALUES ('N1', 'x', 'A', 'B', 'ID', 'P', '1.1');
           INSERT INTO results (student_id, course_code, semester_id, mark) VALUES (1, 'C1', 'S', 70);`);
  assert.equal(db.pragma('user_version', { simple: true }), 0);

  migrate(db);
  assert.equal(db.pragma('user_version', { simple: true }), 1);
  assert.equal(db.prepare('SELECT published FROM results').get().published, 1);

  migrate(db); // running again is a no-op
  assert.equal(db.pragma('user_version', { simple: true }), 1);
});

// ---- Auth and roles ------------------------------------------------------------

test('staff login: wrong password rejected, correct one works, student cookie is not staff', async () => {
  const { app } = setup();
  const bad = await request(app).post('/api/staff/auth/login').send({ staffNumber: 'S2001', password: 'nope' });
  assert.equal(bad.status, 401);

  const lecturer = await loginStaff(app, 's2001');
  const me = await lecturer.get('/api/staff/auth/me');
  assert.equal(me.body.role, 'ACADEMIC');

  const student = await loginStudent(app);
  assert.equal((await student.get('/api/staff/overview')).status, 401);
  assert.equal((await student.get('/api/staff/results/options')).status, 401);
});

test('deactivated staff cannot log in and existing sessions stop working', async () => {
  const { app, db } = setup();
  const agent = await loginStaff(app, 'S2001');
  db.prepare("UPDATE staff SET is_active = 0 WHERE staff_number = 'S2001'").run();
  assert.equal((await agent.get('/api/staff/overview')).status, 401);
  const res = await request(app).post('/api/staff/auth/login').send({ staffNumber: 'S2001', password: STAFF_PASSWORD });
  assert.equal(res.status, 401);
});

test('roles: lecturer cannot touch fees, bursary cannot touch results, only admin sees audit', async () => {
  const { app } = setup();
  const lecturer = await loginStaff(app, 'S2001');
  const bursary = await loginStaff(app, 'S3001');
  const admin = await loginStaff(app, 'S1001');

  assert.equal((await lecturer.get('/api/staff/fees')).status, 403);
  assert.equal((await lecturer.get('/api/staff/accounts')).status, 403);
  assert.equal((await bursary.get('/api/staff/results/options')).status, 403);
  assert.equal((await lecturer.get('/api/staff/audit')).status, 403);
  assert.equal((await bursary.get('/api/staff/audit')).status, 403);

  assert.equal((await admin.get('/api/staff/fees')).status, 200);
  assert.equal((await admin.get('/api/staff/results/options')).status, 200);
  assert.equal((await admin.get('/api/staff/audit')).status, 200);
  assert.equal((await lecturer.get('/api/staff/overview')).status, 200);
});

test('staff pages are guarded', async () => {
  const { app } = setup();
  assert.equal((await request(app).get('/staff-portal.html')).status, 302);
  const agent = await loginStaff(app, 'S1001');
  assert.equal((await agent.get('/staff-portal.html')).status, 200);
});

// ---- Results capture -----------------------------------------------------------

test('results: class list, draft is hidden from student until published, then student is notified', async () => {
  const { app } = setup();
  const lecturer = await loginStaff(app, 'S2001');

  const list = await lecturer.get(`/api/staff/results?semester=${CURRENT}&course=SCS2114`);
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.students.map((s) => s.studentNumber), ['N01234567A']);
  assert.equal(list.body.students[0].status, 'NONE');

  const save = await lecturer.put('/api/staff/results')
    .send({ semesterId: CURRENT, courseCode: 'SCS2114', marks: [{ studentNumber: 'N01234567A', mark: 78 }] });
  assert.equal(save.status, 200);
  assert.equal(save.body.changed, 1);

  const student = await loginStudent(app);
  const before = await student.get('/api/results');
  assert.equal(before.body.semesters.some((s) => s.id === CURRENT), false, 'draft must be hidden');

  const unreadBefore = (await student.get('/api/auth/me')).body.unreadMessages;
  const pub = await lecturer.post('/api/staff/results/publish').send({ semesterId: CURRENT, courseCode: 'SCS2114' });
  assert.equal(pub.body.published, 1);

  const after = await student.get('/api/results');
  const sem = after.body.semesters.find((s) => s.id === CURRENT);
  assert.equal(sem.courses[0].mark, 78);
  assert.equal(sem.courses[0].grade, '1');
  assert.equal((await student.get('/api/auth/me')).body.unreadMessages, unreadBefore + 1);

  const again = await lecturer.post('/api/staff/results/publish').send({ semesterId: CURRENT, courseCode: 'SCS2114' });
  assert.equal(again.status, 409);
});

test('results: editing a published mark sends it back to draft; blank removes it', async () => {
  const { app } = setup();
  const lecturer = await loginStaff(app, 'S2001');
  const body = (mark) => ({ semesterId: '2025-26-S1', courseCode: 'SCS1101', marks: [{ studentNumber: 'N01234567A', mark }] });

  const unchanged = await lecturer.put('/api/staff/results').send(body(74));
  assert.equal(unchanged.body.changed, 0);

  await lecturer.put('/api/staff/results').send(body(76));
  const list = await lecturer.get('/api/staff/results?semester=2025-26-S1&course=SCS1101');
  assert.equal(list.body.students[0].status, 'DRAFT');

  await lecturer.put('/api/staff/results').send(body(null));
  const cleared = await lecturer.get('/api/staff/results?semester=2025-26-S1&course=SCS1101');
  assert.equal(cleared.body.students.length, 0); // not registered, no result → off the list
});

test('results: validation', async () => {
  const { app } = setup();
  const lecturer = await loginStaff(app, 'S2001');
  const put = (marks, courseCode = 'SCS2114') =>
    lecturer.put('/api/staff/results').send({ semesterId: CURRENT, courseCode, marks });

  assert.equal((await put([{ studentNumber: 'N01234567A', mark: 101 }])).status, 400);
  assert.equal((await put([{ studentNumber: 'N01234567A', mark: 65.5 }])).status, 400);
  assert.equal((await put([{ studentNumber: 'N01234567A', mark: '70' }])).status, 400);
  assert.equal((await put([{ studentNumber: 'N07654321B', mark: 70 }])).status, 400); // not in class
  assert.equal((await put([])).status, 400);
  assert.equal((await put([{ studentNumber: 'N01234567A', mark: 70 }], 'NOPE')).status, 404);
});

// ---- Fees and accounts ---------------------------------------------------------

test('fees: add, edit, delete fee items changes the student quote and is audited', async () => {
  const { app } = setup();
  const bursary = await loginStaff(app, 'S3001');
  const student = await loginStudent(app);
  const total = async () => (await student.get('/api/fees/quote')).body.totalCents;

  assert.equal(await total(), 75000);

  const added = await bursary.post('/api/staff/fees').send({ semesterId: CURRENT, description: 'Lab fee', amount: '45.50' });
  assert.equal(added.status, 201);
  assert.equal(await total(), 79550);

  const edit = await bursary.put(`/api/staff/fees/${added.body.id}`).send({ description: 'Laboratory fee', amount: 50 });
  assert.equal(edit.status, 200);
  assert.equal(await total(), 80000);

  assert.equal((await bursary.delete(`/api/staff/fees/${added.body.id}`)).status, 204);
  assert.equal(await total(), 75000);

  assert.equal((await bursary.post('/api/staff/fees').send({ semesterId: CURRENT, description: 'X', amount: 5 })).status, 400);
  assert.equal((await bursary.post('/api/staff/fees').send({ semesterId: CURRENT, description: 'Levy', amount: -5 })).status, 400);
  assert.equal((await bursary.put('/api/staff/fees/9999').send({ description: 'Levy', amount: 5 })).status, 404);

  const admin = await loginStaff(app, 'S1001');
  const actions = (await admin.get('/api/staff/audit')).body.entries.map((e) => e.action);
  assert.deepEqual(actions.slice(0, 3), ['FEE_DELETED', 'FEE_UPDATED', 'FEE_ADDED']);
});

test('accounts: balances listed; bank deposit reduces balance; duplicate reference rejected', async () => {
  const { app } = setup();
  const bursary = await loginStaff(app, 'S3001');

  const list = await bursary.get('/api/staff/accounts');
  const tatenda = list.body.students.find((s) => s.studentNumber === 'N01234567A');
  assert.equal(tatenda.balanceCents, 35000);

  const deposit = { semesterId: CURRENT, amount: 200, reference: 'CBZ-778812', paidOn: '2026-09-01' };
  const res = await bursary.post('/api/staff/accounts/N01234567A/payments').send(deposit);
  assert.equal(res.status, 201);
  assert.equal(res.body.summary.balanceCents, 15000);

  const dup = await bursary.post('/api/staff/accounts/N01234567A/payments').send(deposit);
  assert.equal(dup.status, 409);

  const detail = await bursary.get('/api/staff/accounts/n01234567a');
  assert.equal(detail.body.payments[0].method, 'BANK');
  assert.equal(detail.body.payments[0].recordedBy, 'Blessing Sibanda');

  const bad = (over) => bursary.post('/api/staff/accounts/N01234567A/payments').send({ ...deposit, reference: 'NEW-REF-1', ...over });
  assert.equal((await bad({ amount: 0 })).status, 400);
  assert.equal((await bad({ reference: 'x' })).status, 400);
  assert.equal((await bad({ paidOn: '2999-01-01' })).status, 400);
  assert.equal((await bad({ paidOn: 'yesterday' })).status, 400);
  assert.equal((await bursary.post('/api/staff/accounts/N00000000X/payments').send(deposit)).status, 404);
});

test('overview totals', async () => {
  const { app } = setup();
  const admin = await loginStaff(app, 'S1001');
  const { stats } = (await admin.get('/api/staff/overview')).body;
  assert.equal(stats.students, 2);
  assert.equal(stats.feeTotalCents, 75000);
  assert.equal(stats.collectedCents, 40000);
  assert.equal(stats.outstandingCents, 35000 + 75000);
});
