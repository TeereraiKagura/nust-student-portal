import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, mount, alertBox, formatDate } from '../util.js';

export async function passwordView(el) {
  mount(el, html`
    <h1 class="page-title">Change Password</h1>
    <form id="pw-form" class="panel narrow" novalidate>
      <h2 class="panel__head">${icon('key')} Update your password</h2>
      <div class="panel__body form">
        <div id="pw-msg"></div>
        <label for="current">Current password</label>
        <input id="current" type="password" autocomplete="current-password" required>
        <label for="next">New password</label>
        <input id="next" type="password" autocomplete="new-password" minlength="8" required
               aria-describedby="pw-hint">
        <p id="pw-hint" class="hint">At least 8 characters, with letters and numbers.</p>
        <label for="confirm">Confirm new password</label>
        <input id="confirm" type="password" autocomplete="new-password" required>
        <button class="btn btn--primary" type="submit">Change password</button>
      </div>
    </form>
  `);

  const form = el.querySelector('#pw-form');
  const msg = el.querySelector('#pw-msg');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (form.next.value !== form.confirm.value) {
      mount(msg, alertBox('error', 'The new passwords do not match.'));
      return;
    }
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { currentPassword: form.current.value, newPassword: form.next.value },
      });
      form.reset();
      mount(msg, alertBox('success', 'Your password has been changed.'));
    } catch (err) {
      mount(msg, alertBox('error', err.message));
    }
  });
}

// Key dates are static in this prototype; a later iteration could load them from the API.
const KEY_DATES = [
  ['2026-08-03', 'Semester 1 lectures begin'],
  ['2026-08-28', 'Late registration closes'],
  ['2026-10-05', 'Mid-semester break (one week)'],
  ['2026-11-13', 'Lectures end'],
  ['2026-11-16', 'Semester 1 examinations begin'],
  ['2026-12-11', 'Semester 1 ends'],
  ['2027-01-18', 'Semester 2 lectures begin'],
];

export async function calendarView(el) {
  mount(el, html`
    <h1 class="page-title">Academic Calendar</h1>
    ${alertBox('info', 'The Android calendar app is outside the scope of this prototype. Key dates are listed below.')}
    <section class="panel narrow">
      <h2 class="panel__head">${icon('calendar')} 2026/2027 key dates</h2>
      <div class="panel__body">
        <table class="table">
          <tbody>${KEY_DATES.map(([d, what]) => html`<tr><td>${formatDate(d, { weekday: true })}</td><td>${what}</td></tr>`)}</tbody>
        </table>
      </div>
    </section>
  `);
}

export async function externalView(el, name) {
  mount(el, html`
    <h1 class="page-title">${name}</h1>
    ${alertBox('info', `${name} is a separate university system and is not part of this prototype.`)}
    <p><a href="#/dashboard">Back to dashboard</a></p>
  `);
}
