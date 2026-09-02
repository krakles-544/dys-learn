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

  if (role === 'parent') {
    const { firstname, lastname, email, mobile, password, child_regno } = req.body;
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ error: 'Missing required parent fields.' });
    }
    const existing = db.prepare('SELECT 1 FROM parents WHERE email = ?').get(email);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const hash = bcrypt.hashSync(password, 10);
    const parentId = db
      .prepare('INSERT INTO parents (firstname, lastname, email, mobile, userpassword) VALUES (?, ?, ?, ?, ?)')
      .run(firstname, lastname, email, mobile || null, hash).lastInsertRowid;

    // Optional: link a child straight away by registration number. A wrong or
    // missing number just leaves the account with no children linked yet — the
    // dashboard shows a "No Registered Children Linked" empty state.
    let linked = false;
    if (child_regno) {
      const child = db.prepare('SELECT student_id FROM students WHERE regno = ?').get(String(child_regno).trim());
      if (child) {
        db.prepare('INSERT OR IGNORE INTO parent_children (parent_id, student_id) VALUES (?, ?)').run(parentId, child.student_id);
        linked = true;
      }
    }

    req.session.user = { id: parentId, role: 'parent', name: firstname };
    return res.json({ ok: true, role: 'parent', linked });
  }

  return res.status(400).json({ error: 'role must be "student", "teacher" or "parent".' });
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

  if (role === 'parent') {
    const parent = db.prepare('SELECT * FROM parents WHERE email = ?').get(identifier);
    if (!parent || !bcrypt.compareSync(password, parent.userpassword)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    req.session.user = { id: parent.parent_id, role: 'parent', name: parent.firstname };
    return res.json({ ok: true, role: 'parent' });
  }

  return res.status(400).json({ error: 'role must be "student", "teacher" or "parent".' });
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
