// Admin: manage courses and assign lecturers.
import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, alertBox } from '../../util.js';

const TYPES = [['CORE', 'Core'], ['ELECTIVE', 'Elective']];

function courseFields(data, c = {}) {
  const sel = (a, b) => (a === b ? raw('selected') : '');
  return html`
    <td><input class="input" name="name" aria-label="Course name" maxlength="100" value="${c.name ?? ''}" placeholder="Course name"></td>
    <td><input class="input input--short" name="level" aria-label="Level" value="${c.level ?? ''}" placeholder="2.1"></td>
    <td><select class="input input--short" name="type" aria-label="Type">
      ${TYPES.map(([v, l]) => html`<option value="${v}" ${sel(v, c.type)}>${l}</option>`)}</select></td>
    <td><input class="input input--short" name="credits" aria-label="Credits" type="number" min="1" max="60" value="${c.credits ?? 12}"></td>
    <td><select class="input" name="lecturerNumber" aria-label="Lecturer">
      <option value="">— Unassigned —</option>
      ${data.lecturers.map((l) => html`<option value="${l.staffNumber}" ${sel(l.staffNumber, c.lecturerNumber)}>${l.name}</option>`)}
    </select></td>`;
}

export async function coursesView(el, { message }) {
  const data = await api('/staff/manage/courses');
  const programme = data.programmes[0];
  const levels = [...new Set(data.courses.map((c) => c.level))];

  mount(el, html`
    <h1 class="page-title">Manage Courses</h1>
    ${message}
    <div id="courses-msg"></div>
    <p class="muted">Each student registers for exactly six courses at their level; core courses are compulsory.
      A lecturer can only upload marks for the courses assigned to them here.</p>

    ${levels.map((level) => {
      const atLevel = data.courses.filter((c) => c.level === level);
      const cores = atLevel.filter((c) => c.type === 'CORE').length;
      const warn = atLevel.length < 6 ? 'fewer than six courses — students cannot register'
        : cores > 6 ? 'more than six core courses — registration is impossible' : null;
      return html`<p class="level-summary"><strong>Level ${level}:</strong> ${atLevel.length} courses (${cores} core)
        ${warn && html` <span class="badge badge--failed">${warn}</span>`}</p>`;
    })}

    <section class="panel">
      <h2 class="panel__head">${icon('list')} Courses — ${programme?.name ?? ''}</h2>
      <div class="panel__body">
        <div class="table-wrap"><table class="table" id="courses">
          <thead><tr><th scope="col">Code</th><th scope="col">Name</th><th scope="col">Level</th><th scope="col">Type</th>
            <th scope="col">Credits</th><th scope="col">Lecturer</th><th scope="col" class="num">Registrations</th>
            <th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>${data.courses.map((c) => html`
            <tr data-code="${c.code}">
              <td><strong>${c.code}</strong></td>
              ${courseFields(data, c)}
              <td class="num">${c.registrations}</td>
              <td class="actions">
                <button type="button" class="btn btn--light btn--small" data-action="save">Save</button>
                <button type="button" class="btn btn--danger btn--small" data-action="delete">Delete</button>
              </td>
            </tr>`)}</tbody>
          <tfoot><tr id="new-row">
            <td><input class="input input--short" name="code" aria-label="New course code" placeholder="SCS2120"></td>
            ${courseFields(data)}
            <td></td>
            <td class="actions"><button type="button" class="btn btn--primary btn--small" data-action="add">Add course</button></td>
          </tr></tfoot>
        </table></div>
      </div>
    </section>
  `);

  const msg = el.querySelector('#courses-msg');
  const reload = (text) => coursesView(el, { message: alertBox('success', text) });
  const readRow = (row) => {
    const value = (name) => row.querySelector(`[name="${name}"]`)?.value;
    return {
      code: value('code'),
      name: value('name'),
      level: value('level'),
      type: value('type'),
      credits: Number(value('credits')),
      lecturerNumber: value('lecturerNumber'),
      programmeCode: programme.code,
    };
  };

  el.querySelector('#courses').addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('tr');
    const code = row.dataset.code;
    button.disabled = true;
    try {
      if (button.dataset.action === 'add') {
        const body = readRow(row);
        await api('/staff/manage/courses', { method: 'POST', body });
        await reload(`Course ${body.code.toUpperCase()} added.`);
      } else if (button.dataset.action === 'save') {
        await api(`/staff/manage/courses/${encodeURIComponent(code)}`, { method: 'PUT', body: readRow(row) });
        await reload(`Course ${code} saved.`);
      } else if (button.dataset.action === 'delete') {
        if (!window.confirm(`Delete course ${code}? This cannot be undone.`)) { button.disabled = false; return; }
        await api(`/staff/manage/courses/${encodeURIComponent(code)}`, { method: 'DELETE' });
        await reload(`Course ${code} deleted.`);
      }
    } catch (err) {
      mount(msg, alertBox('error', err.message));
      msg.scrollIntoView({ block: 'center' });
      button.disabled = false;
    }
  });
}
