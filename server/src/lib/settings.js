// System information edited by administrators (stored in the settings table).
const SETTINGS = {
  announcement: { key: 'announcement', maxLength: 500 },
  helpdeskContact: { key: 'helpdesk_contact', maxLength: 120 },
};

function getSettings(db) {
  const rows = new Map(db.prepare('SELECT key, value FROM settings').all().map((r) => [r.key, r.value]));
  return Object.fromEntries(Object.entries(SETTINGS).map(([name, s]) => [name, rows.get(s.key) ?? '']));
}

function saveSetting(db, name, value) {
  db.prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
              ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(SETTINGS[name].key, value);
}

module.exports = { SETTINGS, getSettings, saveSetting };
