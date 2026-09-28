import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, mount, money, formatDate, alertBox } from '../util.js';

const balanceLabel = (cents) => (cents >= 0 ? 'Balance due' : 'Credit balance');

// ---- Fees quote / invoice ----------------------------------------------------

export async function feesView(el) {
  const q = await api('/fees/quote');

  mount(el, html`
    <div class="page-actions no-print">
      <h1 class="page-title">Fees Quote</h1>
      <button type="button" class="btn btn--light" id="print">${icon('print')} Print</button>
    </div>

    <article class="panel invoice">
      <header class="invoice__head">
        <img src="img/crest.svg" alt="" class="invoice__crest">
        <div>
          <p class="invoice__org">National University of Science and Technology</p>
          <p class="invoice__doc">Fees Quotation — ${q.semester.label}</p>
        </div>
        <dl class="invoice__meta">
          <dt>Quote No.</dt><dd>${q.quoteNumber}</dd>
          <dt>Date</dt><dd>${formatDate(q.issuedOn)}</dd>
        </dl>
      </header>

      <dl class="details">
        <dt>Student</dt><dd>${q.student.fullName}</dd>
        <dt>Student Number</dt><dd>${q.student.studentNumber}</dd>
        <dt>Programme</dt><dd>${q.student.programme}</dd>
        <dt>Level</dt><dd>${q.student.level}</dd>
      </dl>

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th scope="col">Description</th><th scope="col" class="num">Amount (USD)</th></tr></thead>
          <tbody>${q.items.map((i) => html`<tr><td>${i.description}</td><td class="num">${money(i.amountCents)}</td></tr>`)}</tbody>
          <tfoot>
            <tr><th scope="row">Total fees</th><td class="num">${money(q.totalCents)}</td></tr>
            <tr><th scope="row">Less: payments received</th><td class="num">(${money(q.paidCents)})</td></tr>
            <tr class="total"><th scope="row">${balanceLabel(q.balanceCents)}</th><td class="num">${money(Math.abs(q.balanceCents))}</td></tr>
          </tfoot>
        </table>
      </div>
      <p class="muted small">This quotation is computer generated. Fees are subject to change.</p>
    </article>

    <div class="page-actions no-print">
      <a class="btn btn--primary" href="#/pay/ecocash">Pay with EcoCash</a>
      <a class="btn btn--red" href="#/pay/online">Pay Online (FBC)</a>
    </div>
  `);

  el.querySelector('#print').addEventListener('click', () => window.print());
}

// ---- Pay (simulated) ---------------------------------------------------------

export async function payView(el, { param, ctx }) {
  const isEcoCash = param !== 'online';
  const q = await api('/fees/quote');
  const suggested = Math.max(q.balanceCents, 0) / 100;

  mount(el, html`
    <h1 class="page-title">${isEcoCash ? 'Pay Tuition Fees — EcoCash' : 'Pay Online — FBC Secure Payments'}</h1>
    ${alertBox('info', 'Prototype: this payment is simulated. No money is moved and no card details are collected.')}

    <div class="grid-2">
      <form id="pay-form" class="panel" novalidate>
        <h2 class="panel__head">${icon(isEcoCash ? 'phone' : 'card')} Payment details</h2>
        <div class="panel__body form">
          <div id="pay-error"></div>
          <label for="amount">Amount (USD)</label>
          <input id="amount" name="amount" type="number" inputmode="decimal" min="1" max="10000" step="0.01"
                 value="${suggested ? suggested.toFixed(2) : ''}" required>
          ${isEcoCash && html`
            <label for="phone">EcoCash number</label>
            <input id="phone" name="phone" type="tel" inputmode="tel" placeholder="e.g. 0771234567"
                   autocomplete="tel" required>
            <p class="hint">You would normally receive a USSD prompt on this phone to enter your PIN.</p>`}
          ${!isEcoCash && html`
            <p class="hint">You would normally be redirected to the FBC payment gateway to enter card details there.</p>`}
          <button class="btn ${isEcoCash ? 'btn--primary' : 'btn--red'}" type="submit">
            ${isEcoCash ? 'Pay with EcoCash' : 'Continue to FBC'}</button>
        </div>
      </form>

      <section class="panel">
        <h2 class="panel__head">${icon('file')} Account summary</h2>
        <div class="panel__body">
          <dl class="details">
            <dt>Semester</dt><dd>${q.semester.label}</dd>
            <dt>Total fees</dt><dd>${money(q.totalCents)}</dd>
            <dt>Paid</dt><dd>${money(q.paidCents)}</dd>
            <dt>${balanceLabel(q.balanceCents)}</dt><dd><strong>${money(Math.abs(q.balanceCents))}</strong></dd>
          </dl>
        </div>
      </section>
    </div>
  `);

  const form = el.querySelector('#pay-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Processing…';
    try {
      const res = await api('/payments', {
        method: 'POST',
        body: {
          method: isEcoCash ? 'ECOCASH' : 'FBC_ONLINE',
          amount: Number(form.amount.value),
          ...(isEcoCash && { phone: form.phone.value.trim() }),
        },
      });
      ctx.refreshUnread();
      mount(el, html`
        <h1 class="page-title">Payment successful</h1>
        <section class="panel receipt">
          <div class="panel__body">
            ${alertBox('success', `Your payment of ${money(res.amountCents)} was received.`)}
            <dl class="details">
              <dt>Reference</dt><dd><strong>${res.reference}</strong></dd>
              <dt>Method</dt><dd>${isEcoCash ? 'EcoCash' : 'FBC Online'}</dd>
              <dt>${balanceLabel(res.balanceCents)}</dt><dd>${money(Math.abs(res.balanceCents))}</dd>
            </dl>
            <div class="page-actions">
              <a class="btn btn--primary" href="#/payments">View payments history</a>
              <a class="btn btn--light" href="#/fees">View fees quote</a>
            </div>
          </div>
        </section>
      `);
    } catch (err) {
      mount(el.querySelector('#pay-error'), alertBox('error', err.message));
      button.disabled = false;
      button.textContent = isEcoCash ? 'Pay with EcoCash' : 'Continue to FBC';
    }
  });
}

// ---- Payments history --------------------------------------------------------

export async function paymentsView(el) {
  const { payments } = await api('/payments');
  const total = payments.filter((p) => p.status === 'SUCCESS').reduce((s, p) => s + p.amountCents, 0);

  mount(el, html`
    <h1 class="page-title">Payments History</h1>
    <section class="panel">
      <h2 class="panel__head">${icon('history')} All payments</h2>
      <div class="panel__body">
        ${payments.length
          ? html`<div class="table-wrap"><table class="table">
              <thead><tr><th scope="col">Date</th><th scope="col">Reference</th><th scope="col">Semester</th>
                <th scope="col">Method</th><th scope="col">Status</th><th scope="col" class="num">Amount</th></tr></thead>
              <tbody>${payments.map((p) => html`<tr>
                <td>${formatDate(p.paidAt, { withTime: true })}</td><td>${p.reference}</td><td>${p.semester}</td>
                <td>${p.methodLabel}</td><td><span class="badge badge--${p.status.toLowerCase()}">${p.status}</span></td>
                <td class="num">${money(p.amountCents)}</td></tr>`)}
              </tbody>
              <tfoot><tr class="total"><th scope="row" colspan="5">Total paid</th><td class="num">${money(total)}</td></tr></tfoot>
            </table></div>`
          : html`<p class="empty">No payments yet. <a href="#/fees">Get a fees quote</a>.</p>`}
      </div>
    </section>
  `);
}
