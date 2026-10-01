const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { openDatabase } = require('../src/db');
const { createApp } = require('../src/app');
const { seed, DEMO_PASSWORD } = require('../src/seed');

function setup() {
  const db = openDatabase(':memory:');
  seed(db);
  const app = createApp({ db, sessionSecret: 'test-secret' });
  return { db, app };
}

async function login(app, studentNumber = 'N01234567A', password = DEMO_PASSWORD) {
  const agent = request.agent(app); // keeps the session cookie between requests
  const res = await agent.post('/api/auth/login').send({ studentNumber, password });
  assert.equal(res.status, 200);
  return agent;
}

test('login: wrong password gives a generic 401', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/login').send({ studentNumber: 'N01234567A', password: 'nope' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid student number or password.');
});

test('login: unknown student gets the same message', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/login').send({ studentNumber: 'N00000000X', password: 'nope' });
  assert.equal(res.status, 401);
  assert.equal(res.body.error, 'Invalid student number or password.');
});

test('login: student number is case-insensitive and the cookie is httpOnly', async () => {
  const { app } = setup();
  const res = await request(app).post('/api/auth/login').send({ studentNumber: 'n01234567a', password: DEMO_PASSWORD });
  assert.equal(res.status, 200);
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
});

test('login: rate limited after 5 failures', async () => {
  const { app } = setup();
  for (let i = 0; i < 5; i++) {
    await request(app).post('/api/auth/login').send({ studentNumber: 'N01234567A', password: 'bad' });
  }
  const res = await request(app).post('/api/auth/login').send({ studentNumber: 'N01234567A', password: DEMO_PASSWORD });
  assert.equal(res.status, 429);
});

test('protected routes need a session', async () => {
  const { app } = setup();
  for (const path of ['/api/me/dashboard', '/api/results', '/api/fees/quote', '/api/messages']) {
    assert.equal((await request(app).get(path)).status, 401, path);
  }
  const page = await request(app).get('/dashboard.html');
  assert.equal(page.status, 302);
});

test('dashboard returns profile and registered courses without the password hash', async () => {
  const { app } = setup();
  const agent = await login(app);
  const res = await agent.get('/api/me/dashboard');
  assert.equal(res.status, 200);
  assert.equal(res.body.student.firstName, 'Tatenda');
  assert.equal(res.body.courses.length, 6);
  assert.ok(!JSON.stringify(res.body).includes('password'));
});

test('logout ends the session', async () => {
  const { app } = setup();
  const agent = await login(app);
  assert.equal((await agent.post('/api/auth/logout')).status, 204);
  assert.equal((await agent.get('/api/me/dashboard')).status, 401);
});

test('registration: exactly six courses, cores compulsory, valid selection is saved', async () => {
  const { app } = setup();
  const agent = await login(app, 'N07654321B');

  const before = await agent.get('/api/registration');
  assert.equal(before.body.isRegistered, false);
  assert.equal(before.body.required, 6);
  const cores = before.body.courses.filter((c) => c.type === 'CORE').map((c) => c.code);
  assert.equal(cores.length, 5); // level 1.1 has 5 cores + 2 electives

  const tooFew = await agent.post('/api/registration').send({ courseCodes: cores });
  assert.equal(tooFew.status, 400);
  assert.match(tooFew.body.error, /exactly 6/);

  const tooMany = await agent.post('/api/registration').send({ courseCodes: [...cores, 'SCS1105', 'SCM1101'] });
  assert.equal(tooMany.status, 400);
  assert.match(tooMany.body.error, /exactly 6/);

  // Six courses, but a core was swapped for both electives.
  const missingCore = await agent.post('/api/registration').send({ courseCodes: [...cores.slice(1), 'SCS1105', 'SCM1101'] });
  assert.equal(missingCore.status, 400);
  assert.match(missingCore.body.error, /compulsory/);

  const good = await agent.post('/api/registration').send({ courseCodes: [...cores, 'SCS1105'] });
  assert.equal(good.status, 200);
  assert.equal(good.body.credits, 72);

  const after = await agent.get('/api/me/dashboard');
  assert.equal(after.body.courses.length, 6);
});

test('registration: locked once marks exist for the semester', async () => {
  const { app, db } = setup();
  const agent = await login(app); // Tatenda, registered for six 2.1 courses
  db.prepare(`INSERT INTO results (student_id, course_code, semester_id, mark, published)
              SELECT id, 'SCS2114', '2026-27-S1', 70, 0 FROM students WHERE student_number = 'N01234567A'`).run();

  assert.equal((await agent.get('/api/registration')).body.locked, true);
  const res = await agent.post('/api/registration')
    .send({ courseCodes: ['SCS2104', 'SCS2108', 'SCS2110', 'SCS2111', 'SCS2114', 'SCS2116'] });
  assert.equal(res.status, 409);
});

test('registration: cannot register for another level', async () => {
  const { app } = setup();
  const agent = await login(app, 'N07654321B');
  const res = await agent.post('/api/registration').send({ courseCodes: ['SCS2114'] });
  assert.equal(res.status, 400);
});

test('results: graded, averaged, with overall remark per semester', async () => {
  const { app } = setup();
  const agent = await login(app);
  const res = await agent.get('/api/results');
  const [s1, s2, current] = res.body.semesters;
  assert.equal(res.body.semesters.length, 3);

  assert.equal(s1.courses.find((c) => c.code === 'SCS1102').grade, '1');
  assert.deepEqual(s1.remark, { code: 'PASS', failed: [], text: 'PASS' });

  assert.equal(s2.remark.code, 'PROCEED_CARRYING');
  assert.equal(s2.remark.text, 'PROCEED CARRYING SMA1201');
  assert.equal(s2.courses.find((c) => c.code === 'SMA1201').passed, false);

  // Current semester: six registered courses, no published marks yet.
  assert.equal(current.courses.length, 6);
  assert.ok(current.courses.every((c) => c.mark === null));
  assert.equal(current.remark.text, 'PENDING — 0 of 6 results available');

  assert.equal(typeof res.body.overall.average, 'number');
});

test('results: three failed courses give REPEAT with the course codes', async () => {
  const { app } = setup();
  const agent = await login(app, 'N05555555C');
  const { semesters } = (await agent.get('/api/results')).body;
  assert.equal(semesters[0].remark.text, 'REPEAT SCS1101, SCS1102, SMA1101');
  assert.deepEqual(semesters[0].remark.failed, ['SCS1101', 'SCS1102', 'SMA1101']);

  const dash = (await agent.get('/api/me/dashboard')).body;
  assert.equal(dash.latestRemark.code, 'REPEAT');
  assert.match(dash.announcement, /examinations/);
});

// ---- Student self-registration ---------------------------------------------

const newStudent = {
  studentNumber: 'n09999999z', firstName: 'Chipo', lastName: 'Ncube', nationalId: '58-1234567K58',
  email: 'Chipo@Example.com', phone: '077 123 4567', gender: 'Female', dateOfBirth: '2006-05-14',
  programmeCode: 'BSCCS', level: '1.1', password: 'Secret2026',
};

test('signup: lists programmes, creates the account, logs the student in', async () => {
  const { app, db } = setup();
  const { programmes } = (await request(app).get('/api/public/programmes')).body;
  assert.deepEqual(programmes[0].levels, ['1.1', '1.2', '2.1']);

  const agent = request.agent(app);
  const res = await agent.post('/api/auth/signup').send(newStudent);
  assert.equal(res.status, 201);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.studentNumber, 'N09999999Z');
  assert.equal(me.body.unreadMessages, 1); // welcome message

  const row = db.prepare("SELECT email, phone, password_hash FROM students WHERE student_number = 'N09999999Z'").get();
  assert.equal(row.email, 'chipo@example.com');
  assert.equal(row.phone, '0771234567');
  assert.notEqual(row.password_hash, newStudent.password);

  await login(app, 'N09999999Z', 'Secret2026');
});

test('signup: validation and duplicate student number', async () => {
  // A fresh app per attempt, so the 5-per-hour sign-up limit doesn't interfere.
  const post = (over) => request(setup().app).post('/api/auth/signup').send({ ...newStudent, ...over });

  assert.equal((await post({ studentNumber: '12345' })).status, 400);
  assert.equal((await post({ nationalId: 'abc' })).status, 400);
  assert.equal((await post({ email: 'not-an-email' })).status, 400);
  assert.equal((await post({ phone: '12345' })).status, 400);
  assert.equal((await post({ dateOfBirth: '2025-01-01' })).status, 400); // too young
  assert.equal((await post({ dateOfBirth: '2006-02-30' })).status, 400); // not a real date
  assert.equal((await post({ level: '4.2' })).status, 400); // level not offered
  assert.equal((await post({ password: 'short' })).status, 400);
  assert.equal((await post({ firstName: '<script>' })).status, 400);

  const dup = await post({ studentNumber: 'N01234567A' });
  assert.equal(dup.status, 409);
});

test('signup: limited to 5 attempts per hour per network', async () => {
  const { app } = setup();
  for (let i = 0; i < 5; i++) await request(app).post('/api/auth/signup').send({});
  const res = await request(app).post('/api/auth/signup').send(newStudent);
  assert.equal(res.status, 429);
});

test('deactivated student: cannot log in and is logged out at once', async () => {
  const { app, db } = setup();
  const agent = await login(app);
  db.prepare("UPDATE students SET is_active = 0 WHERE student_number = 'N01234567A'").run();
  assert.equal((await agent.get('/api/me/dashboard')).status, 401);
  const res = await request(app).post('/api/auth/login').send({ studentNumber: 'N01234567A', password: DEMO_PASSWORD });
  assert.equal(res.status, 401);
});

test('payments: validation, then balance goes down', async () => {
  const { app } = setup();
  const agent = await login(app);

  const quote = await agent.get('/api/fees/quote');
  assert.equal(quote.body.totalCents, 75000);
  assert.equal(quote.body.balanceCents, 35000);

  assert.equal((await agent.post('/api/payments').send({ method: 'ECOCASH', amount: 50, phone: '12345' })).status, 400);
  assert.equal((await agent.post('/api/payments').send({ method: 'ECOCASH', amount: 0, phone: '0771234567' })).status, 400);
  assert.equal((await agent.post('/api/payments').send({ method: 'BITCOIN', amount: 50 })).status, 400);

  const paid = await agent.post('/api/payments').send({ method: 'ECOCASH', amount: 120.5, phone: '0771234567' });
  assert.equal(paid.status, 201);
  assert.match(paid.body.reference, /^ECO-/);
  assert.equal(paid.body.balanceCents, 35000 - 12050);

  const me = await agent.get('/api/auth/me');
  assert.equal(me.body.unreadMessages, 2); // seeded unread + payment receipt
});

test('messages: students cannot mark each other\'s messages', async () => {
  const { app, db } = setup();
  const rudoMsg = db.prepare("SELECT m.id FROM messages m JOIN students s ON s.id = m.student_id WHERE s.student_number = 'N07654321B'").get();
  const agent = await login(app);
  assert.equal((await agent.patch(`/api/messages/${rudoMsg.id}/read`)).status, 404);
});

test('enquiries: validated and stored', async () => {
  const { app } = setup();
  const agent = await login(app);
  assert.equal((await agent.post('/api/enquiries').send({ category: 'Nope', subject: 'x', message: 'short' })).status, 400);
  const ok = await agent.post('/api/enquiries').send({
    category: 'Fees & Payments', subject: 'Receipt', message: 'Please send my August receipt.',
  });
  assert.equal(ok.status, 201);
  assert.equal((await agent.get('/api/enquiries')).body.enquiries.length, 1);
});

test('change password: old one stops working', async () => {
  const { app } = setup();
  const agent = await login(app);
  const res = await agent.put('/api/auth/password').send({ currentPassword: DEMO_PASSWORD, newPassword: 'NewPass2026' });
  assert.equal(res.status, 200);
  const old = await request(app).post('/api/auth/login').send({ studentNumber: 'N01234567A', password: DEMO_PASSWORD });
  assert.equal(old.status, 401);
  await login(app, 'N01234567A', 'NewPass2026');
});

test('landing page: shown when logged out, skipped when logged in', async () => {
  const { app } = setup();
  const landing = await request(app).get('/');
  assert.equal(landing.status, 200);
  assert.match(landing.text, /choose your portal/);
  assert.equal((await request(app).get('/student.html')).status, 200);
  assert.equal((await request(app).get('/dashboard.html')).headers.location, '/student.html');

  const student = await login(app);
  for (const page of ['/', '/student.html', '/staff.html']) {
    const res = await student.get(page);
    assert.equal(res.status, 302, page);
    assert.equal(res.headers.location, '/dashboard.html', page);
  }
});
