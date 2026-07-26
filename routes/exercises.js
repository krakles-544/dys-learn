const express = require('express');
const db = require('../db/db');
const { requireRole } = require('./auth');

const router = express.Router();

// Content only exists at difficulty tiers 1 (easy), 3 (medium), 5 (hard).
// The adaptive level itself moves 1-5; snap to the nearest tier we have content for.
function snapToTier(level) {
  if (level <= 2) return 1;
  if (level <= 4) return 3;
  return 5;
}

// Multiple-choice exercise types: graded by exact match on the chosen id, same as
// Picture Match. Addition/subtraction reuse dragdrop's pace; multiplication/division
// get a bit more thinking time since they're cognitively heavier for this age group.
const CHOICE_TYPES = ['dragdrop', 'addition', 'subtraction', 'multiplication', 'division'];

const FAST_LATENCY_MS = {
  dragdrop: 10000,
  scramble: 15000,
  dictation: 45000,
  addition: 12000,
  subtraction: 12000,
  multiplication: 15000,
  division: 15000
};

function gradeFromScore(score) {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function getOrCreateSession(req, studentId) {
  if (req.session.currentSessionId) return req.session.currentSessionId;
  const sessionId = db
    .prepare('INSERT INTO sessions (student_id, starttime) VALUES (?, ?)')
    .run(studentId, new Date().toISOString()).lastInsertRowid;
  req.session.currentSessionId = sessionId;
  return sessionId;
}

// Rough keyword-overlap scoring for dictation exercises (no real NLP model needed).
// Curved (sqrt) rather than linear, and floored once they've recalled *something*:
// kids retelling a story shouldn't need every detail to pass.
function scoreDictation(transcript, keywords) {
  const normalized = (transcript || '').toLowerCase();
  const matched = keywords.filter((k) => normalized.includes(k.toLowerCase()));
  if (matched.length === 0) return 0;
  const fraction = matched.length / keywords.length;
  return Math.max(50, Math.round(100 * Math.sqrt(fraction)));
}

// Scramble: reward getting there over getting it first try. The client runs a
// hint-scaffolded retry loop (see exercise-scramble.js) and only ever submits once
// the word is fully correct, so `attempts` (tries taken, including the winning one)
// drives the grade instead of edit-distance on a single guess. A wrong/incomplete
// submission (e.g. a non-JS client) still falls back to the old edit-distance score.
function scoreScrambleByAttempts(attempts) {
  return Math.max(60, 100 - (attempts - 1) * 15);
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[a.length][b.length];
}

function scoreScramble(answer, word) {
  const a = (answer || '').trim().toLowerCase();
  const w = word.toLowerCase();
  if (a === w) return 100;
  const dist = levenshtein(a, w);
  return Math.max(0, Math.round((1 - dist / w.length) * 100));
}

router.get('/next', requireRole('student'), (req, res) => {
  const studentId = req.session.user.id;
  const subjectId = Number(req.query.subjectId);
  const type = req.query.type;

  if (!subjectId || ![...CHOICE_TYPES, 'scramble', 'dictation'].includes(type)) {
    return res.status(400).json({ error: 'subjectId and a valid type are required.' });
  }

  const diffRow = db
    .prepare('SELECT level FROM student_difficulty WHERE student_id = ? AND subject_id = ?')
    .get(studentId, subjectId);
  const level = diffRow ? diffRow.level : 1;
  const tier = snapToTier(level);

  const candidates = db
    .prepare('SELECT * FROM exercises WHERE subject_id = ? AND type = ? AND difficulty = ?')
    .all(subjectId, type, tier);

  if (candidates.length === 0) {
    return res.status(404).json({ error: 'No content available for this subject/type/tier yet.' });
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const content = JSON.parse(picked.content_json);

  // Don't leak the answer to the client. For choice-based types also shuffle the
  // choice order per-request — the authored content always lists the correct
  // choice first, so without this the correct tile would always be in the same
  // position and a kid (or anyone) could learn to click "the first one" and win.
  const safeContent = { ...content };
  if (CHOICE_TYPES.includes(type)) {
    delete safeContent.answer;
    safeContent.choices = shuffleArray(content.choices);
  }
  if (type === 'scramble') safeContent.scrambled = shuffleWord(content.word);

  res.json({
    exerciseId: picked.exercise_id,
    type,
    difficultyTier: tier,
    currentLevel: level,
    content: safeContent
  });
});

function shuffleArray(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function shuffleWord(word) {
  const letters = word.split('');
  for (let i = letters.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [letters[i], letters[j]] = [letters[j], letters[i]];
  }
  const scrambled = letters.join('');
  return scrambled === word ? shuffleWord(word) : scrambled;
}

router.post('/attempt', requireRole('student'), (req, res) => {
  const studentId = req.session.user.id;
  const { exerciseId, subjectId, answer, transcript, latencyMs, attempts } = req.body;

  const exercise = db.prepare('SELECT * FROM exercises WHERE exercise_id = ?').get(exerciseId);
  if (!exercise) return res.status(404).json({ error: 'Exercise not found.' });

  const content = JSON.parse(exercise.content_json);
  let score;

  if (CHOICE_TYPES.includes(exercise.type)) {
    score = answer === content.answer ? 100 : 0;
  } else if (exercise.type === 'scramble') {
    const isCorrect = (answer || '').trim().toLowerCase() === content.word.toLowerCase();
    score = isCorrect ? scoreScrambleByAttempts(Math.max(1, Number(attempts) || 1)) : scoreScramble(answer, content.word);
  } else if (exercise.type === 'dictation') {
    score = scoreDictation(transcript, content.keywords);
    db.prepare('INSERT INTO speechlogs (student_id, input_text, output_text, timestamp) VALUES (?, ?, ?, ?)').run(
      studentId,
      content.story,
      transcript || '',
      new Date().toISOString()
    );
  } else {
    return res.status(400).json({ error: 'Unknown exercise type.' });
  }

  const sessionId = getOrCreateSession(req, studentId);
  const grade = gradeFromScore(score);

  db.prepare(
    'INSERT INTO activity_attempts (session_id, exercise_id, student_id, latency_ms, score, grade, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(sessionId, exerciseId, studentId, latencyMs || 0, score, grade, new Date().toISOString());

  db.prepare('UPDATE sessions SET endtime = ? WHERE session_id = ?').run(new Date().toISOString(), sessionId);

  // Adaptive engine: rule-based difficulty adjustment.
  const diffRow = db
    .prepare('SELECT level FROM student_difficulty WHERE student_id = ? AND subject_id = ?')
    .get(studentId, subjectId);
  let level = diffRow ? diffRow.level : 1;
  const fastThreshold = FAST_LATENCY_MS[exercise.type];
  let direction = 'hold';

  if (score >= 80 && latencyMs <= fastThreshold) {
    level = Math.min(5, level + 1);
    direction = 'up';
  } else if (score < 50) {
    level = Math.max(1, level - 1);
    direction = 'down';
  }

  db.prepare(
    'INSERT INTO student_difficulty (student_id, subject_id, level) VALUES (?, ?, ?) ON CONFLICT(student_id, subject_id) DO UPDATE SET level = excluded.level'
  ).run(studentId, subjectId, level);

  let correctAnswer;
  if (CHOICE_TYPES.includes(exercise.type)) correctAnswer = content.answer;
  else if (exercise.type === 'scramble') correctAnswer = content.word;

  res.json({ score, grade, direction, newLevel: level, correctAnswer });
});

module.exports = router;
