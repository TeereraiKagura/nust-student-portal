// Shared by the student and staff login pages. The form's data attributes say where to post:
//   data-endpoint="/auth/login"  data-id-field="studentNumber"  data-redirect="/dashboard.html"
import { api } from './api.js';

const form = document.getElementById('login-form');
const errorBox = document.getElementById('login-error');
const submit = form.querySelector('button[type="submit"]');
const { endpoint, idField, redirect } = form.dataset;
const idInput = form.elements.namedItem(idField);

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorBox.hidden = true;

  const id = idInput.value.trim();
  const password = form.password.value;
  if (!id || !password) {
    showError('Enter your number and password.');
    (id ? form.password : idInput).focus();
    return;
  }

  submit.disabled = true;
  submit.textContent = 'Logging in…';
  try {
    await api(endpoint, { method: 'POST', body: { [idField]: id, password } });
    window.location.href = redirect;
  } catch (err) {
    showError(err.message);
    form.password.value = '';
    form.password.focus();
    submit.disabled = false;
    submit.textContent = 'Log In';
  }
});
