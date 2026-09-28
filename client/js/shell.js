// Shared portal shell used by both the student and staff portals:
// sidebar navigation, menu toggle, logout, and a small hash router.
//
// Routes look like  #/name/param?key=value  and views are called as
//   view(containerElement, { param, query, ctx })
import { api } from './api.js';
import { icon } from './icons.js';
import { html, mount, alertBox } from './util.js';

export function parseHash() {
  const [path, queryString = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [name, param] = path.split('/').filter(Boolean);
  return { name, param, query: new URLSearchParams(queryString) };
}

/**
 * @param {object} options
 * @param {Array<{route?:string, href?:string, label:string, icon:string}>} options.nav
 * @param {Record<string, [Function, string]>} options.routes  name → [view, page title]
 * @param {object} options.ctx          shared state passed to every view
 * @param {string} options.appName      used in document.title
 * @param {string} options.logoutPath   API path for logout
 * @param {string} options.loginPage    where to go after logout (the portal chooser)
 */
export function startShell({ nav, routes, ctx, appName, logoutPath, loginPage, defaultRoute = 'dashboard' }) {
  const main = document.getElementById('main');
  const menuToggle = document.getElementById('menu-toggle');
  const backdrop = document.getElementById('backdrop');
  const mobile = window.matchMedia('(max-width: 900px)');

  mount(menuToggle, icon('menu'));
  mount(
    document.getElementById('nav'),
    html`${nav.map((item) =>
      item.href
        ? html`<li><a href="${item.href}" target="_blank" rel="noopener">${icon(item.icon)}<span>${item.label}</span></a></li>`
        : html`<li><a href="#/${item.route}" data-route="${item.route}">${icon(item.icon)}<span>${item.label}</span></a></li>`
    )}`
  );

  // ---- Sidebar: collapses on desktop, slides over the page on phones --------
  function setNavOpen(open) {
    if (mobile.matches) {
      document.body.classList.toggle('nav-open', open);
      backdrop.hidden = !open;
    } else {
      document.body.classList.toggle('nav-collapsed', !open);
    }
    menuToggle.setAttribute('aria-expanded', String(open));
  }
  const navIsOpen = () =>
    mobile.matches ? document.body.classList.contains('nav-open') : !document.body.classList.contains('nav-collapsed');

  menuToggle.addEventListener('click', () => setNavOpen(!navIsOpen()));
  backdrop.addEventListener('click', () => setNavOpen(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mobile.matches && navIsOpen()) setNavOpen(false);
  });
  mobile.addEventListener('change', () => {
    document.body.classList.remove('nav-open', 'nav-collapsed');
    backdrop.hidden = true;
    menuToggle.setAttribute('aria-expanded', String(!mobile.matches));
  });
  menuToggle.setAttribute('aria-expanded', String(!mobile.matches));

  document.getElementById('logout').addEventListener('click', async () => {
    await api(logoutPath, { method: 'POST' }).catch(() => {});
    window.location.href = loginPage;
  });

  // ---- Router ----------------------------------------------------------------
  async function render() {
    const { name = defaultRoute, param, query } = parseHash();
    const [view, title] = routes[name] ?? [notFound, 'Not found'];

    document.title = `${title} | ${appName}`;
    for (const link of document.querySelectorAll('#nav a[data-route]')) {
      if (link.dataset.route === name) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    if (mobile.matches) setNavOpen(false);

    // A fresh container per navigation: if the user clicks away before a slow request
    // finishes, the old view writes into a detached element and can't overwrite the new page.
    const container = document.createElement('div');
    container.className = 'view';
    main.replaceChildren(container);
    mount(container, html`<p class="loading">Loading…</p>`);
    window.scrollTo(0, 0);

    try {
      await view(container, { param, query, ctx });
    } catch (err) {
      if (err.status !== 401) mount(container, alertBox('error', err.message));
    }
    main.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', render);
  render();
}

async function notFound(el) {
  mount(el, html`
    <h1 class="page-title">Page not found</h1>
    <p>That page doesn't exist. <a href="#/">Go to your dashboard</a>.</p>
  `);
}
