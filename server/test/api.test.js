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

test('registration: missing core is rejected, valid selection is saved', async () => {
  const { app } = setup();
  const agent = await login(app, 'N07654321B');

  const before = await agent.get('/api/registration');
  assert.equal(before.body.isRegistered, false);
  const cores = before.body.courses.filter((c) => c.type === 'CORE').map((c) => c.code);

  const bad = await agent.post('/api/registration').send({ courseCodes: cores.slice(1) });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /compulsory/);

  const good = await agent.post('/api/registration').send({ courseCodes: [...cores, 'SCS1105'] });
  assert.equal(good.status, 200);
  assert.equal(good.body.credits, 84);

  const after = await agent.get('/api/me/dashboard');
  assert.equal(after.body.courses.length, 7);
});

test('registration: cannot register for another level', async () => {
  const { app } = setup();
  const agent = await login(app, 'N07654321B');
  const res = await agent.post('/api/registration').send({ courseCodes: ['SCS2114'] });
  assert.equal(res.status, 400);
});

test('results are graded and averaged', async () => {
  const { app } = setup();
  const agent = await login(app);
  const res = await agent.get('/api/results');
  assert.equal(res.body.semesters.length, 2);
  const scs1102 = res.body.semesters[0].courses.find((c) => c.code === 'SCS1102');
  assert.equal(scs1102.grade, '1');
  assert.equal(typeof res.body.overall.average, 'number');
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
