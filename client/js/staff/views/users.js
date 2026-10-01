// Admin: manage student and staff accounts.
import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, alertBox, formatDate } from '../../util.js';

const activeBadge = (isActive) => (isActive
  ? html`<span class="badge badge--success">Active</span>`
  : html`<span class="badge badge--failed">Deactivated</span>`);

export async function usersView(el, { query, message }) {
  const tab = query.get('tab') === 'staff' ? 'staff' : 'students';
  const data = await api('/staff/manage/users');
  const levels = data.programmes.flatMap((p) => p.levels);

  mount(el, html`
    <h1 class="page-title">Manage Users</h1>
    ${message}
    <div id="users-msg"></div>

    <nav class="tabs" aria-label="User type">
      <a href="#/users?tab=students" ${tab === 'students' ? raw('aria-current="page"') : ''}>Students (${data.students.length})</a>
      <a href="#/users?tab=staff" ${tab === 'staff' ? raw('aria-current="page"') : ''}>Staff (${data.staff.length})</a>
    </nav>

    ${tab === 'students' ? html`
      <section class="panel">
        <h2 class="panel__head">${icon('users')} Students</h2>
        <div class="panel__body">
          <p class="muted">Students create their own accounts from the Student Portal. Here you can activate or
            deactivate accounts, change a student's level and reset passwords.</p>
          <label class="inline-label">Search <input id="filter" type="search" class="input" placeholder="Student number or name"></label>
          <div class="table-wrap"><table class="table" id="list">
            <thead><tr><th scope="col">Student Number</th><th scope="col">Name</th><th scope="col">Email</th>
              <th scope="col">Level</th><th scope="col">Joined</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>${data.students.map((s) => html`
              <tr data-number="${s.studentNumber}" data-search="${`${s.studentNumber} ${s.name}`.toLowerCase()}">
                <td>${s.studentNumber}</td><td>${s.name}</td><td>${s.email ?? '—'}</td>
                <td><select class="input input--short" data-action="level" aria-label="Level for ${s.name}">
                  ${levels.map((l) => html`<option ${l === s.level ? raw('selected') : ''}>${l}</option>`)}</select></td>
                <td>${formatDate(s.createdAt)}</td>
                <td>${activeBadge(s.isActive)}</td>
                <td class="actions">
                  <button type="button" class="btn btn--light btn--small" data-action="toggle">${s.isActive ? 'Deactivate' : 'Activate'}</button>
                  <button type="button" class="btn btn--light btn--small" data-action="password">Reset password</button>
                </td>
              </tr>`)}</tbody>
          </table></div>
        </div>
      </section>`
    : html`
      <section class="panel">
        <h2 class="panel__head">${icon('users')} Staff</h2>
        <div class="panel__body">
          <div class="table-wrap"><table class="table" id="list">
            <thead><tr><th scope="col">Staff Number</th><th scope="col">Name</th><th scope="col">Email</th>
              <th scope="col">Role</th><th scope="col" class="num">Courses</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
            <tbody>${data.staff.map((s) => html`
              <tr data-number="${s.staffNumber}">
                <td>${s.staffNumber}${s.isMe && html` <span class="badge">You</span>`}</td>
                <td>${s.name}</td><td>${s.email ?? '—'}</td>
                <td><select class="input input--short" data-action="role" aria-label="Role for ${s.name}" ${s.isMe ? raw('disabled') : ''}>
                  ${data.roles.map((r) => html`<option value="${r.value}" ${r.value === s.role ? raw('selected') : ''}>${r.label}</option>`)}</select></td>
                <td class="num">${s.courses}</td>
                <td>${activeBadge(s.isActive)}</td>
                <td class="actions">
                  ${!s.isMe && html`<button type="button" class="btn btn--light btn--small" data-action="toggle">${s.isActive ? 'Deactivate' : 'Activate'}</button>`}
                  <button type="button" class="btn btn--light btn--small" data-action="password">Reset password</button>
                </td>
              </tr>`)}</tbody>
          </table></div>
        </div>
      </section>

      <form id="new-staff" class="panel narrow" novalidate>
        <h2 class="panel__head">${icon('users')} Add staff member</h2>
        <div class="panel__body form">
          <div id="new-staff-msg"></div>
          <label for="ns-number">Staff number</label>
          <input id="ns-number" name="staffNumber" placeholder="S2003" required>
          <label for="ns-first">First name</label>
          <input id="ns-first" name="firstName" required>
          <label for="ns-last">Last name</label>
          <input id="ns-last" name="lastName" required>
          <label for="ns-email">Email</label>
          <input id="ns-email" name="email" type="email" required>
          <label for="ns-role">Role</label>
          <select id="ns-role" name="role">${data.roles.map((r) => html`<option value="${r.value}">${r.label}</option>`)}</select>
          <label for="ns-password">Temporary password</label>
          <input id="ns-password" name="password" type="text" autocomplete="off" required aria-describedby="ns-hint">
          <p id="ns-hint" class="hint">At least 8 characters with letters and numbers. Give it to the staff member securely.</p>
          <button class="btn btn--primary" type="submit">Add staff member</button>
        </div>
      </form>`}
  `);

  const msg = el.querySelector('#users-msg');
  const kind = tab === 'staff' ? 'staff' : 'students';
  const reload = (text) => usersView(el, { query, message: alertBox('success', text) });
  const fail = (err) => mount(msg, alertBox('error', err.message));

  el.querySelector('#filter')?.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    for (const row of el.querySelectorAll('#list tbody tr')) row.hidden = !row.dataset.search.includes(term);
  });

  const list = el.querySelector('#list');
  list.addEventListener('change', async (e) => {
    const select = e.target.closest('select[data-action]');
    if (!select) return;
    const number = select.closest('tr').dataset.number;
    const body = select.dataset.action === 'role' ? { role: select.value } : { level: select.value };
    try {
      const res = await api(`/staff/manage/${kind}/${encodeURIComponent(number)}`, { method: 'PATCH', body });
      const extra = res.unassignedCourses ? ` ${res.unassignedCourses} course(s) were unassigned and need a new lecturer.` : '';
      await reload(`${number} updated.${extra}`);
    } catch (err) { fail(err); }
  });

  list.addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('tr');
    const number = row.dataset.number;
    try {
      if (button.dataset.action === 'toggle') {
        const deactivate = button.textContent.trim() === 'Deactivate';
        if (deactivate && !window.confirm(`Deactivate ${number}? They will be logged out and unable to log in.`)) return;
        await api(`/staff/manage/${kind}/${encodeURIComponent(number)}`, { method: 'PATCH', body: { isActive: !deactivate } });
        await reload(`${number} ${deactivate ? 'deactivated' : 'activated'}.`);
      } else if (button.dataset.action === 'password') {
        const newPassword = window.prompt(`New temporary password for ${number} (at least 8 characters, letters and numbers):`);
        if (!newPassword) return;
        await api(`/staff/manage/${kind}/${encodeURIComponent(number)}/password`, { method: 'POST', body: { newPassword } });
        await reload(`Password reset for ${number}. Give them the new password securely.`);
      }
    } catch (err) { fail(err); }
  });

  el.querySelector('#new-staff')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api('/staff/manage/staff', { method: 'POST', body });
      await reload(`Staff member ${body.staffNumber.toUpperCase()} added.`);
    } catch (err) {
      mount(el.querySelector('#new-staff-msg'), alertBox('error', err.message));
    }
  });
}
