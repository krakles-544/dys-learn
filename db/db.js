const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'dyslearn.sqlite');
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migrations: `CREATE TABLE IF NOT EXISTS` won't add new columns to a
// table that already exists on disk (e.g. an older prototype DB, or an ephemeral
// host that kept the file across a deploy). Add any missing columns by hand.
function ensureColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('students', 'teacher_id', 'INTEGER REFERENCES teachers(teacher_id)');
ensureColumn('students', 'attendance_days', 'INTEGER NOT NULL DEFAULT 0');

module.exports = db;
