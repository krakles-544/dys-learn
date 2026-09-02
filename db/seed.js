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

// subject_name -> content.json bank key. The five subjects the client asked for.
const SUBJECTS = [
  { name: 'Mathematics', desc: 'Counting, number recognition and addition, subtraction, multiplication & division.', bank: 'math' },
  { name: 'English', desc: 'Reading, spelling, vocabulary and story comprehension.', bank: 'english' },
  { name: 'Social Studies (SST)', desc: 'Community, national symbols, maps and the environment around us.', bank: 'sst' },
  { name: 'Kiswahili', desc: 'Msamiati, tahajia na ufahamu wa hadithi kwa Kiswahili.', bank: 'swahili' },
  { name: 'Science', desc: 'Living things, plants, matter, energy and the world around us.', bank: 'science' }
];

function seedSubjects() {
  const existing = db.prepare('SELECT COUNT(*) AS n FROM subjects').get();
  if (existing.n > 0) return;

  const insertSubject = db.prepare('INSERT INTO subjects (subject_name, subject_desc) VALUES (?, ?)');
  for (const s of SUBJECTS) {
    const id = insertSubject.run(s.name, s.desc).lastInsertRowid;
    if (content[s.bank]) seedExercisesForSubject(id, content[s.bank]);
  }

  console.log('Seeded subjects and exercise content bank.');
}

function seedDemoAccounts() {
  let teacherId = db.prepare('SELECT teacher_id FROM teachers WHERE email = ?').get('teacher@dyslearn.demo')?.teacher_id;
  if (!teacherId) {
    teacherId = db
      .prepare('INSERT INTO teachers (firstname, lastname, email, mobile, subject, userpassword) VALUES (?, ?, ?, ?, ?, ?)')
      .run('Elizabeth', 'Mulei', 'teacher@dyslearn.demo', '0700000000', 'English', bcrypt.hashSync('teacher123', 10)).lastInsertRowid;
    console.log('Seeded demo teacher: teacher@dyslearn.demo / teacher123');
  }

  let studentId = db.prepare('SELECT student_id FROM students WHERE username = ?').get('purity')?.student_id;
  if (!studentId) {
    studentId = db
      .prepare(
        'INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile, teacher_id, attendance_days) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run('DL-2026-001', 'Purity', 'Bosibori', 'Ondieki', 2, 'purity@dyslearn.demo', 'purity', bcrypt.hashSync('purity123', 10), '0711111111', teacherId, 34).lastInsertRowid;

    for (const subject of db.prepare('SELECT subject_id FROM subjects').all()) {
      db.prepare('INSERT OR IGNORE INTO student_difficulty (student_id, subject_id, level) VALUES (?, ?, 1)').run(studentId, subject.subject_id);
    }
    console.log('Seeded demo student: purity / purity123');
  }

  let parentId = db.prepare('SELECT parent_id FROM parents WHERE email = ?').get('parent@dyslearn.demo')?.parent_id;
  if (!parentId) {
    parentId = db
      .prepare('INSERT INTO parents (firstname, lastname, email, mobile, userpassword) VALUES (?, ?, ?, ?, ?)')
      .run('Grace', 'Ondieki', 'parent@dyslearn.demo', '0711111111', bcrypt.hashSync('parent123', 10)).lastInsertRowid;
    db.prepare('INSERT OR IGNORE INTO parent_children (parent_id, student_id) VALUES (?, ?)').run(parentId, studentId);
    console.log('Seeded demo parent: parent@dyslearn.demo / parent123 (linked to purity)');
  }
}

function seedBooks() {
  if (db.prepare('SELECT COUNT(*) AS n FROM books').get().n > 0) return;
  const subjectByName = {};
  for (const s of db.prepare('SELECT subject_id, subject_name FROM subjects').all()) subjectByName[s.subject_name] = s.subject_id;

  const now = new Date().toISOString();
  const rows = [
    ['English', 2, 'The Little Red Hen — Audio Storybook', 'storybook'],
    ['English', 2, 'Grade 2 Phonics Workbook', 'workbook'],
    ['Mathematics', 2, 'Grade 2 Numbers & Counting', 'textbook'],
    ['Social Studies (SST)', 2, 'My Community and Country', 'textbook'],
    ['Kiswahili', 2, 'Hadithi za Kiswahili — Kitabu cha Hadithi', 'storybook'],
    ['Science', 2, 'Grade 2 Living Things and Our World', 'textbook']
  ];
  const insert = db.prepare('INSERT INTO books (subject_id, grade, title, book_type, pdf_filename, uploaded_at) VALUES (?, ?, ?, ?, NULL, ?)');
  for (const [name, grade, title, type] of rows) {
    if (subjectByName[name]) insert.run(subjectByName[name], grade, title, type, now);
  }
  console.log('Seeded sample book library (no PDFs attached yet).');
}

function seedGuideline() {
  const studentId = db.prepare('SELECT student_id FROM students WHERE username = ?').get('purity')?.student_id;
  if (!studentId) return;
  if (db.prepare('SELECT COUNT(*) AS n FROM guidelines WHERE student_id = ?').get(studentId).n > 0) return;
  db.prepare('INSERT INTO guidelines (student_id, ai_insight, teacher_note, created_at) VALUES (?, ?, ?, ?)').run(
    studentId,
    'Excellent work in calculations! However, reading pace is slow. Try engaging the child with the audio-assisted storybooks under the English module for 10 minutes every evening.',
    'Please practice matching African flag shapes with the child at home. Using physical shapes will boost their visual memory before they play the map games.',
    new Date().toISOString()
  );
  console.log('Seeded sample parent guideline for purity.');
}

// Guarded: this runs on every server boot (see server.js) so demo data survives
// hosts with ephemeral disks. A transient failure here (e.g. a lock contention
// race if a restart overlaps the previous process) must not crash the whole
// server before it can even start listening.
try {
  seedSubjects();
  seedDemoAccounts();
  seedBooks();
  seedGuideline();
  console.log('Seed complete.');
} catch (err) {
  console.error('Seeding failed (continuing to start server anyway):', err);
}
