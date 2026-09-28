// Small helpers for building HTML safely.
//
// XSS protection (NFR5): the `html` tagged template escapes every interpolated value
// unless it is itself the result of `html`/`raw`. So `html`<p>${name}</p>`` is always safe.

class SafeHtml {
  constructor(value) { this.value = value; }
  toString() { return this.value; }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (v) => String(v).replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** Marks trusted markup (e.g. our own SVG icons) so it isn't escaped. Never pass user data. */
export const raw = (markup) => new SafeHtml(markup);

function renderValue(v) {
  if (v instanceof SafeHtml) return v.value;
  if (Array.isArray(v)) return v.map(renderValue).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapeHtml(v);
}

export function html(strings, ...values) {
  let out = strings[0];
  values.forEach((v, i) => { out += renderValue(v) + strings[i + 1]; });
  return new SafeHtml(out);
}

export function mount(el, content) {
  el.innerHTML = content.toString();
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export const money = (cents) => usd.format(cents / 100);

/** Formats 'YYYY-MM-DD' (a calendar date) or 'YYYY-MM-DD HH:MM:SS' (UTC timestamp from SQLite). */
export function formatDate(value, { withTime = false, weekday = false } = {}) {
  const dateOnly = value.length === 10;
  const date = new Date(dateOnly ? `${value}T00:00:00Z` : `${value.replace(' ', 'T')}Z`);
  return date.toLocaleString('en-GB', {
    ...(weekday && { weekday: 'short' }),
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime && { hour: '2-digit', minute: '2-digit' }),
    ...(dateOnly && { timeZone: 'UTC' }),
  });
}

export const alertBox = (type, message) =>
  html`<div class="alert alert--${type}" role="${type === 'error' ? 'alert' : 'status'}">${message}</div>`;
