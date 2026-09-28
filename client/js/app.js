// Student portal entry point.
import { api } from './api.js';
import { icon } from './icons.js';
import { mount } from './util.js';
import { startShell } from './shell.js';
import { dashboardView } from './views/dashboard.js';
import { registrationView } from './views/registration.js';
import { feesView, payView, paymentsView } from './views/finance.js';
import { resultsView, assessmentsView, timetableView } from './views/academics.js';
import { messagesView, enquiriesView } from './views/communication.js';
import { passwordView, calendarView, externalView } from './views/misc.js';

const NAV = [
  { route: 'dashboard', label: 'My Portal Dashboard', icon: 'dashboard' },
  { route: 'registration', label: 'New Registration', icon: 'monitor' },
  { route: 'payments', label: 'Payments History', icon: 'history' },
  { route: 'results', label: 'Examinations Results', icon: 'book' },
  { route: 'assessments', label: 'Continuous Assessment', icon: 'list' },
  { route: 'timetable', label: 'Exams Timetable', icon: 'list' },
  { route: 'elearning', label: 'NUST E-Learning', icon: 'external' },
  { href: 'https://www.nust.ac.zw', label: 'Main Website', icon: 'grid' },
  { route: 'webmail', label: 'Students Webmail', icon: 'grid' },
  { route: 'password', label: 'Change Password', icon: 'key' },
];

const ROUTES = {
  dashboard: [dashboardView, 'Dashboard'],
  registration: [registrationView, 'New Registration'],
  fees: [feesView, 'Fees Quote'],
  pay: [payView, 'Pay Fees'],
  payments: [paymentsView, 'Payments History'],
  results: [resultsView, 'Examinations Results'],
  assessments: [assessmentsView, 'Continuous Assessment'],
  timetable: [timetableView, 'Exams Timetable'],
  messages: [messagesView, 'Messages'],
  enquiries: [enquiriesView, 'Enquiries'],
  password: [passwordView, 'Change Password'],
  calendar: [calendarView, 'Academic Calendar'],
  elearning: [(el) => externalView(el, 'NUST E-Learning'), 'NUST E-Learning'],
  webmail: [(el) => externalView(el, 'Students Webmail'), 'Students Webmail'],
};

const mailCount = document.getElementById('mail-count');

// Shared state views can update (e.g. the unread badge after reading a message).
const ctx = {
  setUnread(n) {
    mailCount.textContent = String(n);
    mailCount.classList.toggle('has-unread', n > 0);
  },
  async refreshUnread() {
    const me = await api('/auth/me');
    ctx.setUnread(me.unreadMessages);
  },
};

mount(document.getElementById('mail-icon'), icon('mail'));

const me = await api('/auth/me');
document.getElementById('sidebar-name').textContent = me.fullName;
ctx.setUnread(me.unreadMessages);

startShell({
  nav: NAV,
  routes: ROUTES,
  ctx,
  appName: 'NUST Student Portal',
  logoutPath: '/auth/logout',
  loginPage: '/',
});
