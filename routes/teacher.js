const express = require('express');
const db = require('../db/db');
const { requireRole, createStudent, isUniqueViolation } = require('./auth');
const { progressStatus, generateInsight } = require('./insights');

const router = express.Router();

async function ownsStudent(teacherId, studentId) {
  return Boolean(await db.one('SELECT 1 FROM students WHERE student_id = $1 AND teacher_id = $2', [studentId, teacherId]));
}

// "Enrolled Students" — the pupils registered under this teacher.
router.get('/students', requireRole('teacher'), async (req, res) => {
  const teacherId = req.session.user.id;
  const students = (
    await db.all(
      `SELECT s.student_id, s.firstname, s.lastname, s.grade, s.username, s.regno, s.attendance_days,
              (SELECT ROUND(AVG(score)::numeric, 1)::float8 FROM activity_attempts WHERE student_id = s.student_id) AS avg_score,
              (SELECT COUNT(*)::int FROM activity_attempts WHERE student_id = s.student_id) AS attempt_count
       FROM students s WHERE s.teacher_id = $1 ORDER BY s.lastname`,
      [teacherId]
    )
  ).map((s) => ({ ...s, status: progressStatus(s.avg_score) }));
  res.json({ students });
});

// "Register Student" — creates a pupil enrolled under the current teacher.
router.post('/students', requireRole('teacher'), async (req, res) => {
  const teacherId = req.session.user.id;
  const { regno, firstname, lastname, grade, username, password } = req.body;
  if (!regno || !firstname || !lastname || !grade || !username || !password) {
    return res.status(400).json({ error: 'Registration no., first/last name, grade, username and password are required.' });
  }
  const existing = await db.one('SELECT 1 FROM students WHERE username = $1 OR regno = $2', [username, regno]);
  if (existing) return res.status(409).json({ error: 'Username or registration number already taken.' });

  try {
    const studentId = await createStudent(req.body, teacherId);
    res.json({ ok: true, studentId });
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: 'Username or registration number already taken.' });
    throw err;
  }
});

router.get('/students/:id', requireRole('teacher'), async (req, res) => {
  const studentId = Number(req.params.id);
  const student = await db.one('SELECT * FROM students WHERE student_id = $1 AND teacher_id = $2', [studentId, req.session.user.id]);
  if (!student) return res.status(404).json({ error: 'Student not found in your class.' });
  delete student.userpassword;

  const [attempts, difficulty, latestReport, latestGuideline, avgRow, parents] = await Promise.all([
    db.all(
      `SELECT a.attempt_id, a.score, a.grade, a.latency_ms, a.created_at, e.type, e.difficulty, sub.subject_name
       FROM activity_attempts a
       JOIN exercises e ON e.exercise_id = a.exercise_id
       JOIN subjects sub ON sub.subject_id = e.subject_id
       WHERE a.student_id = $1 ORDER BY a.created_at DESC LIMIT 30`,
      [studentId]
    ),
    db.all(
      `SELECT sd.level, sub.subject_name FROM student_difficulty sd
       JOIN subjects sub ON sub.subject_id = sd.subject_id WHERE sd.student_id = $1
       ORDER BY sub.subject_id`,
      [studentId]
    ),
    db.one('SELECT * FROM progress_reports WHERE student_id = $1 ORDER BY generated_at DESC LIMIT 1', [studentId]),
    db.one('SELECT * FROM guidelines WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [studentId]),
    db.one('SELECT AVG(score) AS a FROM activity_attempts WHERE student_id = $1', [studentId]),
    db.all(
      `SELECT p.firstname, p.lastname, p.email FROM parents p
       JOIN parent_children pc ON pc.parent_id = p.parent_id WHERE pc.student_id = $1`,
      [studentId]
    )
  ]);

  res.json({
    student,
    attempts,
    difficulty,
    status: progressStatus(avgRow.a),
    latestReport: latestReport || null,
    latestGuideline: latestGuideline || null,
    parents
  });
});

router.post('/students/:id/attendance', requireRole('teacher'), async (req, res) => {
  const studentId = Number(req.params.id);
  const days = Math.max(0, Math.round(Number(req.body.days)));
  if (!Number.isFinite(days)) return res.status(400).json({ error: 'days must be a number.' });
  if (!(await ownsStudent(req.session.user.id, studentId))) return res.status(404).json({ error: 'Student not found in your class.' });
  await db.query('UPDATE students SET attendance_days = $1 WHERE student_id = $2', [days, studentId]);
  res.json({ ok: true, attendance_days: days });
});

// Auto-generates strengths/challenges from attempt history grouped by exercise type.
router.post('/students/:id/generate-report', requireRole('teacher'), async (req, res) => {
  const studentId = Number(req.params.id);
  if (!(await ownsStudent(req.session.user.id, studentId))) return res.status(404).json({ error: 'Student not found in your class.' });

  const attempts = await db.all(
    'SELECT a.score, e.type FROM activity_attempts a JOIN exercises e ON e.exercise_id = a.exercise_id WHERE a.student_id = $1',
    [studentId]
  );
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

  await db.query('INSERT INTO progress_reports (student_id, average_score, strengths, challenges) VALUES ($1, $2, $3, $4)', [
    studentId,
    Math.round(averageScore * 10) / 10,
    strengths,
    challenges
  ]);

  res.json({ ok: true });
});

// Saves the "Learning Insights & Recommendations" the parent portal shows: a
// freshly auto-generated AI insight plus the teacher's own note to the parent.
router.post('/students/:id/guidelines', requireRole('teacher'), async (req, res) => {
  const studentId = Number(req.params.id);
  if (!(await ownsStudent(req.session.user.id, studentId))) return res.status(404).json({ error: 'Student not found in your class.' });

  const teacherNote = (req.body.teacher_note || '').trim();
  const aiInsight = await generateInsight(studentId);
  await db.query('INSERT INTO guidelines (student_id, ai_insight, teacher_note) VALUES ($1, $2, $3)', [
    studentId,
    aiInsight,
    teacherNote || null
  ]);
  res.json({ ok: true, ai_insight: aiInsight, teacher_note: teacherNote });
});

module.exports = router;
