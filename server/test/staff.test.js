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
  assert.equal(db.pragma('user_version', { simple: true }), 2); // every migration applied
  assert.equal(db.prepare('SELECT published FROM results').get().published, 1);
  assert.equal(db.prepare('SELECT is_active FROM students').get().is_active, 1);

  migrate(db); // running again is a no-op
  assert.equal(db.pragma('user_version', { simple: true }), 2);
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
  const draftCourse = before.body.semesters.find((s) => s.id === CURRENT).courses.find((c) => c.code === 'SCS2114');
  assert.equal(draftCourse.mark, null, 'draft must be hidden');

  const unreadBefore = (await student.get('/api/auth/me')).body.unreadMessages;
  const pub = await lecturer.post('/api/staff/results/publish').send({ semesterId: CURRENT, courseCode: 'SCS2114' });
  assert.equal(pub.body.published, 1);

  const after = await student.get('/api/results');
  const sem = after.body.semesters.find((s) => s.id === CURRENT);
  const published = sem.courses.find((c) => c.code === 'SCS2114');
  assert.equal(published.mark, 78);
  assert.equal(published.grade, '1');
  assert.equal(sem.remark.text, 'PENDING — 1 of 6 results available');
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
  assert.deepEqual(cleared.body.students.map((s) => s.studentNumber), ['N05555555C']); // Tatenda: not registered, no result → off the list
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
  assert.equal(stats.students, 3);
  assert.equal(stats.feeTotalCents, 75000);
  assert.equal(stats.collectedCents, 40000);
  assert.equal(stats.outstandingCents, 35000 + 75000 + 75000);
});

// ---- v0.3: lecturers mark only their own courses -------------------------------

test('lecturer sees and marks only assigned courses; admin can mark any', async () => {
  const { app } = setup();
  const farai = await loginStaff(app, 'S2001'); // Computer Science courses
  const rumbi = await loginStaff(app, 'S2002'); // Maths/Stats courses
  const admin = await loginStaff(app, 'S1001');

  const options = (await farai.get('/api/staff/results/options')).body;
  const codes = options.courses.map((c) => c.code);
  assert.ok(codes.includes('SCS2114'));
  assert.ok(!codes.includes('SORS2110'));
  assert.equal(options.onlyMine, true);

  const mark = (agent, courseCode) => agent.put('/api/staff/results')
    .send({ semesterId: CURRENT, courseCode, marks: [{ studentNumber: 'N01234567A', mark: 40 }] });

  assert.equal((await farai.get(`/api/staff/results?semester=${CURRENT}&course=SORS2110`)).status, 403);
  assert.equal((await mark(farai, 'SORS2110')).status, 403);
  assert.equal((await farai.post('/api/staff/results/publish').send({ semesterId: CURRENT, courseCode: 'SORS2110' })).status, 403);

  assert.equal((await mark(rumbi, 'SORS2110')).status, 200);
  assert.equal((await mark(admin, 'SCS2104')).status, 200);
  assert.ok((await admin.get('/api/staff/results/options')).body.courses.length > codes.length);

  const overview = (await farai.get('/api/staff/overview')).body;
  assert.ok(overview.myCourses.some((c) => c.code === 'SCS2114' && c.students === 1));
});

test('remark appears once all six courses are published', async () => {
  const { app } = setup();
  const farai = await loginStaff(app, 'S2001');
  const rumbi = await loginStaff(app, 'S2002');
  // Tatenda's six: SCS2104, SCS2108, SCS2111, SCS2114 (Farai); SCS2110, SORS2110 (Rumbidzai)
  const marks = { SCS2104: 70, SCS2108: 45, SCS2111: 66, SCS2114: 80, SCS2110: 30, SORS2110: 55 };
  for (const [courseCode, mark] of Object.entries(marks)) {
    const agent = ['SCS2110', 'SORS2110'].includes(courseCode) ? rumbi : farai;
    await agent.put('/api/staff/results').send({ semesterId: CURRENT, courseCode, marks: [{ studentNumber: 'N01234567A', mark }] });
    await agent.post('/api/staff/results/publish').send({ semesterId: CURRENT, courseCode });
  }
  const student = await loginStudent(app);
  const sem = (await student.get('/api/results')).body.semesters.find((s) => s.id === CURRENT);
  assert.equal(sem.remark.text, 'PROCEED CARRYING SCS2108, SCS2110');
});

// ---- v0.3: administration ------------------------------------------------------

test('admin only: lecturer and bursary cannot reach management APIs', async () => {
  const { app } = setup();
  for (const number of ['S2001', 'S3001']) {
    const agent = await loginStaff(app, number);
    assert.equal((await agent.get('/api/staff/manage/users')).status, 403, number);
    assert.equal((await agent.get('/api/staff/manage/courses')).status, 403, number);
    assert.equal((await agent.get('/api/staff/manage/system')).status, 403, number);
  }
  const student = await loginStudent(app);
  assert.equal((await student.get('/api/staff/manage/users')).status, 401);
});

test('admin users: create staff, change role, deactivate, reset password, protect self', async () => {
  const { app } = setup();
  const admin = await loginStaff(app, 'S1001');

  const newStaff = { staffNumber: 's2003', firstName: 'Tapiwa', lastName: 'Moyo', email: 'tapiwa@example.ac.zw', role: 'ACADEMIC', password: 'Lecturer2026' };
  assert.equal((await admin.post('/api/staff/manage/staff').send(newStaff)).status, 201);
  assert.equal((await admin.post('/api/staff/manage/staff').send(newStaff)).status, 409);
  assert.equal((await admin.post('/api/staff/manage/staff').send({ ...newStaff, staffNumber: 'S2004', password: 'weak' })).status, 400);

  const newLecturer = request.agent(app);
  assert.equal((await newLecturer.post('/api/staff/auth/login').send({ staffNumber: 'S2003', password: 'Lecturer2026' })).status, 200);

  // Changing Farai's role unassigns his courses.
  const demote = await admin.patch('/api/staff/manage/staff/S2001').send({ role: 'BURSARY' });
  assert.equal(demote.status, 200);
  assert.ok(demote.body.unassignedCourses > 0);

  // Deactivating ends access immediately.
  assert.equal((await admin.patch('/api/staff/manage/staff/S2003').send({ isActive: false })).status, 200);
  assert.equal((await newLecturer.get('/api/staff/overview')).status, 401);

  // An admin cannot lock themselves out.
  assert.equal((await admin.patch('/api/staff/manage/staff/S1001').send({ isActive: false })).status, 400);
  assert.equal((await admin.patch('/api/staff/manage/staff/S1001').send({ role: 'BURSARY' })).status, 400);

  // Password reset for a student.
  assert.equal((await admin.post('/api/staff/manage/students/N07654321B/password').send({ newPassword: 'weak' })).status, 400);
  assert.equal((await admin.post('/api/staff/manage/students/N07654321B/password').send({ newPassword: 'NewRudo2026' })).status, 200);
  const rudo = request.agent(app);
  assert.equal((await rudo.post('/api/auth/login').send({ studentNumber: 'N07654321B', password: 'NewRudo2026' })).status, 200);

  // Deactivate a student, change a level.
  assert.equal((await admin.patch('/api/staff/manage/students/N07654321B').send({ isActive: false })).status, 200);
  assert.equal((await rudo.get('/api/me/dashboard')).status, 401);
  assert.equal((await admin.patch('/api/staff/manage/students/N05555555C').send({ level: '9.9' })).status, 400);
  assert.equal((await admin.patch('/api/staff/manage/students/N05555555C').send({ level: '1.2' })).status, 200);

  const users = (await admin.get('/api/staff/manage/users')).body;
  assert.equal(users.students.find((s) => s.studentNumber === 'N07654321B').isActive, false);
  assert.equal(users.staff.find((s) => s.staffNumber === 'S1001').isMe, true);

  const auditBody = (await admin.get('/api/staff/audit')).body;
  const actions = auditBody.entries.map((e) => e.action);
  assert.ok(actions.includes('STAFF_CREATED') && actions.includes('PASSWORD_RESET') && actions.includes('STUDENT_UPDATED'));
  assert.ok(!JSON.stringify(auditBody).includes('NewRudo2026'), 'passwords are never logged');
});

test('admin courses: add, assign lecturer, edit, delete only when unused', async () => {
  const { app } = setup();
  const admin = await loginStaff(app, 'S1001');
  const course = { code: 'scs2120', name: 'Cloud Computing', credits: 12, level: '2.1', type: 'ELECTIVE', programmeCode: 'BSCCS', lecturerNumber: 'S2002' };

  assert.equal((await admin.post('/api/staff/manage/courses').send(course)).status, 201);
  assert.equal((await admin.post('/api/staff/manage/courses').send(course)).status, 409);
  assert.equal((await admin.post('/api/staff/manage/courses').send({ ...course, code: 'BAD' })).status, 400);
  assert.equal((await admin.post('/api/staff/manage/courses').send({ ...course, code: 'SCS2121', lecturerNumber: 'S3001' })).status, 400); // bursary is not a lecturer
  assert.equal((await admin.post('/api/staff/manage/courses').send({ ...course, code: 'SCS2122', credits: 0 })).status, 400);

  const rumbi = await loginStaff(app, 'S2002');
  assert.ok((await rumbi.get('/api/staff/results/options')).body.courses.some((c) => c.code === 'SCS2120'));

  assert.equal((await admin.put('/api/staff/manage/courses/SCS2120').send({ ...course, name: 'Cloud Computing I', lecturerNumber: '' })).status, 200);
  const updated = (await admin.get('/api/staff/manage/courses')).body.courses.find((c) => c.code === 'SCS2120');
  assert.equal(updated.name, 'Cloud Computing I');
  assert.equal(updated.lecturerNumber, null);

  assert.equal((await admin.delete('/api/staff/manage/courses/SCS2120')).status, 204);
  assert.equal((await admin.delete('/api/staff/manage/courses/SCS2114')).status, 409); // has registrations
  assert.equal((await admin.delete('/api/staff/manage/courses/NOPE123')).status, 404);
});

test('admin system: settings, add semester, switch current, toggle registration', async () => {
  const { app } = setup();
  const admin = await loginStaff(app, 'S1001');

  const system = (await admin.get('/api/staff/manage/system')).body;
  assert.equal(system.system.schemaVersion, 2);
  assert.equal(system.stats.students, 3);
  assert.equal(system.semesters.filter((s) => s.isCurrent).length, 1);

  assert.equal((await admin.put('/api/staff/manage/settings').send({ announcement: 'Graduation is on 20 November.' })).status, 200);
  const student = await loginStudent(app);
  assert.equal((await student.get('/api/me/dashboard')).body.announcement, 'Graduation is on 20 November.');
  assert.equal((await admin.put('/api/staff/manage/settings').send({ announcement: 'x'.repeat(501) })).status, 400);

  const sem = { id: '2026-27-S2', label: '2026/2027 Semester 2', startsOn: '2027-01-18', endsOn: '2027-06-04' };
  assert.equal((await admin.post('/api/staff/manage/semesters').send(sem)).status, 201);
  assert.equal((await admin.post('/api/staff/manage/semesters').send(sem)).status, 409);
  assert.equal((await admin.post('/api/staff/manage/semesters').send({ ...sem, id: '2027-28-S1', endsOn: '2026-01-01' })).status, 400);

  assert.equal((await admin.patch(`/api/staff/manage/semesters/${CURRENT}`).send({ registrationOpen: false })).status, 200);
  assert.equal((await student.post('/api/registration').send({ courseCodes: [] })).status, 409); // closed

  assert.equal((await admin.patch('/api/staff/manage/semesters/2026-27-S2').send({ isCurrent: true })).status, 200);
  const after = (await admin.get('/api/staff/manage/system')).body.semesters;
  assert.deepEqual(after.filter((s) => s.isCurrent).map((s) => s.id), ['2026-27-S2']);
  assert.equal((await admin.patch('/api/staff/manage/semesters/2026-27-S2').send({ isCurrent: false })).status, 400);
});
