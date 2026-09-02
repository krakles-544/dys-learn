const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');
const { progressStatus } = require('./insights');

const router = express.Router();

router.get('/dashboard', requireRole('parent'), (req, res) => {
  const parentId = req.session.user.id;
  const parent = db.prepare('SELECT firstname, lastname, email FROM parents WHERE parent_id = ?').get(parentId);

  const children = db
    .prepare(
      `SELECT s.student_id, s.regno, s.firstname, s.lastname, s.grade, s.attendance_days
       FROM students s
       JOIN parent_children pc ON pc.student_id = s.student_id
       WHERE pc.parent_id = ? ORDER BY s.firstname`
    )
    .all(parentId)
    .map((child) => {
      const subjects = db
        .prepare(
          `SELECT sub.subject_name,
                  (SELECT level FROM student_difficulty WHERE student_id = ? AND subject_id = sub.subject_id) AS level
           FROM subjects sub ORDER BY sub.subject_id`
        )
        .all(child.student_id);

      const avg = db.prepare('SELECT AVG(score) AS a FROM activity_attempts WHERE student_id = ?').get(child.student_id).a;
      const attemptCount = db.prepare('SELECT COUNT(*) AS n FROM activity_attempts WHERE student_id = ?').get(child.student_id).n;
      const guideline = db
        .prepare('SELECT ai_insight, teacher_note, created_at FROM guidelines WHERE student_id = ? ORDER BY created_at DESC LIMIT 1')
        .get(child.student_id);

      return {
        ...child,
        subjects,
        averageScore: avg == null ? null : Math.round(avg * 10) / 10,
        attemptCount,
        status: progressStatus(avg),
        guideline: guideline || null
      };
    });

  res.json({ parent, children });
});

// Link another child to this parent account by registration number.
router.post('/link', requireRole('parent'), (req, res) => {
  const regno = String(req.body.regno || '').trim();
  if (!regno) return res.status(400).json({ error: 'A registration number is required.' });
  const child = db.prepare('SELECT student_id FROM students WHERE regno = ?').get(regno);
  if (!child) return res.status(404).json({ error: 'No pupil found with that registration number. Ask the school to confirm it.' });
  db.prepare('INSERT OR IGNORE INTO parent_children (parent_id, student_id) VALUES (?, ?)').run(req.session.user.id, child.student_id);
  res.json({ ok: true });
});

module.exports = router;
