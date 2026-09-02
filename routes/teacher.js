const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/db');
const { requireRole } = require('./auth');
const { progressStatus, generateInsight } = require('./insights');

const router = express.Router();

// "Enrolled Students" — the pupils registered under this teacher.
router.get('/students', requireRole('teacher'), (req, res) => {
  const teacherId = req.session.user.id;
  const students = db
    .prepare(
      `SELECT s.student_id, s.firstname, s.lastname, s.grade, s.username, s.regno, s.attendance_days,
              (SELECT ROUND(AVG(score), 1) FROM activity_attempts WHERE student_id = s.student_id) AS avg_score,
              (SELECT COUNT(*) FROM activity_attempts WHERE student_id = s.student_id) AS attempt_count
       FROM students s WHERE s.teacher_id = ? ORDER BY s.lastname`
    )
    .all(teacherId)
    .map((s) => ({ ...s, status: progressStatus(s.avg_score) }));
  res.json({ students });
});

// "Register Student" — creates a pupil enrolled under the current teacher.
router.post('/students', requireRole('teacher'), (req, res) => {
  const teacherId = req.session.user.id;
  const { regno, firstname, middlename, lastname, grade, email, username, password, parent_mobile } = req.body;
  if (!regno || !firstname || !lastname || !grade || !username || !password) {
    return res.status(400).json({ error: 'Registration no., first/last name, grade, username and password are required.' });
  }
  const existing = db.prepare('SELECT 1 FROM students WHERE username = ? OR regno = ?').get(username, regno);
  if (existing) return res.status(409).json({ error: 'Username or registration number already taken.' });

  const hash = bcrypt.hashSync(password, 10);
  const studentId = db
    .prepare(
      `INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile, teacher_id, attendance_days)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(regno, firstname, middlename || null, lastname, Number(grade), email || null, username, hash, parent_mobile || null, teacherId).lastInsertRowid;

  for (const subject of db.prepare('SELECT subject_id FROM subjects').all()) {
    db.prepare('INSERT OR IGNORE INTO student_difficulty (student_id, subject_id, level) VALUES (?, ?, 1)').run(studentId, subject.subject_id);
  }

  res.json({ ok: true, studentId });
});

router.get('/students/:id', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const student = db.prepare('SELECT * FROM students WHERE student_id = ? AND teacher_id = ?').get(studentId, req.session.user.id);
  if (!student) return res.status(404).json({ error: 'Student not found in your class.' });
  delete student.userpassword;

  const attempts = db
    .prepare(
      `SELECT a.attempt_id, a.score, a.grade, a.latency_ms, a.created_at, e.type, e.difficulty, sub.subject_name
       FROM activity_attempts a
       JOIN exercises e ON e.exercise_id = a.exercise_id
       JOIN subjects sub ON sub.subject_id = e.subject_id
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

  const latestGuideline = db
    .prepare('SELECT * FROM guidelines WHERE student_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(studentId);

  const avg = db.prepare('SELECT AVG(score) AS a FROM activity_attempts WHERE student_id = ?').get(studentId).a;

  const parents = db
    .prepare(
      `SELECT p.firstname, p.lastname, p.email FROM parents p
       JOIN parent_children pc ON pc.parent_id = p.parent_id WHERE pc.student_id = ?`
    )
    .all(studentId);

  res.json({
    student,
    attempts,
    difficulty,
    status: progressStatus(avg),
    latestReport: latestReport || null,
    latestGuideline: latestGuideline || null,
    parents
  });
});

router.post('/students/:id/attendance', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const days = Math.max(0, Math.round(Number(req.body.days)));
  if (!Number.isFinite(days)) return res.status(400).json({ error: 'days must be a number.' });
  const owned = db.prepare('SELECT 1 FROM students WHERE student_id = ? AND teacher_id = ?').get(studentId, req.session.user.id);
  if (!owned) return res.status(404).json({ error: 'Student not found in your class.' });
  db.prepare('UPDATE students SET attendance_days = ? WHERE student_id = ?').run(days, studentId);
  res.json({ ok: true, attendance_days: days });
});

// Auto-generates strengths/challenges from attempt history grouped by exercise type.
router.post('/students/:id/generate-report', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const owned = db.prepare('SELECT 1 FROM students WHERE student_id = ? AND teacher_id = ?').get(studentId, req.session.user.id);
  if (!owned) return res.status(404).json({ error: 'Student not found in your class.' });

  const attempts = db.prepare('SELECT a.score, e.type FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id WHERE a.student_id = ?').all(studentId);
  if (attempts.length === 0) {
    return res.status(400).json({ error: 'No attempts logged yet for this student.' });
  }

  const byType = {};
  for (const a of attempts) (byType[a.type] ||= []).push(a.score);

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

// Saves the "Learning Insights & Recommendations" the parent portal shows: a
// freshly auto-generated AI insight plus the teacher's own note to the parent.
router.post('/students/:id/guidelines', requireRole('teacher'), (req, res) => {
  const studentId = Number(req.params.id);
  const owned = db.prepare('SELECT 1 FROM students WHERE student_id = ? AND teacher_id = ?').get(studentId, req.session.user.id);
  if (!owned) return res.status(404).json({ error: 'Student not found in your class.' });

  const teacherNote = (req.body.teacher_note || '').trim();
  const aiInsight = generateInsight(db, studentId);
  db.prepare('INSERT INTO guidelines (student_id, ai_insight, teacher_note, created_at) VALUES (?, ?, ?, ?)').run(
    studentId,
    aiInsight,
    teacherNote || null,
    new Date().toISOString()
  );
  res.json({ ok: true, ai_insight: aiInsight, teacher_note: teacherNote });
});

module.exports = router;
