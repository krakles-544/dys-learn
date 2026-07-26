const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/db');

const router = express.Router();

router.post('/register', (req, res) => {
  const { role } = req.body;

  if (role === 'student') {
    const { regno, firstname, middlename, lastname, grade, email, username, password, parent_mobile } = req.body;
    if (!regno || !firstname || !lastname || !grade || !username || !password) {
      return res.status(400).json({ error: 'Missing required student fields.' });
    }
    const existing = db.prepare('SELECT 1 FROM students WHERE username = ? OR regno = ?').get(username, regno);
    if (existing) return res.status(409).json({ error: 'Username or registration number already taken.' });

    const hash = bcrypt.hashSync(password, 10);
    const studentId = db
      .prepare(
        'INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(regno, firstname, middlename || null, lastname, grade, email || null, username, hash, parent_mobile || null).lastInsertRowid;

    for (const subject of db.prepare('SELECT subject_id FROM subjects').all()) {
      db.prepare('INSERT OR IGNORE INTO student_difficulty (student_id, subject_id, level) VALUES (?, ?, 1)').run(studentId, subject.subject_id);
    }

    req.session.user = { id: studentId, role: 'student', name: firstname };
    return res.json({ ok: true, role: 'student' });
  }

  if (role === 'teacher') {
    const { firstname, lastname, email, mobile, subject, password } = req.body;
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ error: 'Missing required teacher fields.' });
    }
    const existing = db.prepare('SELECT 1 FROM teachers WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const hash = bcrypt.hashSync(password, 10);
    const teacherId = db
      .prepare('INSERT INTO teachers (firstname, lastname, email, mobile, subject, userpassword) VALUES (?, ?, ?, ?, ?, ?)')
      .run(firstname, lastname, email, mobile || null, subject || null, hash).lastInsertRowid;

    req.session.user = { id: teacherId, role: 'teacher', name: firstname };
    return res.json({ ok: true, role: 'teacher' });
  }

  return res.status(400).json({ error: 'role must be "student" or "teacher".' });
});

router.post('/login', (req, res) => {
  const { role, identifier, password } = req.body;

  if (role === 'student') {
    const student = db.prepare('SELECT * FROM students WHERE username = ?').get(identifier);
    if (!student || !bcrypt.compareSync(password, student.userpassword)) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    req.session.user = { id: student.student_id, role: 'student', name: student.firstname };
    return res.json({ ok: true, role: 'student' });
  }

  if (role === 'teacher') {
    const teacher = db.prepare('SELECT * FROM teachers WHERE email = ?').get(identifier);
    if (!teacher || !bcrypt.compareSync(password, teacher.userpassword)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    req.session.user = { id: teacher.teacher_id, role: 'teacher', name: teacher.firstname };
    return res.json({ ok: true, role: 'teacher' });
  }

  return res.status(400).json({ error: 'role must be "student" or "teacher".' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  res.json(req.session.user);
});

function requireRole(role) {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    next();
  };
}

module.exports = router;
module.exports.requireRole = requireRole;
