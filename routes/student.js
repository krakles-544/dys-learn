const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');

const router = express.Router();

router.get('/dashboard', requireRole('student'), (req, res) => {
  const studentId = req.session.user.id;
  const student = db.prepare('SELECT student_id, firstname, lastname, grade, username FROM students WHERE student_id = ?').get(studentId);

  const subjects = db.prepare('SELECT subject_id, subject_name, subject_desc FROM subjects').all();
  const withLevels = subjects.map((s) => {
    const diff = db.prepare('SELECT level FROM student_difficulty WHERE student_id = ? AND subject_id = ?').get(studentId, s.subject_id);
    const availableTypes = db
      .prepare('SELECT DISTINCT type FROM exercises WHERE subject_id = ?')
      .all(s.subject_id)
      .map((r) => r.type);
    return { ...s, level: diff ? diff.level : 1, hasContent: availableTypes.length > 0, availableTypes };
  });

  const recentAttempts = db
    .prepare(
      'SELECT a.score, a.grade, a.created_at, e.type FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id WHERE a.student_id = ? ORDER BY a.created_at DESC LIMIT 10'
    )
    .all(studentId);

  res.json({ student, subjects: withLevels, recentAttempts });
});

module.exports = router;
