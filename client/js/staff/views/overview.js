import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, mount, money } from '../../util.js';

export async function overviewView(el, { ctx }) {
  const { semester, stats } = await api('/staff/overview');
  const shortcut = (route, color, iconName, title, text) =>
    ctx.canUse(route) &&
    html`<a class="tile tile--${color}" href="#/${route}">
      ${icon(iconName, 'tile__icon')}<span class="tile__title">${title}</span><span class="tile__text">${text}</span></a>`;

  mount(el, html`
    <h1 class="page-title">Welcome, ${ctx.me.fullName} <small>${semester.label}</small></h1>

    <div class="summary">
      <div class="summary__item"><span>Students</span><strong>${stats.students}</strong></div>
      <div class="summary__item"><span>Draft results awaiting publication</span><strong>${stats.draftResults}</strong></div>
      <div class="summary__item"><span>Fees per student this semester</span><strong>${money(stats.feeTotalCents)}</strong></div>
      <div class="summary__item"><span>Collected this semester</span><strong>${money(stats.collectedCents)}</strong></div>
      <div class="summary__item"><span>Outstanding this semester</span><strong>${money(stats.outstandingCents)}</strong></div>
    </div>

    <section class="tiles tiles--staff" aria-label="Staff tasks">
      ${shortcut('results', 'teal', 'book', 'Capture Results', 'Enter and publish marks')}
      ${shortcut('fees', 'green', 'file', 'Fee Structure', 'Set fees per semester')}
      ${shortcut('accounts', 'orange', 'bank', 'Student Accounts', 'Balances and bank deposits')}
      ${shortcut('audit', 'red', 'history', 'Activity Log', 'Who changed what')}
    </section>
  `);
}
