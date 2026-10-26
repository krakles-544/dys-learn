const path = require('path');
const express = require('express');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const { pool } = require('./db/db');

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const exerciseRoutes = require('./routes/exercises');
const teacherRoutes = require('./routes/teacher');
const parentRoutes = require('./routes/parent');
const bookRoutes = require('./routes/books');

if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // hosting platforms (Vercel, Render, etc.) sit behind a reverse proxy

app.use(express.json());
app.use(
  session({
    // Login sessions live in Postgres so they survive restarts and are shared
    // across Vercel's function instances.
    store: new PgSession({ pool, tableName: 'user_sessions' }),
    secret: process.env.SESSION_SECRET || 'dyslearn-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8, sameSite: 'lax', secure: 'auto' }
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/parent', parentRoutes);
app.use('/api/books', bookRoutes);

// Locally Express serves the pages; on Vercel, public/ is served from the CDN instead.
app.use(express.static(path.join(__dirname, 'public')));

// Express 5 forwards rejected promises from async handlers here.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`DysLearn running at http://localhost:${PORT}`);
  });
}

module.exports = app;
