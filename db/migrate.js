// Applies db/schema.sql. Every statement is idempotent, so this is safe to re-run
// after pulling schema changes. Also creates the Supabase Storage bucket for book
// PDFs when Supabase credentials are configured.
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');
const storage = require('./storage');

async function migrate() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await pool.query(schema);
  console.log('Schema applied.');

  if (storage.configured) {
    await storage.ensureBucket();
    console.log('Storage bucket "books" ready.');
  } else {
    console.log('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipping storage bucket (PDF uploads disabled).');
  }
}

migrate()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
