# Phase 4 — Implementation

## 4.1 Build order (each step tested before the next)
1. **Database:** `schema.sql`, `db.js`, `seed.js` with fictional demo data.
2. **Auth:** login/logout/me, session cookie, rate limiter, `requireAuth` guard.
3. **Login page:** `index.html`, `login.css`, `login.js`.
4. **Portal shell:** `dashboard.html`, sidebar, top bar, hash router (`app.js`).
5. **Dashboard view:** tiles, banner, personal details, registered courses.
6. **Academics:** registration (with `registrationRules.js`), results (`grading.js`), CA, timetable.
7. **Finance:** fees quote, simulated payments, history.
8. **Communication:** messages + unread badge, enquiries, change password.
9. **Responsive + print CSS**, accessibility pass.

## 4.2 Coding standards
- **Backend:** CommonJS, one router per domain, no SQL string concatenation with user input,
  validation at the edge of every route, the password hash never serialised.
- **Frontend:** ES modules, one view module per area, every view is `async (el, {param, ctx})`.
  Views build markup only through the escaping `html` template, and attach event
  listeners after mounting.
- **CSS:** design tokens in `:root` (`base.css`), BEM-style class names (`panel__head`, `tile--green`),
  mobile rules at ≤ 900 px.
- **Money:** always integer cents on the server. Formatting happens only in the browser (`money()`).

## 4.3 Key techniques worth explaining in a viva
- **Tagged template for XSS safety** (`client/js/util.js`): `html` escapes every interpolated value
  unless it's already trusted markup, so forgetting to escape isn't possible.
- **Stale-render protection** (`client/js/app.js`): each navigation renders into a new container.
  A slow response for a page you've left writes into a detached element and can't
  overwrite the current page.
- **Transactions** (`routes/academics.js`, `routes/finance.js`): registration replaces all rows
  atomically, and a payment plus its receipt message are saved together or not at all.
- **Dependency injection** (`app.js`): `createApp({ db })` lets tests use `:memory:` databases.

## 4.4 Running
See the root `README.md`: `npm install`, `npm run seed`, `npm start`, then open http://localhost:3000.
