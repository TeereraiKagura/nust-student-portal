const express = require('express');
const { currentSemester } = require('../db');

const router = express.Router();

// Maps a database row to the shape the frontend uses. The password hash never leaves the server.
function toProfile(s) {
  return {
    studentNumber: s.student_number,
    firstName: s.first_name,
    lastName: s.last_name,
    nationalId: s.national_id,
    address: [s.address_line1, s.address_line2, s.country].filter(Boolean),
    phone: s.phone,
    email: s.email,
    gender: s.gender,
    dateOfBirth: s.date_of_birth,
    placeOfBirth: s.place_of_birth,
    programme: { code: s.programme_code, name: s.programme_name, faculty: s.faculty },
    level: s.level,
  };
}

function semesterDto(sem) {
  return { id: sem.id, label: sem.label, registrationOpen: sem.registration_open === 1 };
}

router.get('/dashboard', (req, res) => {
  const id = req.session.studentId;
  const student = req.db
    .prepare(`SELECT s.*, p.name AS programme_name, p.faculty
              FROM students s JOIN programmes p ON p.code = s.programme_code
              WHERE s.id = ?`)
    .get(id);
  const semester = currentSemester(req.db);

  const courses = req.db
    .prepare(`SELECT c.code, c.name, c.type, c.credits
              FROM registrations r JOIN courses c ON c.code = r.course_code
              WHERE r.student_id = ? AND r.semester_id = ?
              ORDER BY c.code`)
    .all(id, semester.id);

  res.json({ student: toProfile(student), semester: semesterDto(semester), courses });
});

module.exports = { studentRouter: router, semesterDto };
