// Staff portal entry point. The menu only shows what the signed-in role may use;
// the server enforces the same rules on every API call.
import { api } from '../api.js';
import { startShell } from '../shell.js';
import { overviewView } from './views/overview.js';
import { resultsCaptureView } from './views/results.js';
import { feeStructureView } from './views/fees.js';
import { accountsView } from './views/accounts.js';
import { auditView } from './views/audit.js';
import { usersView } from './views/users.js';
import { coursesView } from './views/courses.js';
import { systemView } from './views/system.js';

const NAV = [
  { route: 'dashboard', label: 'Staff Dashboard', icon: 'dashboard' },
  { route: 'results', label: 'Upload Marks', icon: 'book', roles: ['ACADEMIC'] },
  { route: 'fees', label: 'Fee Structure', icon: 'file', roles: ['BURSARY'] },
  { route: 'accounts', label: 'Student Accounts', icon: 'bank', roles: ['BURSARY'] },
  { route: 'users', label: 'Manage Users', icon: 'users', roles: ['ADMIN'] },
  { route: 'courses', label: 'Manage Courses', icon: 'list', roles: ['ADMIN'] },
  { route: 'system', label: 'System Information', icon: 'settings', roles: ['ADMIN'] },
  { route: 'audit', label: 'Activity Log', icon: 'history', roles: ['ADMIN'] },
];

const ROUTES = {
  dashboard: [overviewView, 'Staff Dashboard'],
  results: [resultsCaptureView, 'Upload Marks'],
  fees: [feeStructureView, 'Fee Structure'],
  accounts: [accountsView, 'Student Accounts'],
  users: [usersView, 'Manage Users'],
  courses: [coursesView, 'Manage Courses'],
  system: [systemView, 'System Information'],
  audit: [auditView, 'Activity Log'],
};

const me = await api('/staff/auth/me');
const canUse = (item) => !item.roles || me.role === 'ADMIN' || item.roles.includes(me.role);

document.getElementById('sidebar-name').textContent = me.fullName;
document.getElementById('sidebar-role').textContent = `${me.roleLabel} · ${me.staffNumber}`;
document.getElementById('role-pill').textContent = me.roleLabel;

const nav = NAV.filter(canUse);
const allowed = new Set(nav.map((n) => n.route));
const routes = Object.fromEntries(Object.entries(ROUTES).filter(([name]) => allowed.has(name)));

startShell({
  nav,
  routes,
  ctx: { me, canUse: (route) => allowed.has(route) },
  appName: 'NUST Staff Portal',
  logoutPath: '/staff/auth/logout',
  loginPage: '/',
});
