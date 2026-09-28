import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, alertBox } from '../../util.js';

const STATUS = {
  NONE: html`<span class="badge badge--muted">No mark</span>`,
  DRAFT: html`<span class="badge badge--pending">Draft</span>`,
  PUBLISHED: html`<span class="badge badge--success">Published</span>`,
};

export async function resultsCaptureView(el, { query, message }) {
  const { semesters, courses } = await api('/staff/results/options');
  const semesterId = query.get('semester') ?? semesters.find((s) => s.isCurrent)?.id ?? semesters[0]?.id;
  const courseCode = query.get('course') ?? '';

  const data = courseCode
    ? await api(`/staff/results?semester=${encodeURIComponent(semesterId)}&course=${encodeURIComponent(courseCode)}`)
    : null;

  mount(el, html`
    <h1 class="page-title">Capture Results</h1>
    ${message}

    <form id="pick" class="panel toolbar" novalidate>
      <div class="panel__body toolbar__body">
        <label>Semester
          <select name="semester">
            ${semesters.map((s) => html`<option value="${s.id}" ${s.id === semesterId ? raw('selected') : ''}>${s.label}</option>`)}
          </select>
        </label>
        <label>Course
          <select name="course" required>
            <option value="">Choose a course…</option>
            ${courses.map((c) => html`<option value="${c.code}" ${c.code === courseCode ? raw('selected') : ''}>
              ${c.code} — ${c.name} (Level ${c.level})</option>`)}
          </select>
        </label>
        <button class="btn btn--primary" type="submit">Load class list</button>
      </div>
    </form>

    ${data && html`
      <form id="marks" class="panel" novalidate>
        <h2 class="panel__head">${icon('book')} ${data.course.code} — ${data.course.name} · ${data.semester.label}</h2>
        <div class="panel__body">
          <div id="marks-msg"></div>
          ${data.students.length
            ? html`
              <p class="muted">Enter whole-number marks out of 100. Leave blank for no mark.
                Saved marks stay as <strong>drafts</strong> until you publish them.</p>
              <div class="table-wrap"><table class="table">
                <thead><tr><th scope="col">Student Number</th><th scope="col">Name</th>
                  <th scope="col" class="num">Mark</th><th scope="col">Grade</th><th scope="col">Status</th></tr></thead>
                <tbody>${data.students.map((s) => html`<tr>
                  <td>${s.studentNumber}</td>
                  <td><label for="m-${s.studentNumber}">${s.name}</label></td>
                  <td class="num"><input class="mark-input" id="m-${s.studentNumber}" data-student="${s.studentNumber}"
                        type="number" inputmode="numeric" min="0" max="100" step="1" value="${s.mark ?? ''}"></td>
                  <td>${s.grade ?? '—'}</td>
                  <td>${STATUS[s.status]}</td></tr>`)}
                </tbody>
              </table></div>
              <div class="page-actions">
                <button class="btn btn--primary" type="submit">Save draft</button>
                <button class="btn btn--red" type="button" id="publish" ${data.drafts ? '' : raw('disabled')}>
                  Publish ${data.drafts} draft mark${data.drafts === 1 ? '' : 's'}</button>
              </div>`
            : html`<p class="empty">No students are registered for this course in ${data.semester.label}.</p>`}
        </div>
      </form>`}
  `);

  el.querySelector('#pick').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    if (!f.course.value) return f.course.focus();
    const params = new URLSearchParams({ semester: f.semester.value, course: f.course.value });
    location.hash = `#/results?${params}`;
  });

  const marksForm = el.querySelector('#marks');
  if (!marksForm || !data.students.length) return;
  const msg = el.querySelector('#marks-msg');
  const reload = (text) => resultsCaptureView(el, { query, message: alertBox('success', text) });

  marksForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const inputs = [...marksForm.querySelectorAll('.mark-input')];
    const invalid = inputs.find((i) => i.value !== '' && (!/^\d{1,3}$/.test(i.value) || Number(i.value) > 100));
    if (invalid) {
      mount(msg, alertBox('error', `Mark for ${invalid.dataset.student} must be a whole number from 0 to 100.`));
      invalid.focus();
      return;
    }
    const marks = inputs.map((i) => ({ studentNumber: i.dataset.student, mark: i.value === '' ? null : Number(i.value) }));
    try {
      const res = await api('/staff/results', {
        method: 'PUT',
        body: { semesterId: data.semester.id, courseCode: data.course.code, marks },
      });
      await reload(res.changed ? `${res.changed} mark(s) saved as draft.` : 'No changes to save.');
    } catch (err) {
      mount(msg, alertBox('error', err.message));
    }
  });

  el.querySelector('#publish')?.addEventListener('click', async () => {
    const ok = window.confirm(
      `Publish ${data.drafts} draft mark(s) for ${data.course.code}? Students will see them and be notified.`
    );
    if (!ok) return;
    try {
      const res = await api('/staff/results/publish', {
        method: 'POST',
        body: { semesterId: data.semester.id, courseCode: data.course.code },
      });
      await reload(`${res.published} result(s) published. Students have been notified.`);
    } catch (err) {
      mount(msg, alertBox('error', err.message));
    }
  });
}
