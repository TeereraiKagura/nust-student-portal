// Builds a student's results transcript: one entry per semester with the courses they
// registered for (or have results in), the published marks, grades, average and overall remark.
const { gradeFor, weightedAverage } = require('./grading');
const { overallRemark } = require('./remarks');

function studentResults(db, studentId) {
  const registered = db
    .prepare(`SELECT r.semester_id, sm.label, sm.starts_on, c.code, c.name, c.credits
              FROM registrations r
              JOIN courses c    ON c.code = r.course_code
              JOIN semesters sm ON sm.id = r.semester_id
              WHERE r.student_id = ?`)
    .all(studentId);
  const published = db
    .prepare(`SELECT r.semester_id, sm.label, sm.starts_on, c.code, c.name, c.credits, r.mark
              FROM results r
              JOIN courses c    ON c.code = r.course_code
              JOIN semesters sm ON sm.id = r.semester_id
              WHERE r.student_id = ? AND r.published = 1`)
    .all(studentId);

  // semester id → { id, label, startsOn, courses: Map(code → course) }
  const bySemester = new Map();
  const semesterFor = (row) => {
    if (!bySemester.has(row.semester_id)) {
      bySemester.set(row.semester_id, { id: row.semester_id, label: row.label, startsOn: row.starts_on, courses: new Map() });
    }
    return bySemester.get(row.semester_id);
  };
  for (const row of registered) {
    semesterFor(row).courses.set(row.code, { code: row.code, name: row.name, credits: row.credits, mark: null });
  }
  for (const row of published) {
    semesterFor(row).courses.set(row.code, { code: row.code, name: row.name, credits: row.credits, mark: row.mark });
  }

  const semesters = [...bySemester.values()]
    .sort((a, b) => a.startsOn.localeCompare(b.startsOn))
    .map((sem) => {
      const courses = [...sem.courses.values()]
        .sort((a, b) => a.code.localeCompare(b.code))
        .map((c) => {
          if (c.mark === null) return { ...c, grade: null, description: null, passed: null };
          const band = gradeFor(c.mark);
          return { ...c, grade: band.grade, description: band.description, passed: band.grade !== 'F' };
        });
      return {
        id: sem.id,
        label: sem.label,
        courses,
        average: weightedAverage(courses.filter((c) => c.mark !== null)),
        remark: overallRemark(courses),
      };
    });

  const overall = weightedAverage(published);
  return {
    semesters,
    overall: overall === null ? null : { average: overall, classification: gradeFor(overall).description },
  };
}

module.exports = { studentResults };
