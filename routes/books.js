const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const db = require('../db/db');
const { requireRole } = require('./auth');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-z0-9._-]+/gi, '_').slice(-60);
    cb(null, `book-${Date.now()}-${safe}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf')
});

const TYPE_LABELS = { textbook: 'Textbook', storybook: 'Storybook', workbook: 'Workbook' };

function requireLogin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

function serialize(b) {
  return {
    book_id: b.book_id,
    subject_id: b.subject_id,
    subject_name: b.subject_name,
    grade: b.grade,
    title: b.title,
    book_type: b.book_type,
    book_type_display: TYPE_LABELS[b.book_type] || b.book_type,
    pdf_url: b.pdf_filename ? `/uploads/${b.pdf_filename}` : null
  };
}

// Subject list, used to populate the teacher's "add book" form.
router.get('/subjects', requireLogin, (req, res) => {
  res.json({ subjects: db.prepare('SELECT subject_id, subject_name FROM subjects ORDER BY subject_id').all() });
});

// Any logged-in user can browse the library. `subjectId` and `grade` are optional filters.
router.get('/', requireLogin, (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.subjectId) { clauses.push('b.subject_id = ?'); params.push(Number(req.query.subjectId)); }
  if (req.query.grade) { clauses.push('b.grade = ?'); params.push(Number(req.query.grade)); }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const books = db
    .prepare(
      `SELECT b.*, sub.subject_name FROM books b
       JOIN subjects sub ON sub.subject_id = b.subject_id
       ${where} ORDER BY sub.subject_id, b.grade, b.title`
    )
    .all(...params)
    .map(serialize);
  res.json({ books });
});

router.post('/', requireRole('teacher'), upload.single('pdf'), (req, res) => {
  const { subjectId, grade, title, book_type } = req.body;
  if (!subjectId || !grade || !title) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Subject, grade and title are required.' });
  }
  const type = ['textbook', 'storybook', 'workbook'].includes(book_type) ? book_type : 'textbook';
  const subjectOk = db.prepare('SELECT 1 FROM subjects WHERE subject_id = ?').get(Number(subjectId));
  if (!subjectOk) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Unknown subject.' });
  }
  db.prepare(
    'INSERT INTO books (subject_id, grade, title, book_type, pdf_filename, uploaded_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(Number(subjectId), Number(grade), String(title).trim(), type, req.file ? req.file.filename : null, new Date().toISOString());
  res.json({ ok: true });
});

router.delete('/:id', requireRole('teacher'), (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE book_id = ?').get(Number(req.params.id));
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  if (book.pdf_filename) fs.unlink(path.join(UPLOAD_DIR, book.pdf_filename), () => {});
  db.prepare('DELETE FROM books WHERE book_id = ?').run(book.book_id);
  res.json({ ok: true });
});

module.exports = router;
