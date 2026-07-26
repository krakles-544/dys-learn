const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');

const router = express.Router();

router.get('/students', requireRole('teacher'), (req, res) => {
  const students = db
    .prepare(
      `SELECT s.student_id, s.firstname, s.lastname, s.grade, s.username,
              (SELECT ROUND(AVG(score), 1) FROM activity_attempts WHERE student_id = s.student_id) AS avg_score,
              (SELECT COUNT(*) FROM activity_attempts WHERE student_id = s.student_id) AS attempt_count
       FROM students s ORDER BY s.lastname`
    )
    .all();
  res.json({ students });
});

router.get('/students/:id', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE student_id = ?').get(studentId);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  delete student.userpassword;

  const attempts = db
    .prepare(
      `SELECT a.attempt_id, a.score, a.grade, a.latency_ms, a.created_at, e.type, e.difficulty
       FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id
       WHERE a.student_id = ? ORDER BY a.created_at DESC LIMIT 30`
    )
    .all(studentId);

  const difficulty = db
    .prepare(
      `SELECT sd.level, sub.subject_name FROM student_difficulty sd
       JOIN subjects sub ON sub.subject_id = sd.subject_id WHERE sd.student_id = ?`
    )
    .all(studentId);

  const latestReport = db
    .prepare('SELECT * FROM progress_reports WHERE student_id = ? ORDER BY generated_at DESC LIMIT 1')
    .get(studentId);

  res.json({ student, attempts, difficulty, latestReport: latestReport || null });
});

// Auto-generates strengths/challenges from attempt history grouped by exercise type.
router.post('/students/:id/generate-report', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const attempts = db.prepare('SELECT a.score, e.type FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id WHERE a.student_id = ?').all(studentId);

  if (attempts.length === 0) {
    return res.status(400).json({ error: 'No attempts logged yet for this student.' });
  }

  const byType = {};
  for (const a of attempts) {
    if (!byType[a.type]) byType[a.type] = [];
    byType[a.type].push(a.score);
  }

  const avgByType = Object.entries(byType).map(([type, scores]) => ({
    type,
    avg: scores.reduce((a, b) => a + b, 0) / scores.length
  }));

  avgByType.sort((a, b) => b.avg - a.avg);
  const strengths = avgByType.filter((t) => t.avg >= 70).map((t) => t.type).join(', ') || 'Still building consistency';
  const challenges = avgByType.filter((t) => t.avg < 70).map((t) => t.type).join(', ') || 'None significant';

  const averageScore = attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length;

  db.prepare(
    'INSERT INTO progress_reports (student_id, average_score, strengths, challenges, generated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(studentId, Math.round(averageScore * 10) / 10, strengths, challenges, new Date().toISOString());

  res.json({ ok: true });
});

module.exports = router;
