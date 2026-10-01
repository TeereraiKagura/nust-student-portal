import { api } from '../api.js';
import { icon } from '../icons.js';
import { html, mount, formatDate } from '../util.js';
import { remarkBox } from './academics.js';

const TILES = [
  { href: '#/fees', color: 'green', icon: 'file', title: 'Get Fees Quote', text: 'Get your fees invoice.' },
  { href: '#/pay/ecocash', color: 'cyan', icon: 'phone', title: 'Pay Tuition Fees', text: 'Pay instantly with Ecocash.' },
  { href: '#/pay/online', color: 'red', icon: 'card', title: 'Pay Online', text: 'Secure Payments With FBC' },
  { href: '#/enquiries', color: 'orange', icon: 'lifebuoy', title: 'Enquiries', text: 'We are here to serve you' },
  { href: '#/calendar', color: 'teal', icon: 'android', title: 'NUST Calendar App', text: 'Download Android APK' },
];

function registrationBanner(semester, isRegistered) {
  if (isRegistered) {
    return html`<a class="banner banner--ok" href="#/registration">
      You are registered for <strong>${semester.label}</strong>. Click here to view or change your registration.</a>`;
  }
  if (semester.registrationOpen) {
    return html`<a class="banner" href="#/registration">
      <strong>Are you a registered student?</strong> To start the registration process please click here.</a>`;
  }
  return html`<div class="banner banner--info">Registration for ${semester.label} is closed.</div>`;
}

export async function dashboardView(el) {
  const { student: s, semester, courses, announcement, latestRemark } = await api('/me/dashboard');

  mount(el, html`
    ${announcement && html`<div class="announcement" role="note"><strong>Announcement:</strong> ${announcement}</div>`}

    <section class="tiles" aria-label="Quick services">
      ${TILES.map((t) => html`
        <a class="tile tile--${t.color}" href="${t.href}">
          ${icon(t.icon, 'tile__icon')}
          <span class="tile__title">${t.title}</span>
          <span class="tile__text">${t.text}</span>
        </a>`)}
    </section>

    ${registrationBanner(semester, courses.length > 0)}

    ${latestRemark && html`<a class="remark-link" href="#/results">
      ${remarkBox(latestRemark, { heading: `Latest overall remark · ${latestRemark.semester}` })}</a>`}

    <div class="grid-2">
      <section class="panel">
        <h2 class="panel__head">${icon('user')} Personal Details</h2>
        <div class="panel__body profile">
          <img class="profile__crest" src="img/crest.svg" alt="">
          <div>
            <p class="profile__name">${s.firstName} ${s.lastName}</p>
            <p class="profile__id">ID Number: ${s.nationalId}</p>
            <p class="profile__lines">
              ${s.address.map((line) => html`${line}<br>`)}
              Phone Number: ${s.phone}<br>
              Gender: ${s.gender}<br>
              Date Of Birth: ${s.dateOfBirth ? formatDate(s.dateOfBirth) : '—'}<br>
              Place Of Birth: ${s.placeOfBirth ?? '—'}<br>
              Student Number: ${s.studentNumber}<br>
              Programme: ${s.programme.name} (Level ${s.level})
            </p>
          </div>
        </div>
      </section>

      <section class="panel">
        <h2 class="panel__head">${icon('bank')} Currently Registered Courses</h2>
        <div class="panel__body">
          ${courses.length
            ? html`
              <div class="table-wrap">
                <table class="table">
                  <caption class="sr-only">Courses registered for ${semester.label}</caption>
                  <thead><tr><th scope="col">Course Code</th><th scope="col">Course Name</th><th scope="col">Type</th></tr></thead>
                  <tbody>
                    ${courses.map((c) => html`<tr><td>${c.code}</td><td>${c.name}</td><td>${c.type}</td></tr>`)}
                  </tbody>
                </table>
              </div>`
            : html`<p class="empty">You have not registered any courses for ${semester.label}.</p>`}
        </div>
      </section>
    </div>
  `);
}
