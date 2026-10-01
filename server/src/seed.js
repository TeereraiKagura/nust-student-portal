/*
 * Demo data. Every person here is FICTIONAL.
 * Students — password "Portal@2026"
 *   N01234567A — level 2.1, registered for six courses; past remarks PASS and PROCEED CARRYING
 *   N07654321B — level 1.1, not yet registered
 *   N05555555C — level 1.1, past remark REPEAT (failed three courses)
 * Staff — password "Staff@2026"
 *   S1001 — Administrator (users, courses, system, everything)
 *   S2001 — Lecturer, Computer Science courses
 *   S2002 — Lecturer, Mathematics, Statistics and general courses
 *   S3001 — Bursary (fees and student accounts)
 */
const { hashPassword } = require('./lib/passwords');

const DEMO_PASSWORD = 'Portal@2026';
const STAFF_PASSWORD = 'Staff@2026';
const PROGRAMME = 'BSCCS';

// [code, name, credits, level, type, lecturer]. Every level offers at least six courses;
// students register for exactly six, and all CORE courses are compulsory.
const COURSES = [
  // Level 1.1 — 5 core + 2 electives
  ['SCS1101', 'Introduction to Computer Science', 12, '1.1', 'CORE', 'S2001'],
  ['SCS1102', 'Programming Fundamentals', 12, '1.1', 'CORE', 'S2001'],
  ['SCS1103', 'Digital Logic Design', 12, '1.1', 'CORE', 'S2001'],
  ['SMA1101', 'Calculus I', 12, '1.1', 'CORE', 'S2002'],
  ['SMA1102', 'Linear Algebra', 12, '1.1', 'CORE', 'S2002'],
  ['SCM1101', 'Communication Skills', 12, '1.1', 'ELECTIVE', 'S2002'],
  ['SCS1105', 'Introduction to Entrepreneurship', 12, '1.1', 'ELECTIVE', 'S2001'],
  // Level 1.2 — 6 core
  ['SCS1201', 'Data Structures and Algorithms', 12, '1.2', 'CORE', 'S2001'],
  ['SCS1202', 'Computer Architecture', 12, '1.2', 'CORE', 'S2001'],
  ['SCS1203', 'Discrete Mathematics', 12, '1.2', 'CORE', 'S2002'],
  ['SCS1204', 'Database Systems I', 12, '1.2', 'CORE', 'S2001'],
  ['SCS1205', 'Operating Systems Concepts', 12, '1.2', 'CORE', 'S2001'],
  ['SMA1201', 'Calculus II', 12, '1.2', 'CORE', 'S2002'],
  // Level 2.1 — 5 core + 3 electives
  ['SCS2104', 'Structured Systems Analysis and Design', 12, '2.1', 'CORE', 'S2001'],
  ['SCS2108', 'Object Oriented Software Concepts and Development', 12, '2.1', 'CORE', 'S2001'],
  ['SCS2110', 'Research Methods', 12, '2.1', 'CORE', 'S2002'],
  ['SCS2111', 'Data Communications and Computer Networks', 12, '2.1', 'CORE', 'S2001'],
  ['SCS2114', 'Web Development', 12, '2.1', 'CORE', 'S2001'],
  ['SORS2110', 'Introduction to Applied Statistics', 12, '2.1', 'ELECTIVE', 'S2002'],
  ['SCS2116', 'Mobile Application Development', 12, '2.1', 'ELECTIVE', 'S2001'],
  ['SCS2118', 'Human Computer Interaction', 12, '2.1', 'ELECTIVE', 'S2001'],
];

const CURRENT = '2026-27-S1';

function seed(db) {
  const hash = hashPassword(DEMO_PASSWORD);
  const staffHash = hashPassword(STAFF_PASSWORD);

  db.transaction(() => {
    // Children first so foreign keys are never violated.
    for (const table of ['enquiries', 'messages', 'payments', 'fee_items', 'exam_timetable', 'assessments',
      'results', 'registrations', 'courses', 'audit_log', 'staff', 'students', 'semesters', 'programmes', 'settings']) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    db.prepare("DELETE FROM sqlite_sequence").run();

    const setting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
    setting.run('announcement', 'Semester 1 examinations begin on 16 November 2026. Check your Exams Timetable.');
    setting.run('helpdesk_contact', 'ICT Help Desk — helpdesk@example.ac.zw');

    db.prepare('INSERT INTO programmes (code, name, faculty) VALUES (?, ?, ?)')
      .run(PROGRAMME, 'BSc Honours in Computer Science', 'Faculty of Applied Sciences');

    const sem = db.prepare(`INSERT INTO semesters (id, label, starts_on, ends_on, is_current, registration_open)
                            VALUES (?, ?, ?, ?, ?, ?)`);
    sem.run('2025-26-S1', '2025/2026 Semester 1', '2025-08-04', '2025-12-12', 0, 0);
    sem.run('2025-26-S2', '2025/2026 Semester 2', '2026-01-19', '2026-06-05', 0, 0);
    sem.run(CURRENT, '2026/2027 Semester 1', '2026-08-03', '2026-12-11', 1, 1);

    const staff = db.prepare(`INSERT INTO staff (staff_number, password_hash, first_name, last_name, email, role)
                              VALUES (?, ?, ?, ?, ?, ?)`);
    const staffIds = {};
    for (const [number, first, last, role] of [
      ['S1001', 'Nomsa', 'Dube', 'ADMIN'],
      ['S2001', 'Farai', 'Chikwanha', 'ACADEMIC'],
      ['S2002', 'Rumbidzai', 'Mlambo', 'ACADEMIC'],
      ['S3001', 'Blessing', 'Sibanda', 'BURSARY'],
    ]) {
      const email = `${first}.${last}@staff.example.ac.zw`.toLowerCase();
      staffIds[number] = staff.run(number, staffHash, first, last, email, role).lastInsertRowid;
    }

    const course = db.prepare(`INSERT INTO courses (code, name, credits, level, type, lecturer_id, programme_code)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`);
    for (const [code, name, credits, level, type, lecturer] of COURSES) {
      course.run(code, name, credits, level, type, staffIds[lecturer], PROGRAMME);
    }

    const student = db.prepare(`INSERT INTO students
      (student_number, password_hash, first_name, last_name, national_id, address_line1, address_line2,
       country, phone, email, gender, date_of_birth, place_of_birth, programme_code, level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    const tatenda = student.run('N01234567A', hash, 'Tatenda', 'Moyo', '63-123456A07', '12 Leopold Takawira Avenue',
      'Suburbs, Bulawayo', 'Zimbabwe', '+263771000001', 'n01234567a@students.example.ac.zw', 'Male',
      '2004-03-15', 'Bulawayo', PROGRAMME, '2.1').lastInsertRowid;
    const rudo = student.run('N07654321B', hash, 'Rudo', 'Ndlovu', '08-765432B18', '45 Fife Street',
      'City Centre, Bulawayo', 'Zimbabwe', '+263782000002', 'n07654321b@students.example.ac.zw', 'Female',
      '2007-07-02', 'Gweru', PROGRAMME, '1.1').lastInsertRowid;
    const kudzai = student.run('N05555555C', hash, 'Kudzai', 'Banda', '29-555555C29', '7 Jason Moyo Street',
      'Bradfield, Bulawayo', 'Zimbabwe', '+263713000003', 'n05555555c@students.example.ac.zw', 'Female',
      '2006-11-20', 'Kwekwe', PROGRAMME, '1.1').lastInsertRowid;

    // Past results — six courses per semester, all published.
    const result = db.prepare('INSERT INTO results (student_id, course_code, semester_id, mark) VALUES (?, ?, ?, ?)');
    const pastResults = [
      // Tatenda 1.1: all passed → PASS
      [tatenda, '2025-26-S1', { SCS1101: 74, SCS1102: 81, SCS1103: 63, SMA1101: 58, SMA1102: 66, SCM1101: 70 }],
      // Tatenda 1.2: one fail → PROCEED CARRYING SMA1201
      [tatenda, '2025-26-S2', { SCS1201: 68, SCS1202: 61, SCS1203: 55, SCS1204: 77, SCS1205: 64, SMA1201: 49 }],
      // Kudzai 1.1: three fails → REPEAT SCS1101, SCS1102, SMA1101
      [kudzai, '2025-26-S1', { SCS1101: 45, SCS1102: 38, SCS1103: 52, SMA1101: 41, SMA1102: 60, SCM1101: 55 }],
    ];
    for (const [studentId, semId, marks] of pastResults) {
      for (const [code, mark] of Object.entries(marks)) result.run(studentId, code, semId, mark);
    }

    // Tatenda: registered for six level 2.1 courses this semester (5 core + 1 elective).
    const reg = db.prepare('INSERT INTO registrations (student_id, course_code, semester_id) VALUES (?, ?, ?)');
    const tatendaCourses = ['SCS2104', 'SCS2108', 'SCS2110', 'SCS2111', 'SCS2114', 'SORS2110'];
    for (const code of tatendaCourses) reg.run(tatenda, code, CURRENT);

    // Continuous assessment so far
    const ca = db.prepare(`INSERT INTO assessments (student_id, course_code, semester_id, title, mark, max_mark)
                           VALUES (?, ?, ?, ?, ?, ?)`);
    const caMarks = [[72, 18], [85, 16], [64, 14], [58, 15], [90, 19], [61, 12]];
    tatendaCourses.forEach((code, i) => {
      ca.run(tatenda, code, CURRENT, 'Assignment 1', caMarks[i][0], 100);
      ca.run(tatenda, code, CURRENT, 'Test 1', caMarks[i][1], 20);
    });

    // Exam timetable (all level 1.1 and 2.1 courses this semester)
    const exam = db.prepare(`INSERT INTO exam_timetable (course_code, semester_id, exam_date, start_time, duration_hours, venue)
                             VALUES (?, ?, ?, ?, ?, ?)`);
    const venues = ['Main Hall', 'Lecture Theatre 1', 'Great Hall', 'Applied Sciences Block Room 12'];
    const examCourses = COURSES.filter((c) => c[3] === '2.1' || c[3] === '1.1');
    examCourses.forEach((c, i) => {
      const day = String(16 + i).padStart(2, '0');
      exam.run(c[0], CURRENT, `2026-11-${day}`, i % 2 ? '14:00' : '09:00', 3, venues[i % venues.length]);
    });

    // Fees for the current semester
    const fee = db.prepare('INSERT INTO fee_items (semester_id, description, amount_cents) VALUES (?, ?, ?)');
    [
      ['Tuition fees', 65000],
      ['Registration fee', 3000],
      ['Library fee', 2000],
      ['ICT levy', 2500],
      ['Sports and recreation', 1500],
      ['Student Representative Council', 1000],
    ].forEach(([d, a]) => fee.run(CURRENT, d, a));

    const pay = db.prepare(`INSERT INTO payments (student_id, semester_id, reference, method, amount_cents, status, paid_at)
                            VALUES (?, ?, ?, ?, ?, 'SUCCESS', ?)`);
    pay.run(tatenda, '2025-26-S2', 'ECO-3F9A21C07B', 'ECOCASH', 75000, '2026-01-22 10:14:00');
    pay.run(tatenda, CURRENT, 'FBC-81D4E6A2C9', 'FBC_ONLINE', 40000, '2026-08-11 09:30:00');

    const msg = db.prepare('INSERT INTO messages (student_id, subject, body, is_read, created_at) VALUES (?, ?, ?, ?, ?)');
    msg.run(tatenda, 'Welcome back', 'Welcome to the 2026/2027 academic year. Lectures start on 3 August 2026.', 1, '2026-08-01 08:00:00');
    msg.run(tatenda, 'Examination timetable published',
      'The provisional November 2026 examination timetable is now available under Exams Timetable.', 0, '2026-09-20 12:00:00');
    msg.run(rudo, 'Complete your registration',
      'Registration for 2026/2027 Semester 1 is open. Use New Registration to select your six courses.', 0, '2026-08-01 08:00:00');
    msg.run(kudzai, 'Academic standing: REPEAT',
      'Your 2025/2026 Semester 1 overall remark is REPEAT. Please see your Examinations Results and contact your faculty office.',
      0, '2026-01-10 09:00:00');
  })();
}

module.exports = { seed, DEMO_PASSWORD, STAFF_PASSWORD };

// `npm run seed` — reset the real database file.
if (require.main === module) {
  require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
  const { openDatabase } = require('./db');
  const db = openDatabase();
  seed(db);
  console.log('Database seeded.');
  console.log('  Students: N01234567A, N07654321B, N05555555C — password "Portal@2026"');
  console.log('  Staff:    S1001 admin, S2001/S2002 lecturers, S3001 bursary — password "Staff@2026"');
  db.close();
}
