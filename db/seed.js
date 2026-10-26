// Seeds subjects, the exercise content bank, demo accounts, sample books and a
// sample parent guideline. Idempotent — each step skips what already exists — so
// `npm run seed` is safe to re-run. Run it once after `npm run db:migrate`.
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');

const content = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'content.json'), 'utf8'));

// subject_name -> content.json bank key. The five subjects the client asked for.
const SUBJECTS = [
  { name: 'Mathematics', desc: 'Counting, number recognition and addition, subtraction, multiplication & division.', bank: 'math' },
  { name: 'English', desc: 'Reading, spelling, vocabulary and story comprehension.', bank: 'english' },
  { name: 'Social Studies (SST)', desc: 'Community, national symbols, maps and the environment around us.', bank: 'sst' },
  { name: 'Kiswahili', desc: 'Msamiati, tahajia na ufahamu wa hadithi kwa Kiswahili.', bank: 'swahili' },
  { name: 'Science', desc: 'Living things, plants, matter, energy and the world around us.', bank: 'science' }
];

// Each top-level key in a content bank (dragdrop, scramble, dictation, addition, ...)
// becomes the `type` column value directly. `scramble` entries are bare strings
// (just the word); everything else is already shaped as the exercise's content_json.
async function seedExercisesForSubject(client, subjectId, bank) {
  for (const [type, tiers] of Object.entries(bank)) {
    for (const [difficulty, items] of Object.entries(tiers)) {
      for (const item of items) {
        const contentJson = type === 'scramble' ? { word: item } : item;
        await client.query('INSERT INTO exercises (subject_id, type, difficulty, content_json) VALUES ($1, $2, $3, $4)', [
          subjectId,
          type,
          Number(difficulty),
          JSON.stringify(contentJson)
        ]);
      }
    }
  }
}

async function seedSubjects(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM subjects');
  if (rows[0].n > 0) return;

  for (const s of SUBJECTS) {
    const { rows: inserted } = await client.query(
      'INSERT INTO subjects (subject_name, subject_desc) VALUES ($1, $2) RETURNING subject_id',
      [s.name, s.desc]
    );
    if (content[s.bank]) await seedExercisesForSubject(client, inserted[0].subject_id, content[s.bank]);
  }
  console.log('Seeded subjects and exercise content bank.');
}

async function seedDemoAccounts(client) {
  let teacherId = (await client.query('SELECT teacher_id FROM teachers WHERE email = $1', ['teacher@dyslearn.demo'])).rows[0]?.teacher_id;
  if (!teacherId) {
    const { rows } = await client.query(
      'INSERT INTO teachers (firstname, lastname, email, mobile, subject, userpassword) VALUES ($1, $2, $3, $4, $5, $6) RETURNING teacher_id',
      ['Elizabeth', 'Mulei', 'teacher@dyslearn.demo', '0700000000', 'English', await bcrypt.hash('teacher123', 10)]
    );
    teacherId = rows[0].teacher_id;
    console.log('Seeded demo teacher: teacher@dyslearn.demo / teacher123');
  }

  let studentId = (await client.query('SELECT student_id FROM students WHERE username = $1', ['purity'])).rows[0]?.student_id;
  if (!studentId) {
    const { rows } = await client.query(
      `INSERT INTO students (regno, firstname, middlename, lastname, grade, email, username, userpassword, parent_mobile, teacher_id, attendance_days)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING student_id`,
      ['DL-2026-001', 'Purity', 'Bosibori', 'Ondieki', 2, 'purity@dyslearn.demo', 'purity', await bcrypt.hash('purity123', 10), '0711111111', teacherId, 34]
    );
    studentId = rows[0].student_id;
    await client.query(
      'INSERT INTO student_difficulty (student_id, subject_id, level) SELECT $1, subject_id, 1 FROM subjects ON CONFLICT DO NOTHING',
      [studentId]
    );
    console.log('Seeded demo student: purity / purity123');
  }

  const parentExists = (await client.query('SELECT 1 FROM parents WHERE email = $1', ['parent@dyslearn.demo'])).rows[0];
  if (!parentExists) {
    const { rows } = await client.query(
      'INSERT INTO parents (firstname, lastname, email, mobile, userpassword) VALUES ($1, $2, $3, $4, $5) RETURNING parent_id',
      ['Grace', 'Ondieki', 'parent@dyslearn.demo', '0711111111', await bcrypt.hash('parent123', 10)]
    );
    await client.query('INSERT INTO parent_children (parent_id, student_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [rows[0].parent_id, studentId]);
    console.log('Seeded demo parent: parent@dyslearn.demo / parent123 (linked to purity)');
  }
}

async function seedBooks(client) {
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM books');
  if (rows[0].n > 0) return;

  const books = [
    ['English', 2, 'The Little Red Hen — Audio Storybook', 'storybook'],
    ['English', 2, 'Grade 2 Phonics Workbook', 'workbook'],
    ['Mathematics', 2, 'Grade 2 Numbers & Counting', 'textbook'],
    ['Social Studies (SST)', 2, 'My Community and Country', 'textbook'],
    ['Kiswahili', 2, 'Hadithi za Kiswahili — Kitabu cha Hadithi', 'storybook'],
    ['Science', 2, 'Grade 2 Living Things and Our World', 'textbook']
  ];
  for (const [name, grade, title, type] of books) {
    await client.query(
      'INSERT INTO books (subject_id, grade, title, book_type) SELECT subject_id, $2, $3, $4 FROM subjects WHERE subject_name = $1',
      [name, grade, title, type]
    );
  }
  console.log('Seeded sample book library (no PDFs attached yet).');
}

async function seedGuideline(client) {
  const studentId = (await client.query('SELECT student_id FROM students WHERE username = $1', ['purity'])).rows[0]?.student_id;
  if (!studentId) return;
  const { rows } = await client.query('SELECT COUNT(*)::int AS n FROM guidelines WHERE student_id = $1', [studentId]);
  if (rows[0].n > 0) return;
  await client.query('INSERT INTO guidelines (student_id, ai_insight, teacher_note) VALUES ($1, $2, $3)', [
    studentId,
    'Excellent work in calculations! However, reading pace is slow. Try engaging the child with the audio-assisted storybooks under the English module for 10 minutes every evening.',
    'Please practice matching African flag shapes with the child at home. Using physical shapes will boost their visual memory before they play the map games.'
  ]);
  console.log('Seeded sample parent guideline for purity.');
}

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await seedSubjects(client);
    await seedDemoAccounts(client);
    await seedBooks(client);
    await seedGuideline(client);
    await client.query('COMMIT');
    console.log('Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

seed()
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
