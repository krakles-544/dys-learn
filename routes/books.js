const crypto = require('crypto');
const express = require('express');
const db = require('../db/db');
const storage = require('../db/storage');
const { requireRole } = require('./auth');

const router = express.Router();

const TYPE_LABELS = { textbook: 'Textbook', storybook: 'Storybook', workbook: 'Workbook' };

// Object paths we hand out look like `<uuid>-<sanitised name>.pdf`; anything else
// submitted as pdf_path is rejected.
const PDF_PATH_RE = /^[0-9a-f-]{36}-[a-z0-9._-]{1,60}\.pdf$/i;

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
    pdf_url: b.pdf_path && storage.configured ? storage.publicUrl(b.pdf_path) : null
  };
}

// Subject list, used to populate the teacher's "add book" form.
router.get('/subjects', requireLogin, async (req, res) => {
  res.json({ subjects: await db.all('SELECT subject_id, subject_name FROM subjects ORDER BY subject_id') });
});

// Any logged-in user can browse the library. `subjectId` and `grade` are optional filters.
router.get('/', requireLogin, async (req, res) => {
  const clauses = [];
  const params = [];
  if (req.query.subjectId) {
    params.push(Number(req.query.subjectId));
    clauses.push(`b.subject_id = $${params.length}`);
  }
  if (req.query.grade) {
    params.push(Number(req.query.grade));
    clauses.push(`b.grade = $${params.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const books = await db.all(
    `SELECT b.*, sub.subject_name FROM books b
     JOIN subjects sub ON sub.subject_id = b.subject_id
     ${where} ORDER BY sub.subject_id, b.grade, b.title`,
    params
  );
  res.json({ books: books.map(serialize) });
});

// Step 1 of attaching a PDF: get a one-time signed URL the browser uploads to directly.
router.post('/upload-url', requireRole('teacher'), async (req, res) => {
  if (!storage.configured) {
    return res.status(503).json({ error: 'PDF uploads are not configured on this server yet.' });
  }
  const { filename, size } = req.body;
  if (!/\.pdf$/i.test(String(filename || ''))) return res.status(400).json({ error: 'Only PDF files can be attached.' });
  if (Number(size) > storage.MAX_PDF_BYTES) return res.status(400).json({ error: 'PDF must be 20 MB or smaller.' });

  const safe = String(filename).replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '_').slice(-50) || 'book';
  const pdfPath = `${crypto.randomUUID()}-${safe}.pdf`;
  res.json({ pdf_path: pdfPath, upload_url: await storage.createUploadUrl(pdfPath) });
});

// Step 2: save the book record (with the uploaded PDF's path, if any).
router.post('/', requireRole('teacher'), async (req, res) => {
  const { subjectId, grade, title, book_type, pdf_path } = req.body;
  if (!subjectId || !grade || !String(title || '').trim()) {
    return res.status(400).json({ error: 'Subject, grade and title are required.' });
  }
  if (pdf_path && !PDF_PATH_RE.test(pdf_path)) return res.status(400).json({ error: 'Invalid PDF reference.' });

  const type = ['textbook', 'storybook', 'workbook'].includes(book_type) ? book_type : 'textbook';
  const subjectOk = await db.one('SELECT 1 FROM subjects WHERE subject_id = $1', [Number(subjectId)]);
  if (!subjectOk) {
    if (pdf_path && storage.configured) await storage.remove(pdf_path);
    return res.status(400).json({ error: 'Unknown subject.' });
  }
  await db.query('INSERT INTO books (subject_id, grade, title, book_type, pdf_path) VALUES ($1, $2, $3, $4, $5)', [
    Number(subjectId),
    Number(grade),
    String(title).trim(),
    type,
    pdf_path || null
  ]);
  res.json({ ok: true });
});

router.delete('/:id', requireRole('teacher'), async (req, res) => {
  const book = await db.one('DELETE FROM books WHERE book_id = $1 RETURNING pdf_path', [Number(req.params.id)]);
  if (!book) return res.status(404).json({ error: 'Book not found.' });
  if (book.pdf_path && storage.configured) await storage.remove(book.pdf_path);
  res.json({ ok: true });
});

module.exports = router;
