const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in (see README).');
}

const url = new URL(process.env.DATABASE_URL);
const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);

// Supabase requires TLS. Its certificates chain to Supabase's own CA rather than a
// public one, so either pin that CA (download it from Project Settings → Database
// and put the PEM in DATABASE_CA_CERT) or fall back to encrypted-but-unverified.
let ssl = false;
if (!isLocal) {
  ssl = process.env.DATABASE_CA_CERT ? { ca: process.env.DATABASE_CA_CERT } : { rejectUnauthorized: false };
}

// Small pool: on Vercel every function instance gets its own pool, and Supabase's
// transaction pooler (port 6543) multiplexes them onto real connections.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl,
  max: Number(process.env.DATABASE_POOL_MAX) || 3,
  idleTimeoutMillis: 10000
});

pool.on('error', (err) => console.error('Idle Postgres client error:', err));

async function query(sql, params) {
  return pool.query(sql, params);
}

// First row or undefined.
async function one(sql, params) {
  return (await pool.query(sql, params)).rows[0];
}

async function all(sql, params) {
  return (await pool.query(sql, params)).rows;
}

module.exports = { pool, query, one, all };
