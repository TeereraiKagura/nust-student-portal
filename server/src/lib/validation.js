// Input formats shared by several routes. Kept in one place so the rules are consistent.

const ZIM_MOBILE = /^(?:\+263|0)7[1378]\d{7}$/; // Econet, NetOne and Telecel prefixes
const STUDENT_NUMBER = /^N\d{8}[A-Z]$/; // e.g. N01234567A
const STAFF_NUMBER = /^S\d{4}$/; // e.g. S2001
const PERSON_NAME = /^[A-Za-z][A-Za-z' -]{0,49}$/;
const NATIONAL_ID = /^\d{2}-\d{6,7}[A-Z]\d{2}$/; // e.g. 63-123456A07
const EMAIL = /^[^\s@]{1,64}@[^\s@.]+(\.[^\s@.]+)+$/;
const COURSE_CODE = /^[A-Z]{2,5}\d{3,4}$/; // e.g. SCS2114, SORS2110
const LEVEL = /^[1-5]\.[12]$/; // e.g. 2.1
const SEMESTER_ID = /^\d{4}-\d{2}-S[12]$/; // e.g. 2026-27-S1

/** True for a real calendar date written as YYYY-MM-DD (rejects 2026-02-30). */
function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** Whole years between a YYYY-MM-DD date and now. */
function ageInYears(isoDate, now = new Date()) {
  const dob = new Date(`${isoDate}T00:00:00Z`);
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday = now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/** Trimmed string, or '' for anything that isn't a string. */
const text = (value) => (typeof value === 'string' ? value.trim() : '');

module.exports = {
  ZIM_MOBILE, STUDENT_NUMBER, STAFF_NUMBER, PERSON_NAME, NATIONAL_ID, EMAIL,
  COURSE_CODE, LEVEL, SEMESTER_ID, isIsoDate, ageInYears, text,
};
