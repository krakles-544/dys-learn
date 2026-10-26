const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');
const { progressStatus } = require('./insights');

const router = express.Router();

router.get('/dashboard', requireRole('student'), async (req, res) => {
  const studentId = req.session.user.id;
  const student = await db.one(
    'SELECT student_id, firstname, lastname, grade, username, attendance_days FROM students WHERE student_id = $1',
    [studentId]
  );
  if (!student) return res.status(404).json({ error: 'Student not found.' });

  const [subjects, recentAttempts, avgRow] = await Promise.all([
    db.all(
      `SELECT sub.subject_id, sub.subject_name, sub.subject_desc,
              COALESCE(sd.level, 1) AS level,
              COALESCE((SELECT array_agg(DISTINCT e.type) FROM exercises e WHERE e.subject_id = sub.subject_id), '{}') AS "availableTypes",
              (SELECT COUNT(*)::int FROM books b WHERE b.subject_id = sub.subject_id AND b.grade = $2) AS "bookCount"
       FROM subjects sub
       LEFT JOIN student_difficulty sd ON sd.subject_id = sub.subject_id AND sd.student_id = $1
       ORDER BY sub.subject_id`,
      [studentId, student.grade]
    ),
    db.all(
      `SELECT a.score, a.grade, a.created_at, e.type FROM activity_attempts a
       JOIN exercises e ON e.exercise_id = a.exercise_id
       WHERE a.student_id = $1 ORDER BY a.created_at DESC LIMIT 10`,
      [studentId]
    ),
    db.one('SELECT AVG(score) AS a FROM activity_attempts WHERE student_id = $1', [studentId])
  ]);

  const withLevels = subjects.map((s) => ({ ...s, hasContent: s.availableTypes.length > 0 }));

  res.json({ student, subjects: withLevels, recentAttempts, status: progressStatus(avgRow.a) });
});

module.exports = router;
