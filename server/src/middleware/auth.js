/** Blocks API requests that don't come from a logged-in student. */
function requireAuth(req, res, next) {
  if (!req.session.studentId) {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
  next();
}

/**
 * Blocks requests that don't come from an active staff member with one of `roles`.
 * ADMIN may do everything. With no roles, any active staff member is allowed.
 * The role is re-read from the database on every request, so deactivating an account
 * or changing a role takes effect immediately.
 */
function requireStaff(...roles) {
  return (req, res, next) => {
    if (!req.session.staffId) {
      return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
    }
    const staff = req.db
      .prepare('SELECT id, staff_number, first_name, last_name, role, is_active FROM staff WHERE id = ?')
      .get(req.session.staffId);
    if (!staff || !staff.is_active) {
      return res.status(401).json({ error: 'Your account is not active.' });
    }
    if (roles.length && staff.role !== 'ADMIN' && !roles.includes(staff.role)) {
      return res.status(403).json({ error: 'You do not have permission to do that.' });
    }
    req.staff = staff;
    next();
  };
}

function destroySession(req, res, next) {
  req.session.destroy((err) => {
    if (err) return next(err);
    res.clearCookie('nust.sid');
    res.status(204).end();
  });
}

module.exports = { requireAuth, requireStaff, destroySession };
