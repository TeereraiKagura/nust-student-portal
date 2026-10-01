/**
 * Simple in-memory brute-force protection (NFR4): after `max` failed logins from one IP,
 * further attempts are refused until the window expires. Good enough for a single server;
 * a multi-server deployment would keep these counters in Redis or the database.
 */
function createLoginLimiter({ max = 5, windowMs = 15 * 60 * 1000 } = {}) {
  const failures = new Map(); // ip -> { count, firstAt }

  return function loginLimiter(req, res, next) {
    const key = req.ip;
    const now = Date.now();

    const entry = failures.get(key);
    if (entry && now - entry.firstAt > windowMs) failures.delete(key);

    const current = failures.get(key);
    if (current && current.count >= max) {
      const retryAfter = Math.ceil((current.firstAt + windowMs - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res
        .status(429)
        .json({ error: 'Too many failed attempts. Please wait a few minutes and try again.' });
    }

    req.recordLoginFailure = () => {
      const e = failures.get(key) ?? { count: 0, firstAt: now };
      e.count += 1;
      failures.set(key, e);
    };
    req.clearLoginFailures = () => failures.delete(key);
    next();
  };
}

/**
 * Counts every request (not just failures): after `max` requests from one IP within the
 * window, further requests are refused. Used for account creation to stop mass sign-ups.
 */
function createRequestLimiter({ max, windowMs, message }) {
  const hits = new Map(); // ip -> { count, firstAt }

  return function requestLimiter(req, res, next) {
    const now = Date.now();
    let entry = hits.get(req.ip);
    if (!entry || now - entry.firstAt > windowMs) {
      entry = { count: 0, firstAt: now };
      hits.set(req.ip, entry);
    }
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.firstAt + windowMs - now) / 1000)));
      return res.status(429).json({ error: message });
    }
    entry.count += 1;
    next();
  };
}

module.exports = { createLoginLimiter, createRequestLimiter };
