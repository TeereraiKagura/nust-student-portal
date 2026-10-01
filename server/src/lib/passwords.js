const bcrypt = require('bcryptjs');

const COST = 10;

// Compared against when the account doesn't exist, so a wrong username takes as long
// as a wrong password and doesn't reveal which accounts exist.
const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', COST);

const hashPassword = (password) => bcrypt.hashSync(password, COST);

/** True only if `hash` exists and matches. Always does one bcrypt comparison. */
function verifyPassword(password, hash) {
  const matches = bcrypt.compareSync(password, hash ?? DUMMY_HASH);
  return Boolean(hash) && matches;
}

function passwordPolicyError(password) {
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return 'Password must be at least 8 characters and contain letters and numbers.';
  }
  return null;
}

module.exports = { hashPassword, verifyPassword, passwordPolicyError };
