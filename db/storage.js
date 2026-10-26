// Supabase Storage for book PDFs. Uploads go straight from the teacher's browser to
// Storage via a short-lived signed URL, so file bodies never pass through the app
// server (Vercel caps function request bodies at 4.5 MB and has no persistent disk).
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'books';
const MAX_PDF_BYTES = 20 * 1024 * 1024;

const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Service-role key: server-side only, never sent to the browser.
const supabase = configured
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;

async function ensureBucket() {
  const { error } = await supabase.storage.createBucket(BUCKET, {
    public: true,
    allowedMimeTypes: ['application/pdf'],
    fileSizeLimit: MAX_PDF_BYTES
  });
  if (error && !/already exists/i.test(error.message)) throw error;
}

async function createUploadUrl(objectPath) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (error) throw error;
  return data.signedUrl;
}

function publicUrl(objectPath) {
  return supabase.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
}

async function remove(objectPath) {
  const { error } = await supabase.storage.from(BUCKET).remove([objectPath]);
  if (error) console.error('Failed to delete book PDF from storage:', error);
}

module.exports = { configured, MAX_PDF_BYTES, ensureBucket, createUploadUrl, publicUrl, remove };
