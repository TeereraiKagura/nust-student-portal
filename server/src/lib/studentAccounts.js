// Student self-registration (FR25): what can be signed up for, and validation of the form.
const { COURSES_REQUIRED } = require('./registrationRules');
const { passwordPolicyError } = require('./passwords');
const {
  STUDENT_NUMBER, PERSON_NAME, NATIONAL_ID, EMAIL, ZIM_MOBILE, isIsoDate, ageInYears, text,
} = require('./validation');

/** Programmes and the levels that offer at least six courses (so registration is possible). */
function offeredProgrammes(db) {
  const rows = db
    .prepare(`SELECT p.code, p.name, p.faculty, c.level
              FROM programmes p JOIN courses c ON c.programme_code = p.code
              GROUP BY p.code, c.level
              HAVING COUNT(*) >= ?
              ORDER BY p.code, c.level`)
    .all(COURSES_REQUIRED);

  const programmes = [];
  for (const row of rows) {
    let p = programmes.find((x) => x.code === row.code);
    if (!p) {
      p = { code: row.code, name: row.name, faculty: row.faculty, levels: [] };
      programmes.push(p);
    }
    p.levels.push(row.level);
  }
  return programmes;
}

const fail = (error) => ({ error });

/** Returns { value } with cleaned-up fields, or { error } with a message for the student. */
function validateSignup(db, body = {}) {
  const v = {
    studentNumber: text(body.studentNumber).toUpperCase(),
    firstName: text(body.firstName),
    lastName: text(body.lastName),
    nationalId: text(body.nationalId).toUpperCase(),
    email: text(body.email).toLowerCase(),
    phone: text(body.phone).replace(/\s/g, ''),
    gender: text(body.gender),
    dateOfBirth: text(body.dateOfBirth),
    placeOfBirth: text(body.placeOfBirth) || null,
    addressLine1: text(body.addressLine1) || null,
    addressLine2: text(body.addressLine2) || null,
    programmeCode: text(body.programmeCode),
    level: text(body.level),
    password: typeof body.password === 'string' ? body.password : '',
  };

  if (!STUDENT_NUMBER.test(v.studentNumber)) return fail('Student number must look like N01234567A.');
  if (!PERSON_NAME.test(v.firstName) || !PERSON_NAME.test(v.lastName)) {
    return fail('Enter your first and last name (letters, spaces, hyphens and apostrophes only).');
  }
  if (!NATIONAL_ID.test(v.nationalId)) return fail('National ID must look like 63-123456A07.');
  if (v.email.length > 100 || !EMAIL.test(v.email)) return fail('Enter a valid email address.');
  if (!ZIM_MOBILE.test(v.phone)) return fail('Enter a valid Zimbabwean mobile number, e.g. 0771234567.');
  if (!['Male', 'Female'].includes(v.gender)) return fail('Choose your gender.');
  if (!isIsoDate(v.dateOfBirth)) return fail('Enter your date of birth.');
  const age = ageInYears(v.dateOfBirth);
  if (age < 15 || age > 80) return fail('Date of birth must give an age between 15 and 80.');
  for (const field of ['placeOfBirth', 'addressLine1', 'addressLine2']) {
    if (v[field] && v[field].length > 100) return fail('Address and place of birth must be at most 100 characters.');
  }

  const programme = offeredProgrammes(db).find((p) => p.code === v.programmeCode);
  if (!programme || !programme.levels.includes(v.level)) return fail('Choose your programme and level.');

  const passwordError = passwordPolicyError(v.password);
  if (passwordError) return fail(passwordError);

  return { value: v };
}

module.exports = { offeredProgrammes, validateSignup };
