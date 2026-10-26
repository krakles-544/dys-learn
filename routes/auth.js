const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/db');

const router = express.Router();

// Postgres unique_violation: two sign-ups racing for the same username/email both
// pass the "already taken?" check, and the constraint rejects the second.
function isUniqueViolation(err) {
  return err && err.code === '23505';
}

// Shared by self-registration and the teacher's "Register Student" form.
async function createStudent({ regno, firstname, middlename, lastname, grade, email, username, password, parent_mobile }, teacherId) {
  const hash = await bcrypt.hash(password, 10);
  const { student_id: studentId } = await db.one(
    `INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile, teacher_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING student_id`,
    [regno, firstname, middlename || null, lastname, Number(grade), email || null, username, hash, parent_mobile || null, teacherId || null]
  );
  await db.query(
    'INSERT INTO student_difficulty (student_id, subject_id, level) SELECT $1, subject_id, 1 FROM subjects ON CONFLICT DO NOTHING',
    [studentId]
  );
  return studentId;
}

router.post('/register', async (req, res) => {
  const { role } = req.body;

  if (role === 'student') {
    const { regno, firstname, lastname, grade, username, password } = req.body;
    if (!regno || !firstname || !lastname || !grade || !username || !password) {
      return res.status(400).json({ error: 'Missing required student fields.' });
    }
    const existing = await db.one('SELECT 1 FROM students WHERE username = $1 OR regno = $2', [username, regno]);
    if (existing) return res.status(409).json({ error: 'Username or registration number already taken.' });

    let studentId;
    try {
      studentId = await createStudent(req.body);
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'Username or registration number already taken.' });
      throw err;
    }

    req.session.user = { id: studentId, role: 'student', name: firstname };
    return res.json({ ok: true, role: 'student' });
  }

  if (role === 'teacher') {
    const { firstname, lastname, email, mobile, subject, password } = req.body;
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ error: 'Missing required teacher fields.' });
    }
    const existing = await db.one('SELECT 1 FROM teachers WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    let teacher;
    try {
      teacher = await db.one(
        'INSERT INTO teachers (firstname, lastname, email, mobile, subject, userpassword) VALUES ($1, $2, $3, $4, $5, $6) RETURNING teacher_id',
        [firstname, lastname, email, mobile || null, subject || null, hash]
      );
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'Email already registered.' });
      throw err;
    }

    req.session.user = { id: teacher.teacher_id, role: 'teacher', name: firstname };
    return res.json({ ok: true, role: 'teacher' });
  }

  if (role === 'parent') {
    const { firstname, lastname, email, mobile, password, child_regno } = req.body;
    if (!firstname || !lastname || !email || !password) {
      return res.status(400).json({ error: 'Missing required parent fields.' });
    }
    const existing = await db.one('SELECT 1 FROM parents WHERE email = $1', [email]);
    if (existing) return res.status(409).json({ error: 'Email already registered.' });

    const hash = await bcrypt.hash(password, 10);
    let parent;
    try {
      parent = await db.one(
        'INSERT INTO parents (firstname, lastname, email, mobile, userpassword) VALUES ($1, $2, $3, $4, $5) RETURNING parent_id',
        [firstname, lastname, email, mobile || null, hash]
      );
    } catch (err) {
      if (isUniqueViolation(err)) return res.status(409).json({ error: 'Email already registered.' });
      throw err;
    }

    // Optional: link a child straight away by registration number. A wrong or
    // missing number just leaves the account with no children linked yet — the
    // dashboard shows a "No Registered Children Linked" empty state.
    let linked = false;
    if (child_regno) {
      const child = await db.one('SELECT student_id FROM students WHERE regno = $1', [String(child_regno).trim()]);
      if (child) {
        await db.query('INSERT INTO parent_children (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
          parent.parent_id,
          child.student_id
        ]);
        linked = true;
      }
    }

    req.session.user = { id: parent.parent_id, role: 'parent', name: firstname };
    return res.json({ ok: true, role: 'parent', linked });
  }

  return res.status(400).json({ error: 'role must be "student", "teacher" or "parent".' });
});

router.post('/login', async (req, res) => {
  const { role, identifier, password } = req.body;

  if (role === 'student') {
    const student = await db.one('SELECT * FROM students WHERE username = $1', [identifier]);
    if (!student || !(await bcrypt.compare(password || '', student.userpassword))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }
    req.session.user = { id: student.student_id, role: 'student', name: student.firstname };
    return res.json({ ok: true, role: 'student' });
  }

  if (role === 'teacher') {
    const teacher = await db.one('SELECT * FROM teachers WHERE email = $1', [identifier]);
    if (!teacher || !(await bcrypt.compare(password || '', teacher.userpassword))) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    req.session.user = { id: teacher.teacher_id, role: 'teacher', name: teacher.firstname };
    return res.json({ ok: true, role: 'teacher' });
  }

  if (role === 'parent') {
    const parent = await db.one('SELECT * FROM parents WHERE email = $1', [identifier]);
    if (!parent || !(await bcrypt.compare(password || '', parent.userpassword))) {
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
module.exports.createStudent = createStudent;
module.exports.isUniqueViolation = isUniqueViolation;
