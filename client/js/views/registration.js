import { api } from '../api.js';
import { html, raw, mount, alertBox } from '../util.js';

export async function registrationView(el, { message } = {}) {
  const data = await api('/registration');
  const required = data.required;
  const editable = data.semester.registrationOpen && !data.locked;
  const cores = data.courses.filter((c) => c.type === 'CORE').length;

  let notice = null;
  if (!data.semester.registrationOpen) {
    notice = alertBox('info', `Registration for ${data.semester.label} is closed. Your registration is shown read-only.`);
  } else if (data.locked) {
    notice = alertBox('info', 'Marks have been entered for your courses, so your registration can no longer be changed.');
  } else if (!data.isRegistered) {
    notice = alertBox('info', `Select exactly ${required} courses. The ${cores} core courses are compulsory, so choose ` +
      `${required - cores} elective${required - cores === 1 ? '' : 's'} to make ${required}.`);
  }

  mount(el, html`
    <h1 class="page-title">New Registration <small>${data.semester.label}</small></h1>
    ${message}
    ${notice}
    ${data.courses.length < required &&
      alertBox('error', `Only ${data.courses.length} courses are offered at your level. Please contact the faculty office.`)}

    <form id="reg-form" class="panel" novalidate>
      <h2 class="panel__head">Courses offered at your level</h2>
      <div class="panel__body">
        <div id="reg-error"></div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th scope="col"><span class="sr-only">Select</span></th><th scope="col">Code</th>
                  <th scope="col">Course Name</th><th scope="col">Type</th><th scope="col" class="num">Credits</th></tr>
            </thead>
            <tbody>
              ${data.courses.map((c) => {
                const core = c.type === 'CORE';
                const checked = data.isRegistered ? c.registered : core;
                return html`<tr>
                  <td><input type="checkbox" id="c-${c.code}" value="${c.code}" data-credits="${c.credits}"
                       ${checked ? raw('checked') : ''} ${core || !editable ? raw('disabled') : ''}></td>
                  <td><label for="c-${c.code}">${c.code}</label></td>
                  <td><label for="c-${c.code}">${c.name}</label></td>
                  <td>${core ? html`<span class="badge">Core</span>` : html`<span class="badge badge--muted">Elective</span>`}</td>
                  <td class="num">${c.credits}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <p class="credits" aria-live="polite">
          Selected: <strong id="count">0</strong> of ${required} courses · <span id="credit-total">0</span> credits
        </p>
        ${editable && html`<button type="submit" class="btn btn--primary">${data.isRegistered ? 'Update Registration' : 'Register'}</button>`}
      </div>
    </form>
  `);

  const form = el.querySelector('#reg-form');
  const boxes = [...form.querySelectorAll('input[type="checkbox"]')];
  const count = el.querySelector('#count');
  const credits = el.querySelector('#credit-total');
  const update = () => {
    const ticked = boxes.filter((b) => b.checked);
    count.textContent = String(ticked.length);
    count.classList.toggle('over', ticked.length !== required);
    credits.textContent = String(ticked.reduce((s, b) => s + Number(b.dataset.credits), 0));
  };
  update();
  form.addEventListener('change', update);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const courseCodes = boxes.filter((b) => b.checked).map((b) => b.value);
    const errorBox = el.querySelector('#reg-error');
    if (courseCodes.length !== required) {
      mount(errorBox, alertBox('error', `Select exactly ${required} courses (you selected ${courseCodes.length}).`));
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const res = await api('/registration', { method: 'POST', body: { courseCodes } });
      await registrationView(el, {
        message: alertBox('success', `You are registered for ${required} courses in ${res.semester} (${res.credits} credits).`),
      });
    } catch (err) {
      mount(errorBox, alertBox('error', err.message));
      button.disabled = false;
    }
  });
}
