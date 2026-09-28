import { api } from '../api.js';
import { html, raw, mount, alertBox } from '../util.js';

export async function registrationView(el, { message } = {}) {
  const data = await api('/registration');
  const open = data.semester.registrationOpen;

  mount(el, html`
    <h1 class="page-title">New Registration <small>${data.semester.label}</small></h1>
    ${message}
    ${!open && alertBox('info', `Registration for ${data.semester.label} is closed. Your registration is shown read-only.`)}
    ${open && !data.isRegistered && alertBox('info', 'Core courses are compulsory. Add electives if you wish, then click Register.')}

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
                const checked = core || c.registered;
                return html`<tr>
                  <td><input type="checkbox" id="c-${c.code}" value="${c.code}" data-credits="${c.credits}"
                       ${checked ? raw('checked') : ''} ${core || !open ? raw('disabled') : ''}></td>
                  <td><label for="c-${c.code}">${c.code}</label></td>
                  <td><label for="c-${c.code}">${c.name}</label></td>
                  <td>${core ? html`<span class="badge">Core</span>` : html`<span class="badge badge--muted">Elective</span>`}</td>
                  <td class="num">${c.credits}</td>
                </tr>`;
              })}
            </tbody>
          </table>
        </div>
        <p class="credits" aria-live="polite">Total credits: <strong id="credit-total">0</strong> / ${data.maxCredits}</p>
        ${open && html`<button type="submit" class="btn btn--primary">${data.isRegistered ? 'Update Registration' : 'Register'}</button>`}
      </div>
    </form>
  `);

  const form = el.querySelector('#reg-form');
  const boxes = [...form.querySelectorAll('input[type="checkbox"]')];
  const total = el.querySelector('#credit-total');
  const updateTotal = () => {
    const credits = boxes.filter((b) => b.checked).reduce((s, b) => s + Number(b.dataset.credits), 0);
    total.textContent = String(credits);
    total.classList.toggle('over', credits > data.maxCredits);
  };
  updateTotal();
  form.addEventListener('change', updateTotal);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const courseCodes = boxes.filter((b) => b.checked).map((b) => b.value);
      const res = await api('/registration', { method: 'POST', body: { courseCodes } });
      await registrationView(el, {
        message: alertBox('success', `Registration saved for ${res.semester} (${res.credits} credits).`),
      });
    } catch (err) {
      mount(el.querySelector('#reg-error'), alertBox('error', err.message));
      button.disabled = false;
    }
  });
}
