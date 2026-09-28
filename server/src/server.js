require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });

const { openDatabase } = require('./db');
const { createApp } = require('./app');
const { seed } = require('./seed');

const isProduction = process.env.NODE_ENV === 'production';
const sessionSecret = process.env.SESSION_SECRET || (isProduction ? null : 'dev-only-secret');
if (!sessionSecret || (isProduction && sessionSecret === 'change-me')) {
  console.error('Set a strong SESSION_SECRET in server/.env before running in production.');
  process.exit(1);
}

const db = openDatabase();
const semesterCount = db.prepare('SELECT COUNT(*) AS n FROM semesters').get().n;
if (semesterCount === 0) {
  // AUTO_SEED=true is for demo hosting with no persistent disk (e.g. Render free plan):
  // every fresh start gets the demo data. It never touches a database that already has data.
  if (process.env.AUTO_SEED === 'true') {
    seed(db);
    console.log('Empty database: loaded demo data (AUTO_SEED=true).');
  } else {
    console.error('The database is empty. Run "npm run seed" first.');
    process.exit(1);
  }
}

const port = Number(process.env.PORT) || 3000;
createApp({ db, sessionSecret, isProduction }).listen(port, () => {
  console.log(`NUST Student Portal running at http://localhost:${port}`);
});
