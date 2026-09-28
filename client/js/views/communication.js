import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, mount, formatDate, alertBox } from '../util.js';

export async function messagesView(el, { ctx }) {
  const { messages, unread } = await api('/messages');
  ctx.setUnread(unread);
  let unreadCount = unread;

  mount(el, html`
    <h1 class="page-title">Messages</h1>
    <section class="panel">
      <h2 class="panel__head">${icon('mail')} Inbox</h2>
      <div class="panel__body">
        ${messages.length
          ? html`<ul class="inbox">${messages.map((m) => html`
              <li><details class="message ${m.isRead ? '' : 'message--unread'}" data-id="${m.id}">
                <summary><span class="message__subject">${m.subject}</span>
                  <span class="message__date">${formatDate(m.createdAt, { withTime: true })}</span></summary>
                <p class="message__body">${m.body}</p>
              </details></li>`)}</ul>`
          : html`<p class="empty">Your inbox is empty.</p>`}
      </div>
    </section>
  `);

  for (const details of el.querySelectorAll('details.message--unread')) {
    details.addEventListener('toggle', async () => {
      if (!details.open || !details.classList.contains('message--unread')) return;
      details.classList.remove('message--unread');
      try {
        await api(`/messages/${details.dataset.id}/read`, { method: 'PATCH' });
        ctx.setUnread(--unreadCount);
      } catch {
        details.classList.add('message--unread');
      }
    });
  }
}

const statusLabel = { OPEN: 'Open', IN_PROGRESS: 'In progress', CLOSED: 'Closed' };

export async function enquiriesView(el, { message } = {}) {
  const { categories, enquiries } = await api('/enquiries');

  mount(el, html`
    <h1 class="page-title">Enquiries</h1>
    ${message}
    <div class="grid-2">
      <form id="enquiry-form" class="panel" novalidate>
        <h2 class="panel__head">${icon('lifebuoy')} New enquiry</h2>
        <div class="panel__body form">
          <div id="enquiry-error"></div>
          <label for="category">Category</label>
          <select id="category" name="category" required>
            <option value="">Choose…</option>
            ${categories.map((c) => html`<option>${c}</option>`)}
          </select>
          <label for="subject">Subject</label>
          <input id="subject" name="subject" maxlength="120" required>
          <label for="body">Message</label>
          <textarea id="body" name="body" rows="6" minlength="10" maxlength="2000" required></textarea>
          <button class="btn btn--primary" type="submit">Submit enquiry</button>
        </div>
      </form>

      <section class="panel">
        <h2 class="panel__head">${icon('list')} My enquiries</h2>
        <div class="panel__body">
          ${enquiries.length
            ? html`<ul class="enquiries">${enquiries.map((q) => html`<li>
                <p><strong>${q.subject}</strong> <span class="badge badge--${q.status.toLowerCase()}">${statusLabel[q.status]}</span></p>
                <p class="muted small">${q.category} · ${formatDate(q.createdAt, { withTime: true })}</p>
                <p>${q.message}</p></li>`)}</ul>`
            : html`<p class="empty">You have not submitted any enquiries.</p>`}
        </div>
      </section>
    </div>
  `);

  const form = el.querySelector('#enquiry-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      await api('/enquiries', {
        method: 'POST',
        body: { category: form.category.value, subject: form.subject.value, message: form.body.value },
      });
      await enquiriesView(el, { message: alertBox('success', 'Thank you. Your enquiry has been submitted.') });
    } catch (err) {
      mount(el.querySelector('#enquiry-error'), alertBox('error', err.message));
      button.disabled = false;
    }
  });
}
