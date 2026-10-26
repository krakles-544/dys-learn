const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');
const { progressStatus } = require('./insights');

const router = express.Router();

router.get('/dashboard', requireRole('parent'), async (req, res) => {
  const parentId = req.session.user.id;
  const parent = await db.one('SELECT firstname, lastname, email FROM parents WHERE parent_id = $1', [parentId]);

  const rows = await db.all(
    `SELECT s.student_id, s.regno, s.firstname, s.lastname, s.grade, s.attendance_days
     FROM students s
     JOIN parent_children pc ON pc.student_id = s.student_id
     WHERE pc.parent_id = $1 ORDER BY s.firstname`,
    [parentId]
  );

  const children = await Promise.all(
    rows.map(async (child) => {
      const [subjects, stats, guideline] = await Promise.all([
        db.all(
          `SELECT sub.subject_name, sd.level
           FROM subjects sub
           LEFT JOIN student_difficulty sd ON sd.subject_id = sub.subject_id AND sd.student_id = $1
           ORDER BY sub.subject_id`,
          [child.student_id]
        ),
        db.one('SELECT AVG(score) AS avg, COUNT(*)::int AS n FROM activity_attempts WHERE student_id = $1', [child.student_id]),
        db.one('SELECT ai_insight, teacher_note, created_at FROM guidelines WHERE student_id = $1 ORDER BY created_at DESC LIMIT 1', [
          child.student_id
        ])
      ]);

      return {
        ...child,
        subjects,
        averageScore: stats.avg == null ? null : Math.round(stats.avg * 10) / 10,
        attemptCount: stats.n,
        status: progressStatus(stats.avg),
        guideline: guideline || null
      };
    })
  );

  res.json({ parent, children });
});

// Link another child to this parent account by registration number.
router.post('/link', requireRole('parent'), async (req, res) => {
  const regno = String(req.body.regno || '').trim();
  if (!regno) return res.status(400).json({ error: 'A registration number is required.' });
  const child = await db.one('SELECT student_id FROM students WHERE regno = $1', [regno]);
  if (!child) return res.status(404).json({ error: 'No pupil found with that registration number. Ask the school to confirm it.' });
  await db.query('INSERT INTO parent_children (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    req.session.user.id,
    child.student_id
  ]);
  res.json({ ok: true });
});

module.exports = router;
