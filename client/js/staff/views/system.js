// Admin: system information — announcement, help desk contact, semesters, statistics.
import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, mount, alertBox, formatDate } from '../../util.js';

export async function systemView(el, { message }) {
  const { semesters, settings, stats, system } = await api('/staff/manage/system');

  mount(el, html`
    <h1 class="page-title">System Information</h1>
    ${message}

    <div class="summary">
      <div class="summary__item"><span>Students (active)</span><strong>${stats.students} (${stats.activeStudents})</strong></div>
      <div class="summary__item"><span>Active staff</span><strong>${stats.activeStaff}</strong></div>
      <div class="summary__item"><span>Courses (unassigned)</span><strong>${stats.courses} (${stats.unassignedCourses})</strong></div>
      <div class="summary__item"><span>Registrations this semester</span><strong>${stats.currentRegistrations}</strong></div>
      <div class="summary__item"><span>Results published / draft</span><strong>${stats.publishedResults} / ${stats.draftResults}</strong></div>
    </div>

    <div class="grid-2">
      <form id="settings" class="panel" novalidate>
        <h2 class="panel__head">${icon('settings')} Portal settings</h2>
        <div class="panel__body form">
          <div id="settings-msg"></div>
          <label for="announcement">Announcement on every student's dashboard</label>
          <textarea id="announcement" name="announcement" rows="4" maxlength="500"
                    placeholder="Leave empty for no announcement">${settings.announcement}</textarea>
          <label for="helpdesk">Help desk contact</label>
          <input id="helpdesk" name="helpdeskContact" maxlength="120" value="${settings.helpdeskContact}">
          <button class="btn btn--primary" type="submit">Save settings</button>
        </div>
      </form>

      <section class="panel">
        <h2 class="panel__head">${icon('monitor')} About this system</h2>
        <div class="panel__body">
          <dl class="details">
            <dt>Portal version</dt><dd>${system.version}</dd>
            <dt>Database schema version</dt><dd>${system.schemaVersion}</dd>
            <dt>Node.js</dt><dd>${system.node}</dd>
          </dl>
        </div>
      </section>
    </div>

    <section class="panel">
      <h2 class="panel__head">${icon('calendar')} Semesters</h2>
      <div class="panel__body">
        <div id="sem-msg"></div>
        <p class="muted">The current semester is the one students register for and see fees for. Opening registration lets
          students choose their six courses.</p>
        <div class="table-wrap"><table class="table" id="semesters">
          <thead><tr><th scope="col">Semester</th><th scope="col">Dates</th><th scope="col">Current</th>
            <th scope="col">Registration</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${semesters.map((s) => html`
            <tr data-id="${s.id}">
              <td><strong>${s.label}</strong> <span class="muted small">${s.id}</span></td>
              <td>${formatDate(s.startsOn)} – ${formatDate(s.endsOn)}</td>
              <td>${s.isCurrent ? html`<span class="badge badge--success">Current</span>` : '—'}</td>
              <td>${s.registrationOpen ? html`<span class="badge badge--pending">Open</span>` : html`<span class="badge badge--muted">Closed</span>`}</td>
              <td class="actions">
                ${!s.isCurrent && html`<button type="button" class="btn btn--light btn--small" data-action="current">Make current</button>`}
                <button type="button" class="btn btn--light btn--small" data-action="registration" data-open="${s.registrationOpen ? '1' : '0'}">
                  ${s.registrationOpen ? 'Close registration' : 'Open registration'}</button>
              </td>
            </tr>`)}</tbody>
          <tfoot><tr id="new-sem">
            <td><input class="input" name="label" aria-label="New semester label" placeholder="2026/2027 Semester 2">
              <input class="input input--short" name="id" aria-label="New semester ID" placeholder="2026-27-S2"></td>
            <td><input class="input" type="date" name="startsOn" aria-label="Start date">
              <input class="input" type="date" name="endsOn" aria-label="End date"></td>
            <td colspan="2"></td>
            <td class="actions"><button type="button" class="btn btn--primary btn--small" data-action="add">Add semester</button></td>
          </tr></tfoot>
        </table></div>
      </div>
    </section>
  `);

  const reload = (text) => systemView(el, { message: alertBox('success', text) });

  el.querySelector('#settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api('/staff/manage/settings', { method: 'PUT', body: Object.fromEntries(new FormData(e.currentTarget)) });
      await reload('Settings saved. Students see the announcement on their dashboard.');
    } catch (err) {
      mount(el.querySelector('#settings-msg'), alertBox('error', err.message));
    }
  });

  el.querySelector('#semesters').addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('tr');
    try {
      if (button.dataset.action === 'add') {
        const value = (name) => row.querySelector(`[name="${name}"]`).value;
        await api('/staff/manage/semesters', {
          method: 'POST',
          body: { id: value('id'), label: value('label'), startsOn: value('startsOn'), endsOn: value('endsOn') },
        });
        await reload(`Semester ${value('label')} added.`);
      } else if (button.dataset.action === 'current') {
        if (!window.confirm('Make this the current semester? Students will register and pay fees for it.')) return;
        await api(`/staff/manage/semesters/${encodeURIComponent(row.dataset.id)}`, { method: 'PATCH', body: { isCurrent: true } });
        await reload('Current semester changed.');
      } else if (button.dataset.action === 'registration') {
        const open = button.dataset.open !== '1';
        await api(`/staff/manage/semesters/${encodeURIComponent(row.dataset.id)}`, { method: 'PATCH', body: { registrationOpen: open } });
        await reload(`Registration ${open ? 'opened' : 'closed'}.`);
      }
    } catch (err) {
      mount(el.querySelector('#sem-msg'), alertBox('error', err.message));
    }
  });
}
