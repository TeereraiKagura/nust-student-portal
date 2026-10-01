// Student self-registration page. The browser checks the obvious things for a quick
// response; the server re-checks everything, because client-side checks can be bypassed.
import { api } from './api.js';

const form = document.getElementById('signup-form');
const errorBox = document.getElementById('signup-error');
const submit = form.querySelector('button[type="submit"]');
const programmeSelect = form.elements.programmeCode;
const levelSelect = form.elements.level;

function showError(message, field) {
  errorBox.textContent = message;
  errorBox.hidden = false;
  errorBox.scrollIntoView({ block: 'center' });
  field?.focus({ preventScroll: true });
}

function option(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

// ---- Programmes and levels (only levels that offer six courses) ------------
let programmes = [];
try {
  ({ programmes } = await api('/public/programmes'));
  programmeSelect.replaceChildren(option('', 'Choose…'), ...programmes.map((p) => option(p.code, p.name)));
} catch {
  showError('Could not load programmes. Please refresh the page.');
}

programmeSelect.addEventListener('change', () => {
  const programme = programmes.find((p) => p.code === programmeSelect.value);
  levelSelect.replaceChildren(
    option('', programme ? 'Choose…' : 'Choose a programme first'),
    ...(programme?.levels ?? []).map((l) => option(l, `Level ${l}`))
  );
});

// ---- Submit -------------------------------------------------------------------
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const firstInvalid = [...form.elements].find((el) => el.willValidate && !el.checkValidity());
  if (firstInvalid) {
    const label = firstInvalid.closest('label')?.firstChild.textContent.replace('*', '').trim();
    return showError(`Please check "${label}".`, firstInvalid);
  }
  if (form.password.value !== form.confirm.value) {
    return showError('The passwords do not match.', form.confirm);
  }

  const body = Object.fromEntries(new FormData(form));
  delete body.confirm;

  submit.disabled = true;
  submit.textContent = 'Creating account…';
  try {
    await api('/auth/signup', { method: 'POST', body });
    window.location.href = '/dashboard.html#/registration';
  } catch (err) {
    showError(err.message);
    submit.disabled = false;
    submit.textContent = 'Create Account';
  }
});
