async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    ...options
  });
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
