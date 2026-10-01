import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, alertBox } from '../../util.js';

const STATUS = {
  NONE: html`<span class="badge badge--muted">No mark</span>`,
  DRAFT: html`<span class="badge badge--pending">Draft</span>`,
  PUBLISHED: html`<span class="badge badge--success">Published</span>`,
};

/**
 * Parses "studentNumber,mark" lines (a header row is allowed and skipped).
 * Returns { rows: [{ studentNumber, mark|null, line }], errors: [string] }.
 */
export function parseMarksCsv(textContent) {
  const rows = [];
  const errors = [];
  textContent.split(/\r?\n/).forEach((rawLine, index) => {
    const line = index + 1;
    if (!rawLine.trim()) return;
    const [numberCell = '', markCell = ''] = rawLine.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const studentNumber = numberCell.toUpperCase();
    if (index === 0 && !/^N\d{8}[A-Z]$/.test(studentNumber)) return; // header row
    if (!/^N\d{8}[A-Z]$/.test(studentNumber)) {
      errors.push(`Line ${line}: "${numberCell}" is not a student number.`);
      return;
    }
    if (markCell !== '' && (!/^\d{1,3}$/.test(markCell) || Number(markCell) > 100)) {
      errors.push(`Line ${line}: mark "${markCell}" for ${studentNumber} must be a whole number from 0 to 100.`);
      return;
    }
    rows.push({ studentNumber, mark: markCell === '' ? null : Number(markCell), line });
  });
  return { rows, errors };
}

function downloadCsv(filename, content) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function resultsCaptureView(el, { query, message }) {
  const { semesters, courses, onlyMine } = await api('/staff/results/options');
  const semesterId = query.get('semester') ?? semesters.find((s) => s.isCurrent)?.id ?? semesters[0]?.id;
  const courseCode = query.get('course') ?? '';

  if (courses.length === 0) {
    mount(el, html`
      <h1 class="page-title">Upload Marks</h1>
      ${alertBox('info', 'No courses are assigned to you yet. Ask an administrator to assign your courses under Manage Courses.')}`);
    return;
  }

  const data = courseCode
    ? await api(`/staff/results?semester=${encodeURIComponent(semesterId)}&course=${encodeURIComponent(courseCode)}`)
    : null;

  mount(el, html`
    <h1 class="page-title">Upload Marks</h1>
    ${message}
    ${onlyMine && html`<p class="muted">Showing the ${courses.length} course${courses.length === 1 ? '' : 's'} assigned to you.</p>`}

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
              ${c.code} — ${c.name} (Level ${c.level})${!onlyMine && c.lecturer ? ` · ${c.lecturer}` : ''}</option>`)}
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
              <div class="upload-bar">
                <button type="button" class="btn btn--light btn--small" id="template">${icon('download')} Download class list (CSV)</button>
                <label class="btn btn--light btn--small upload-label">${icon('upload')} Upload marks (CSV)
                  <input type="file" id="csv" accept=".csv,text/csv" class="sr-only"></label>
                <span class="muted small">Columns: student number, mark. Uploading fills the boxes below — review, then Save draft.</span>
              </div>
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
  const inputs = [...marksForm.querySelectorAll('.mark-input')];

  // ---- CSV: download the class list as a template, upload filled-in marks ----
  el.querySelector('#template').addEventListener('click', () => {
    const lines = ['student_number,mark,name', ...data.students.map((s) => `${s.studentNumber},${s.mark ?? ''},"${s.name}"`)];
    downloadCsv(`${data.course.code}-${data.semester.id}-marks.csv`, `${lines.join('\r\n')}\r\n`);
  });

  el.querySelector('#csv').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow choosing the same file again
    if (!file) return;
    if (file.size > 200_000) {
      mount(msg, alertBox('error', 'That file is too large for a class list.'));
      return;
    }
    const { rows, errors } = parseMarksCsv(await file.text());
    const byNumber = new Map(inputs.map((i) => [i.dataset.student, i]));
    const notInClass = [];
    let filled = 0;
    for (const input of inputs) input.classList.remove('mark-input--filled');
    for (const row of rows) {
      const input = byNumber.get(row.studentNumber);
      if (!input) { notInClass.push(row.studentNumber); continue; }
      input.value = row.mark ?? '';
      input.classList.add('mark-input--filled');
      filled++;
    }
    const problems = [...errors, ...(notInClass.length ? [`Not in this class: ${notInClass.join(', ')}`] : [])];
    mount(msg, html`
      ${alertBox(filled ? 'success' : 'error', `Filled ${filled} mark(s) from ${file.name}. Review the highlighted boxes, then click Save draft.`)}
      ${problems.length > 0 && html`<div class="alert alert--error" role="alert"><strong>Skipped:</strong>
        <ul class="tight">${problems.map((p) => html`<li>${p}</li>`)}</ul></div>`}`);
  });

  // ---- Save / publish -----------------------------------------------------
  marksForm.addEventListener('submit', async (e) => {
    e.preventDefault();
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
