const fs = require('node:fs');
const path = require('node:path');
require('../env');
const Database = require('better-sqlite3');

const dataDir = path.resolve(process.env.DATA_DIR || 'data');
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, 'phong-hop.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
const migrationVersion = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
if (migrationVersion < 2) {
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations/002_meetings_documents.sql'), 'utf8'));
}
const currentVersion = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
if (currentVersion < 3) {
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations/003_realtime.sql'), 'utf8'));
}
const latestVersion = db.prepare('SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations').get().version;
if (latestVersion < 4) {
  db.exec(fs.readFileSync(path.join(__dirname, 'migrations/004_voting_minutes.sql'), 'utf8'));
}
module.exports = db;
