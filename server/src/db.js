const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const DEFAULT_DB_FILE = path.join(__dirname, '..', 'data', 'portal.db');
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Applies every migrations/NNN_name.sql newer than the database's PRAGMA user_version,
 * each in its own transaction. This upgrades an existing portal.db without losing data.
 */
function migrate(db) {
  const current = db.pragma('user_version', { simple: true });
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();

  for (const file of files) {
    const version = Number.parseInt(file, 10);
    if (version <= current) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.pragma(`user_version = ${version}`);
    })();
  }
}

/**
 * Opens (or creates) the SQLite database: baseline schema, then migrations.
 * Pass ':memory:' to get a throwaway database — the tests do this.
 */
function openDatabase(file = process.env.DB_FILE || DEFAULT_DB_FILE) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });

  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  migrate(db);
  return db;
}

function currentSemester(db) {
  return db.prepare('SELECT * FROM semesters WHERE is_current = 1').get();
}

module.exports = { openDatabase, migrate, currentSemester };
