# NUST Student Portal — Coursework Prototype

A full-stack recreation of the NUST Student Portal built as a web-development learning project.

> **Disclaimer:** Educational project only. Not affiliated with NUST. All student data is
> fictional and all payments are **simulated** — no money moves and no card details are collected.

| Layer    | Technology                                   |
|----------|----------------------------------------------|
| Frontend | HTML5, CSS3, vanilla JavaScript (ES modules) |
| Backend  | Node.js + Express 5                          |
| Database | SQLite (`better-sqlite3`)                    |
| Auth     | bcrypt password hashes + server sessions     |
| Testing  | `node:test` + `supertest`                    |

## Live demo

**https://nust-student-portal.onrender.com** — hosted on Render's free plan.
The first visit after 15 minutes of inactivity takes about 50 seconds to wake up, and the data
resets to the demo accounts below whenever it wakes or redeploys.

## Quick start (run it on your own computer)

```bash
cd server
npm install
npm run seed      # creates data/portal.db with demo data
npm start         # http://localhost:3000  → choose Student Portal or Staff Portal
```

Copy `server/.env.example` to `server/.env` and change `SESSION_SECRET` before deploying anywhere.

### Demo accounts (fictional)

| Student number | Password      | Scenario                                              |
|----------------|---------------|-------------------------------------------------------|
| `N01234567A`   | `Portal@2026` | Level 2.1, registered for six courses; past remarks **PASS** and **PROCEED CARRYING SMA1201** |
| `N07654321B`   | `Portal@2026` | Level 1.1, **not yet registered** — try registering six courses |
| `N05555555C`   | `Portal@2026` | Level 1.1, past remark **REPEAT SCS1101, SCS1102, SMA1101** |

New students can also **create their own account** from the Student Portal login page.

Staff accounts (password `Staff@2026` for all) — choose **Staff Portal** on the landing page:

| Staff number | Role          | Can do                                         |
|--------------|---------------|------------------------------------------------|
| `S2001`      | Lecturer      | Upload/update marks for **his** Computer Science courses |
| `S2002`      | Lecturer      | Upload/update marks for **her** Maths, Statistics and general courses |
| `S3001`      | Bursary       | Fee structure, student balances, bank deposits |
| `S1001`      | Administrator | Manage users, courses and system information; everything else; activity log |

## Features

### v0.3 — coursework brief: accounts, six courses, overall remark
- **Students create accounts** (validated sign-up form, rate-limited) and **register for exactly six courses**
  (core courses compulsory; locked once marks are entered)
- **Overall remark** calculated automatically from a semester's six courses (`server/src/lib/remarks.js`):
  - all passed → **PASS**
  - 1–2 failed → **PROCEED CARRYING** + failed course codes
  - 3+ failed → **REPEAT** + failed course codes
  - **PENDING** until all six results are published
- Students see individual marks, failed courses (highlighted) and the remark, on the results page and dashboard
- **Lecturers** upload/update marks only for **the courses assigned to them** — typed in or **uploaded from CSV**
- **Administrators** manage **users** (create staff, roles, activate/deactivate, reset passwords, student levels),
  **courses** (add/edit/delete, assign lecturers) and **system information** (semesters, registration open/closed,
  announcement, help desk contact, statistics)

### Staff portal (v0.2)
- Role-based access (Lecturer / Bursary / Administrator), enforced by the server on every request
- Capture results per course and semester → saved as **drafts** → **publish** to make them visible;
  students are notified by message. Editing a published mark returns it to draft.
- Fee structure per semester: add, edit, delete fee items (applies to every student's quote)
- Student accounts: balances for all students, per-student history, record bank deposits
- Activity log of every staff change (admin only)

### Student portal

- Login page styled after the real portal
- Dashboard: service tiles, registration banner, personal details, registered courses
- New Registration — exactly six courses, core courses compulsory, only while registration is open
- Printable fees quote with live balance
- Simulated payments (EcoCash, FBC online) and payments history
- Examination results with grades, failed courses, credit-weighted averages and the overall remark
- Continuous assessment marks
- Printable exams timetable
- Messages with unread badge, enquiries, change password
- Responsive — collapsible sidebar on phones

## Structure

```
nust-student-portal/
├── docs/        SDLC deliverables (planning → maintenance)
├── client/      Frontend (static files served by Express)
│   ├── index.html           Landing page: choose Student or Staff portal
│   ├── student.html         Student login
│   ├── signup.html          Student self-registration
│   ├── dashboard.html       Student portal (single-page app, hash routing)
│   ├── staff.html           Staff login
│   ├── staff-portal.html    Staff portal
│   ├── js/shell.js          Sidebar + router shared by both portals
│   ├── js/views/            Student views
│   ├── js/staff/            Staff app + views
│   ├── css/ img/
└── server/
    ├── src/
    │   ├── server.js        Entry point
    │   ├── app.js           Express app factory (used by tests too)
    │   ├── db.js            Opens DB, applies schema.sql then migrations/
    │   ├── schema.sql       Baseline schema (v0.1)
    │   ├── migrations/      Numbered upgrades (001 = staff, publishing, audit log; 002 = accounts, lecturers, settings)
    │   ├── seed.js
    │   ├── lib/             Pure rules and helpers (grading, remarks, registration, results, money, fees, passwords, audit, validation)
    │   ├── middleware/      requireAuth / requireStaff(role), login limiter, security headers
    │   └── routes/          student routes + routes/staff/ (auth, results, finance, admin, manage)
    └── test/                rules, student API, staff API
```

## Scripts (inside `server/`)

| Command        | What it does                          |
|----------------|---------------------------------------|
| `npm start`    | Start the server                       |
| `npm run dev`  | Start with auto-restart on file change |
| `npm run seed` | Reset the database to demo data        |
| `npm test`     | Run unit and API tests                 |
