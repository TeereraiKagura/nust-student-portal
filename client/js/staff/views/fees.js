import { api } from '../../api.js';
import { icon } from '../../icons.js';
import { html, raw, mount, money, alertBox } from '../../util.js';

const dollars = (cents) => (cents / 100).toFixed(2);

export async function feeStructureView(el, { query, message }) {
  const semesterParam = query.get('semester');
  const data = await api(`/staff/fees${semesterParam ? `?semester=${encodeURIComponent(semesterParam)}` : ''}`);

  mount(el, html`
    <h1 class="page-title">Fee Structure</h1>
    ${message}

    <form id="pick" class="panel toolbar" novalidate>
      <div class="panel__body toolbar__body">
        <label>Semester
          <select name="semester">
            ${data.semesters.map((s) => html`<option value="${s.id}" ${s.id === data.semester.id ? raw('selected') : ''}>
              ${s.label}${s.isCurrent ? ' (current)' : ''}</option>`)}
          </select>
        </label>
      </div>
    </form>

    <section class="panel">
      <h2 class="panel__head">${icon('file')} Fees for ${data.semester.label}</h2>
      <div class="panel__body">
        <div id="fees-msg"></div>
        <p class="muted">Changes apply immediately to every student's fees quote and balance for this semester.</p>
        <div class="table-wrap"><table class="table" id="fees">
          <thead><tr><th scope="col">Description</th><th scope="col" class="num">Amount (USD)</th>
            <th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            ${data.items.map((i) => html`<tr data-id="${i.id}">
              <td><input class="input" name="description" aria-label="Description" maxlength="80" value="${i.description}"></td>
              <td class="num"><input class="input input--amount" name="amount" aria-label="Amount" type="number"
                   min="0" step="0.01" value="${dollars(i.amountCents)}"></td>
              <td class="actions"><button class="btn btn--light btn--small" data-action="save" type="button">Save</button>
                <button class="btn btn--danger btn--small" data-action="delete" type="button">Delete</button></td>
            </tr>`)}
            ${data.items.length === 0 && html`<tr><td colspan="3" class="empty">No fee items for this semester yet.</td></tr>`}
          </tbody>
          <tfoot>
            <tr class="total"><th scope="row">Total per student</th><td class="num">${money(data.totalCents)}</td><td></td></tr>
            <tr id="new-row">
              <td><input class="input" name="description" aria-label="New fee description" maxlength="80" placeholder="New fee item, e.g. Laboratory fee"></td>
              <td class="num"><input class="input input--amount" name="amount" aria-label="New fee amount" type="number" min="0" step="0.01" placeholder="0.00"></td>
              <td class="actions"><button class="btn btn--primary btn--small" data-action="add" type="button">Add</button></td>
            </tr>
          </tfoot>
        </table></div>
      </div>
    </section>
  `);

  el.querySelector('#pick select').addEventListener('change', (e) => {
    location.hash = `#/fees?semester=${encodeURIComponent(e.target.value)}`;
  });

  const msg = el.querySelector('#fees-msg');
  const reload = (text) =>
    feeStructureView(el, { query: new URLSearchParams({ semester: data.semester.id }), message: alertBox('success', text) });
  const readRow = (row) => ({
    description: row.querySelector('[name="description"]').value,
    amount: row.querySelector('[name="amount"]').value,
  });

  // One listener for every button in the table (event delegation).
  el.querySelector('#fees').addEventListener('click', async (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const row = button.closest('tr');
    button.disabled = true;
    try {
      if (button.dataset.action === 'add') {
        await api('/staff/fees', { method: 'POST', body: { semesterId: data.semester.id, ...readRow(row) } });
        await reload('Fee item added.');
      } else if (button.dataset.action === 'save') {
        await api(`/staff/fees/${row.dataset.id}`, { method: 'PUT', body: readRow(row) });
        await reload('Fee item updated.');
      } else if (button.dataset.action === 'delete') {
        const name = row.querySelector('[name="description"]').value;
        if (!window.confirm(`Delete "${name}" from ${data.semester.label}?`)) {
          button.disabled = false;
          return;
        }
        await api(`/staff/fees/${row.dataset.id}`, { method: 'DELETE' });
        await reload('Fee item deleted.');
      }
    } catch (err) {
      mount(msg, alertBox('error', err.message));
      button.disabled = false;
    }
  });
}
