import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, mount, formatDate } from '../../util.js';

const ACTION_LABELS = {
  RESULTS_SAVED: 'Results saved',
  RESULTS_PUBLISHED: 'Results published',
  FEE_ADDED: 'Fee added',
  FEE_UPDATED: 'Fee updated',
  FEE_DELETED: 'Fee deleted',
  PAYMENT_RECORDED: 'Payment recorded',
  STAFF_CREATED: 'Staff member added',
  STAFF_UPDATED: 'Staff member updated',
  STUDENT_UPDATED: 'Student updated',
  PASSWORD_RESET: 'Password reset',
  COURSE_ADDED: 'Course added',
  COURSE_UPDATED: 'Course updated',
  COURSE_DELETED: 'Course deleted',
  SETTINGS_UPDATED: 'Settings updated',
  SEMESTER_ADDED: 'Semester added',
  SEMESTER_UPDATED: 'Semester updated',
};

export async function auditView(el) {
  const { entries } = await api('/staff/audit');

  mount(el, html`
    <h1 class="page-title">Activity Log</h1>
    <section class="panel">
      <h2 class="panel__head">${icon('history')} Latest 200 staff actions</h2>
      <div class="panel__body">
        ${entries.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">When</th><th scope="col">Staff</th><th scope="col">Action</th>
                <th scope="col">Details</th></tr></thead>
              <tbody>${entries.map((e) => html`<tr>
                <td>${formatDate(e.createdAt, { withTime: true })}</td>
                <td>${e.staffName} <span class="muted small">${e.staffNumber}</span></td>
                <td>${ACTION_LABELS[e.action] ?? e.action}</td>
                <td>${e.details}</td></tr>`)}</tbody>
            </table></div>`
          : html`<p class="empty">No staff activity yet.</p>`}
      </div>
    </section>
  `);
}
