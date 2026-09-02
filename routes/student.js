const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');
const { progressStatus } = require('./insights');

const router = express.Router();

router.get('/dashboard', requireRole('student'), (req, res) => {
  const studentId = req.session.user.id;
  const student = db
    .prepare('SELECT student_id, firstname, lastname, grade, username, attendance_days FROM students WHERE student_id = ?')
    .get(studentId);

  const subjects = db.prepare('SELECT subject_id, subject_name, subject_desc FROM subjects').all();
  const withLevels = subjects.map((s) => {
    const diff = db.prepare('SELECT level FROM student_difficulty WHERE student_id = ? AND subject_id = ?').get(studentId, s.subject_id);
    const availableTypes = db
      .prepare('SELECT DISTINCT type FROM exercises WHERE subject_id = ?')
      .all(s.subject_id)
      .map((r) => r.type);
    const bookCount = db.prepare('SELECT COUNT(*) AS n FROM books WHERE subject_id = ? AND grade = ?').get(s.subject_id, student.grade).n;
    return { ...s, level: diff ? diff.level : 1, hasContent: availableTypes.length > 0, availableTypes, bookCount };
  });

  const recentAttempts = db
    .prepare(
      'SELECT a.score, a.grade, a.created_at, e.type FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id WHERE a.student_id = ? ORDER BY a.created_at DESC LIMIT 10'
    )
    .all(studentId);

  const avg = db.prepare('SELECT AVG(score) AS a FROM activity_attempts WHERE student_id = ?').get(studentId).a;

  res.json({ student, subjects: withLevels, recentAttempts, status: progressStatus(avg) });
});

module.exports = router;
