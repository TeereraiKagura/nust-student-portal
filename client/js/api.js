// Thin wrapper around fetch() for talking to the Express API.

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });

  const data = res.status === 204 ? null : await res.json().catch(() => null);

  // Session expired while using a portal: go back to that portal's login page
  // (set with <body data-login-page="…">; the portal chooser is the fallback).
  if (res.status === 401 && !path.endsWith('/auth/login')) {
    window.location.href = document.body.dataset.loginPage || '/';
  }
  if (!res.ok) {
    throw new ApiError(data?.error ?? `Request failed (${res.status})`, res.status);
  }
  return data;
}
