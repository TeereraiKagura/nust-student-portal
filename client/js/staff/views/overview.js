import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, mount, money } from '../../util.js';

export async function overviewView(el, { ctx }) {
  const { semester, stats, myCourses } = await api('/staff/overview');
  const shortcut = (route, color, iconName, title, text) =>
    ctx.canUse(route) &&
    html`<a class="tile tile--${color}" href="#/${route}">
      ${icon(iconName, 'tile__icon')}<span class="tile__title">${title}</span><span class="tile__text">${text}</span></a>`;
  const role = ctx.me.role;

  mount(el, html`
    <h1 class="page-title">Welcome, ${ctx.me.fullName} <small>${semester.label}</small></h1>

    <div class="summary">
      <div class="summary__item"><span>Students</span><strong>${stats.students}</strong></div>
      <div class="summary__item"><span>Draft results awaiting publication</span><strong>${stats.draftResults}</strong></div>
      ${role !== 'ACADEMIC' && html`
        <div class="summary__item"><span>Fees per student this semester</span><strong>${money(stats.feeTotalCents)}</strong></div>
        <div class="summary__item"><span>Collected this semester</span><strong>${money(stats.collectedCents)}</strong></div>
        <div class="summary__item"><span>Outstanding this semester</span><strong>${money(stats.outstandingCents)}</strong></div>`}
    </div>

    ${myCourses && html`
      <section class="panel">
        <h2 class="panel__head">${icon('book')} My courses — ${semester.label}</h2>
        <div class="panel__body">
          ${myCourses.length
            ? html`<div class="table-wrap"><table class="table">
                <thead><tr><th scope="col">Code</th><th scope="col">Course Name</th><th scope="col">Level</th>
                  <th scope="col" class="num">Students</th><th scope="col" class="num">Drafts</th>
                  <th scope="col"><span class="sr-only">Open</span></th></tr></thead>
                <tbody>${myCourses.map((c) => html`<tr>
                  <td>${c.code}</td><td>${c.name}</td><td>${c.level}</td>
                  <td class="num">${c.students}</td><td class="num">${c.drafts}</td>
                  <td><a href="#/results?${new URLSearchParams({ semester: semester.id, course: c.code })}">Upload marks</a></td>
                </tr>`)}</tbody>
              </table></div>`
            : html`<p class="empty">No courses are assigned to you yet. Ask an administrator.</p>`}
        </div>
      </section>`}

    <section class="tiles tiles--staff" aria-label="Staff tasks">
      ${shortcut('results', 'teal', 'book', 'Upload Marks', 'Enter, upload and publish marks')}
      ${shortcut('fees', 'green', 'file', 'Fee Structure', 'Set fees per semester')}
      ${shortcut('accounts', 'orange', 'bank', 'Student Accounts', 'Balances and bank deposits')}
      ${shortcut('users', 'cyan', 'users', 'Manage Users', 'Students and staff accounts')}
      ${shortcut('courses', 'teal', 'list', 'Manage Courses', 'Courses and lecturers')}
      ${shortcut('system', 'green', 'settings', 'System Information', 'Semesters and announcements')}
      ${shortcut('audit', 'red', 'history', 'Activity Log', 'Who changed what')}
    </section>
  `);
}
