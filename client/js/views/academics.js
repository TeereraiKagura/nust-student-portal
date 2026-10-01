import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, mount, formatDate } from '../util.js';

const gradeClass = (grade) => (grade === 'F' ? 'grade grade--fail' : 'grade');

const REMARK_CLASS = {
  PASS: 'remark--pass',
  PROCEED_CARRYING: 'remark--proceed',
  REPEAT: 'remark--repeat',
  PENDING: 'remark--pending',
};

/** The coloured "Overall remark" box shown under each semester (and on the dashboard). */
export function remarkBox(remark, { heading = 'Overall remark' } = {}) {
  return html`
    <div class="remark ${REMARK_CLASS[remark.code]}" role="status">
      <span class="remark__label">${heading}</span>
      <strong class="remark__text">${remark.text}</strong>
      ${remark.failed.length > 0 && html`
        <span class="remark__failed">${remark.code === 'PENDING' ? 'Failed so far' : 'Failed courses'}:
          ${remark.failed.join(', ')}</span>`}
    </div>`;
}

function courseStatus(c) {
  if (c.mark === null) return html`<span class="badge badge--muted">Awaiting result</span>`;
  return c.passed
    ? html`<span class="badge badge--success">Passed</span>`
    : html`<span class="badge badge--failed">Failed</span>`;
}

export async function resultsView(el) {
  const { semesters, overall } = await api('/results');

  if (!semesters.length) {
    mount(el, html`<h1 class="page-title">Examinations Results</h1>
      <p class="empty panel panel__body">You have no registered courses or results yet.
        <a href="#/registration">Register for your six courses</a>.</p>`);
    return;
  }

  const final = semesters.filter((s) => s.remark.code !== 'PENDING');
  const latest = final.at(-1);

  mount(el, html`
    <h1 class="page-title">Examinations Results</h1>
    <div class="summary">
      <div class="summary__item"><span>Latest overall remark</span>
        <strong>${latest ? latest.remark.text : '—'}</strong>
        ${latest && html`<span>${latest.label}</span>`}</div>
      <div class="summary__item"><span>Overall average</span><strong>${overall ? `${overall.average}%` : '—'}</strong></div>
      <div class="summary__item"><span>Current classification</span><strong>${overall?.classification ?? '—'}</strong></div>
    </div>

    ${[...semesters].reverse().map((sem) => html`
      <section class="panel">
        <h2 class="panel__head">${icon('book')} ${sem.label}</h2>
        <div class="panel__body">
          ${remarkBox(sem.remark)}
          <div class="table-wrap"><table class="table">
            <thead><tr><th scope="col">Code</th><th scope="col">Course Name</th><th scope="col" class="num">Credits</th>
              <th scope="col" class="num">Mark</th><th scope="col">Grade</th><th scope="col">Status</th></tr></thead>
            <tbody>${sem.courses.map((c) => html`<tr class="${c.passed === false ? 'row--failed' : ''}">
              <td>${c.code}</td><td>${c.name}</td><td class="num">${c.credits}</td>
              <td class="num">${c.mark ?? '—'}</td>
              <td>${c.grade ? html`<span class="${gradeClass(c.grade)}" title="${c.description}">${c.grade}</span>` : '—'}</td>
              <td>${courseStatus(c)}</td></tr>`)}
            </tbody>
            <tfoot><tr class="total"><th scope="row" colspan="3">Semester average (credit-weighted)</th>
              <td class="num">${sem.average === null ? '—' : `${sem.average}%`}</td><td colspan="2"></td></tr></tfoot>
          </table></div>
        </div>
      </section>`)}

    <div class="panel panel__body small">
      <p class="muted"><strong>Grading:</strong> 1 (75–100), 2.1 (65–74), 2.2 (60–64), P (50–59), F (0–49). A course is failed below 50.</p>
      <p class="muted"><strong>Overall remark</strong> (based on the six courses of a semester):
        <strong>PASS</strong> — all six passed ·
        <strong>PROCEED CARRYING</strong> — one or two failed, which you carry forward ·
        <strong>REPEAT</strong> — three or more failed.
        The remark is <strong>PENDING</strong> until all six results are published.</p>
    </div>
  `);
}

export async function assessmentsView(el) {
  const { semester, courses } = await api('/assessments');

  mount(el, html`
    <h1 class="page-title">Continuous Assessment <small>${semester.label}</small></h1>
    ${courses.length
      ? html`<div class="grid-2">${courses.map((c) => html`
          <section class="panel">
            <h2 class="panel__head">${c.code} — ${c.name}</h2>
            <div class="panel__body">
              <table class="table">
                <thead><tr><th scope="col">Assessment</th><th scope="col" class="num">Mark</th><th scope="col" class="num">%</th></tr></thead>
                <tbody>${c.items.map((i) => html`<tr><td>${i.title}</td><td class="num">${i.mark} / ${i.maxMark}</td>
                  <td class="num">${i.percent}</td></tr>`)}</tbody>
                <tfoot><tr class="total"><th scope="row" colspan="2">Coursework to date</th><td class="num">${c.percent}%</td></tr></tfoot>
              </table>
            </div>
          </section>`)}</div>`
      : html`<p class="empty panel panel__body">No continuous assessment marks have been captured yet.</p>`}
  `);
}

export async function timetableView(el) {
  const { semester, exams } = await api('/timetable');

  mount(el, html`
    <div class="page-actions no-print">
      <h1 class="page-title">Exams Timetable <small>${semester.label}</small></h1>
      ${exams.length > 0 && html`<button type="button" class="btn btn--light" id="print">${icon('print')} Print</button>`}
    </div>
    <section class="panel">
      <h2 class="panel__head">${icon('calendar')} Your examinations</h2>
      <div class="panel__body">
        ${exams.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">Date</th><th scope="col">Time</th><th scope="col">Duration</th>
                <th scope="col">Code</th><th scope="col">Course Name</th><th scope="col">Venue</th></tr></thead>
              <tbody>${exams.map((x) => html`<tr>
                <td>${formatDate(x.date, { weekday: true })}</td><td>${x.startTime}</td><td>${x.durationHours} hrs</td>
                <td>${x.code}</td><td>${x.name}</td><td>${x.venue}</td></tr>`)}
              </tbody></table></div>
            <p class="muted small">Provisional. Arrive 30 minutes early with your student ID card.</p>`
          : html`<p class="empty">No exams found. <a href="#/registration">Register for courses</a> to see your timetable.</p>`}
      </div>
    </section>
  `);

  el.querySelector('#print')?.addEventListener('click', () => window.print());
}
