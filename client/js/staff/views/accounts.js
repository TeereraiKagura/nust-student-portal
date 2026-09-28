import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, money, formatDate, alertBox } from '../../util.js';

function balanceBadge(cents) {
  if (cents > 0) return html`<span class="badge badge--failed">Owing</span>`;
  if (cents < 0) return html`<span class="badge badge--success">Credit</span>`;
  return html`<span class="badge badge--success">Paid up</span>`;
}

const semesterOptions = (semesters, selectedId) =>
  semesters.map((s) => html`<option value="${s.id}" ${s.id === selectedId ? raw('selected') : ''}>
    ${s.label}${s.isCurrent ? ' (current)' : ''}</option>`);

export async function accountsView(el, { query, message }) {
  return query.get('student') ? accountDetail(el, query, message) : accountList(el, query);
}

// ---- All students with balances ----------------------------------------------

async function accountList(el, query) {
  const semesterParam = query.get('semester');
  const data = await api(`/staff/accounts${semesterParam ? `?semester=${encodeURIComponent(semesterParam)}` : ''}`);

  mount(el, html`
    <h1 class="page-title">Student Accounts</h1>
    <div class="panel toolbar">
      <div class="panel__body toolbar__body">
        <label>Semester <select id="semester">${semesterOptions(data.semesters, data.semester.id)}</select></label>
        <label>Search <input id="filter" type="search" placeholder="Student number or name"></label>
      </div>
    </div>

    <section class="panel">
      <h2 class="panel__head">${icon('bank')} Balances — ${data.semester.label} (fees ${money(data.totalCents)})</h2>
      <div class="panel__body">
        <div class="table-wrap"><table class="table" id="accounts">
          <thead><tr><th scope="col">Student Number</th><th scope="col">Name</th><th scope="col">Level</th>
            <th scope="col" class="num">Paid</th><th scope="col" class="num">Balance</th><th scope="col">Status</th>
            <th scope="col"><span class="sr-only">Open</span></th></tr></thead>
          <tbody>${data.students.map((s) => html`<tr data-search="${`${s.studentNumber} ${s.name}`.toLowerCase()}">
            <td>${s.studentNumber}</td><td>${s.name}</td><td>${s.level}</td>
            <td class="num">${money(s.paidCents)}</td><td class="num">${money(s.balanceCents)}</td>
            <td>${balanceBadge(s.balanceCents)}</td>
            <td><a href="#/accounts?${new URLSearchParams({ student: s.studentNumber, semester: data.semester.id })}">View account</a></td>
          </tr>`)}</tbody>
        </table></div>
        <p id="no-match" class="empty" hidden>No students match your search.</p>
      </div>
    </section>
  `);

  el.querySelector('#semester').addEventListener('change', (e) => {
    location.hash = `#/accounts?semester=${encodeURIComponent(e.target.value)}`;
  });
  el.querySelector('#filter').addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    let shown = 0;
    for (const row of el.querySelectorAll('#accounts tbody tr')) {
      row.hidden = !row.dataset.search.includes(term);
      if (!row.hidden) shown++;
    }
    el.querySelector('#no-match').hidden = shown > 0;
  });
}

// ---- One student's account + record a bank deposit ---------------------------

async function accountDetail(el, query, message) {
  const number = query.get('student');
  const semesterParam = query.get('semester');
  const data = await api(
    `/staff/accounts/${encodeURIComponent(number)}${semesterParam ? `?semester=${encodeURIComponent(semesterParam)}` : ''}`
  );
  const { student: s, summary } = data;
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in the user's time zone

  mount(el, html`
    <p class="no-print"><a href="#/accounts?semester=${data.semester.id}">← All student accounts</a></p>
    <h1 class="page-title">${s.name} <small>${s.studentNumber}</small></h1>
    ${message}

    <div class="grid-2">
      <section class="panel">
        <h2 class="panel__head">${icon('user')} Student</h2>
        <div class="panel__body">
          <dl class="details">
            <dt>Programme</dt><dd>${s.programme}</dd>
            <dt>Level</dt><dd>${s.level}</dd>
            <dt>Phone</dt><dd>${s.phone ?? '—'}</dd>
            <dt>Email</dt><dd>${s.email ?? '—'}</dd>
          </dl>
          <label class="inline-label">Semester
            <select id="semester">${semesterOptions(data.semesters, data.semester.id)}</select></label>
          <dl class="details">
            <dt>Fees</dt><dd>${money(summary.totalCents)}</dd>
            <dt>Paid</dt><dd>${money(summary.paidCents)}</dd>
            <dt>Balance</dt><dd><strong>${money(summary.balanceCents)}</strong> ${balanceBadge(summary.balanceCents)}</dd>
          </dl>
        </div>
      </section>

      <form id="deposit" class="panel" novalidate>
        <h2 class="panel__head">${icon('bank')} Record bank deposit</h2>
        <div class="panel__body form">
          <div id="deposit-msg"></div>
          <label for="d-semester">Semester</label>
          <select id="d-semester" name="semesterId">${semesterOptions(data.semesters, data.semester.id)}</select>
          <label for="d-amount">Amount (USD)</label>
          <input id="d-amount" name="amount" type="number" min="1" max="10000" step="0.01" required>
          <label for="d-ref">Bank reference</label>
          <input id="d-ref" name="reference" maxlength="30" placeholder="As shown on the bank statement" required>
          <label for="d-date">Deposit date</label>
          <input id="d-date" name="paidOn" type="date" max="${today}" value="${today}" required>
          <button class="btn btn--primary" type="submit">Record payment</button>
        </div>
      </form>
    </div>

    <section class="panel">
      <h2 class="panel__head">${icon('history')} Payment history (all semesters)</h2>
      <div class="panel__body">
        ${data.payments.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Semester</th>
                <th scope="col">Method</th><th scope="col">Recorded by</th><th scope="col" class="num">Amount</th></tr></thead>
              <tbody>${data.payments.map((p) => html`<tr>
                <td>${formatDate(p.paidAt)}</td><td>${p.reference}</td><td>${p.semester}</td>
                <td>${p.methodLabel}</td><td>${p.recordedBy ?? 'Online (student)'}</td>
                <td class="num">${money(p.amountCents)}</td></tr>`)}</tbody>
            </table></div>`
          : html`<p class="empty">No payments recorded.</p>`}
      </div>
    </section>
  `);

  el.querySelector('#semester').addEventListener('change', (e) => {
    location.hash = `#/accounts?${new URLSearchParams({ student: s.studentNumber, semester: e.target.value })}`;
  });

  const form = el.querySelector('#deposit');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const res = await api(`/staff/accounts/${encodeURIComponent(s.studentNumber)}/payments`, {
        method: 'POST',
        body: {
          semesterId: form.semesterId.value,
          amount: form.amount.value,
          reference: form.reference.value,
          paidOn: form.paidOn.value,
        },
      });
      await accountDetail(el, new URLSearchParams({ student: s.studentNumber, semester: form.semesterId.value }),
        alertBox('success', `Payment ${res.reference} recorded. The student has been notified.`));
    } catch (err) {
      mount(el.querySelector('#deposit-msg'), alertBox('error', err.message));
      button.disabled = false;
    }
  });
}
