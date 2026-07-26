const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const db = require('./db');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'content.json'), 'utf8'));

// Each top-level key in a content bank (dragdrop, scramble, dictation, addition, ...)
// becomes the `type` column value directly. `scramble` entries are bare strings
// (just the word); everything else is already shaped as the exercise's content_json.
function seedExercisesForSubject(subjectId, bank) {
  const insertExercise = db.prepare(
    'INSERT INTO exercises (subject_id, type, difficulty, content_json) VALUES (?, ?, ?, ?)'
  );

  for (const [type, tiers] of Object.entries(bank)) {
    for (const [difficulty, items] of Object.entries(tiers)) {
      for (const item of items) {
        const contentJson = type === 'scramble' ? JSON.stringify({ word: item }) : JSON.stringify(item);
        insertExercise.run(subjectId, type, Number(difficulty), contentJson);
      }
    }
  }
}

function seedSubjects() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM subjects').get();
  if (existing.n > 0) return;

  const insertSubject = db.prepare('INSERT INTO subjects (subject_name, subject_desc) VALUES (?, ?)');
  const englishId = insertSubject.run('English/Literacy', 'Reading, spelling and comprehension exercises').lastInsertRowid;
  const mathId = insertSubject.run('Math', 'Counting, number recognition, and addition, subtraction, multiplication & division').lastInsertRowid;

  seedExercisesForSubject(englishId, content.english);
  seedExercisesForSubject(mathId, content.math);

  console.log('Seeded subjects and exercise content bank.');
}

function seedDemoAccounts() {
  const teacherExists = db.prepare('SELECT 1 FROM teachers WHERE email = ?').get('teacher@dyslearn.demo');
  if (!teacherExists) {
    db.prepare(
      'INSERT INTO teachers (firstname, lastname, email, mobile, subject, userpassword) VALUES (?, ?, ?, ?, ?, ?)'
    ).run('Elizabeth', 'Mulei', 'teacher@dyslearn.demo', '0700000000', 'English', bcrypt.hashSync('teacher123', 10));
    console.log('Seeded demo teacher: teacher@dyslearn.demo / teacher123');
  }

  const studentExists = db.prepare('SELECT 1 FROM students WHERE username = ?').get('purity');
  if (!studentExists) {
    const studentId = db
      .prepare(
        'INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run('DL-2026-001', 'Purity', 'Bosibori', 'Ondieki', 2, 'purity@dyslearn.demo', 'purity', bcrypt.hashSync('purity123', 10), '0711111111').lastInsertRowid;

    const englishId = db.prepare('SELECT subject_id FROM subjects WHERE subject_name = ?').get('English/Literacy').subject_id;
    db.prepare('INSERT INTO student_difficulty (student_id, subject_id, level) VALUES (?, ?, 1)').run(studentId, englishId);
    console.log('Seeded demo student: purity / purity123');
  }
}

// Guarded: this runs on every server boot (see server.js) so demo data survives
// hosts with ephemeral disks. A transient failure here (e.g. a lock contention
// race if a restart overlaps the previous process) must not crash the whole
// server before it can even start listening.
try {
  seedSubjects();
  seedDemoAccounts();
  console.log('Seed complete.');
} catch (err) {
  console.error('Seeding failed (continuing to start server anyway):', err);
}
