const path = require('path');
const express = require('express');
const session = require('express-session');

require('./db/seed'); // idempotent — re-seeds subjects/content/demo accounts if the DB is fresh (e.g. ephemeral host storage reset on restart)

const authRoutes = require('./routes/auth');
const studentRoutes = require('./routes/student');
const exerciseRoutes = require('./routes/exercises');
const teacherRoutes = require('./routes/teacher');

const app = express();
const PORT = process.env.PORT || 3001;

app.set('trust proxy', 1); // hosting platforms (Render, Fly, etc.) sit behind a reverse proxy

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dyslearn-dev-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 }
  })
);

app.use('/api/auth', authRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/exercises', exerciseRoutes);
app.use('/api/teacher', teacherRoutes);

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`DysLearn running at http://localhost:${PORT}`);
});
