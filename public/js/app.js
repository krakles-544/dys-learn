async function api(path, options = {}) {
  const opts = { credentials: 'same-origin', ...options };
  // Let the browser set multipart boundaries itself for FormData bodies.
  if (!(opts.body instanceof FormData)) {
    opts.headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  }
  const res = await fetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function wireLogout(selector) {
  const el = document.querySelector(selector);
  if (!el) return;
  el.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  });
}

async function requireAuth(role) {
  try {
    const me = await api('/api/auth/me');
    if (me.role !== role) {
      window.location.href = '/';
      return null;
    }
    return me;
  } catch {
    window.location.href = '/';
    return null;
  }
}

// Minimal text-to-speech for the dashboards ("Listen to instructions", subject
// read-aloud). The exercise pages load the richer speech.js helper separately.
function say(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.lang = 'en-US';
  window.speechSynthesis.speak(u);
}

// Renders the shared purple app bar into <div id="topbar">.
// portal: e.g. "Student", "Teacher Portal", "Parent Portal".
function renderTopbar({ portal, name, greetingWord = 'Hi' }) {
  const el = document.getElementById('topbar');
  if (!el) return;
  el.className = 'topbar';
  el.innerHTML = `
    <a class="brand" href="#"><span class="brand-icon">🎓</span> Dyslearn ${portal}</a>
    <div class="bar-right">
      ${name ? `<span class="who">${greetingWord}, ${escapeHtml(name)}</span>` : ''}
      <a href="#" id="logout" class="pill-btn">Logout</a>
    </div>
  `;
  wireLogout('#logout');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function badge(status) {
  if (!status) return '';
  return `<span class="badge ${status.tone}">${status.label}</span>`;
}

// Per-subject colour, icon and game-button copy, keyed by the seeded subject_name.
const SUBJECT_META = {
  'Mathematics': { cls: 'subject-blue', icon: '🔢', cta: 'Play Math Game' },
  'English': { cls: 'subject-green', icon: '📖', cta: 'Play Word Game' },
  'Social Studies (SST)': { cls: 'subject-amber', icon: '🗺️', cta: 'Play Map Game' },
  'Kiswahili': { cls: 'subject-violet', icon: '🗣️', cta: 'Play Word Game' },
  'Science': { cls: 'subject-teal', icon: '🔬', cta: 'Play Science Game' }
};

function subjectMeta(name) {
  return SUBJECT_META[name] || { cls: 'subject-blue', icon: '📚', cta: 'Play Game' };
}

// The exercise types each subject offers in the pupil UI, in display order.
// Curated (not purely derived from the DB) so retired content doesn't resurface.
const SUBJECT_TYPES = {
  'Mathematics': ['dragdrop', 'addition', 'subtraction', 'multiplication', 'division'],
  'English': ['dragdrop', 'scramble', 'dictation'],
  'Social Studies (SST)': ['dragdrop', 'scramble', 'dictation'],
  'Kiswahili': ['dragdrop', 'scramble', 'dictation'],
  'Science': ['dragdrop', 'scramble', 'dictation']
};

const TYPE_LABELS = {
  dragdrop: '🖼️ Picture Match',
  scramble: '🔤 Word Scramble',
  dictation: '🎧 Listen & Retell',
  addition: '➕ Addition',
  subtraction: '➖ Subtraction',
  multiplication: '✖️ Multiplication',
  division: '➗ Division'
};
