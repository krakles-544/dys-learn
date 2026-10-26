// Light/dark theme. Loaded right after the stylesheet (before the page body) so
// the saved theme is applied before first paint — no flash of the wrong colours.
//
// Until someone uses the toggle, the theme follows the device's own setting.
// Once they choose, the choice is remembered in this browser.
(function () {
  const KEY = 'dyslearn-theme';
  const systemDark = window.matchMedia('(prefers-color-scheme: dark)');

  function saved() {
    try {
      const v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : null;
    } catch {
      return null; // storage blocked (private mode, etc.) — just follow the device
    }
  }

  function current() {
    return saved() || (systemDark.matches ? 'dark' : 'light');
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('.theme-toggle').forEach(syncButton);
  }

  function syncButton(btn) {
    // The label names the action (what clicking does), so the visible text and
    // the screen-reader name always match.
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.innerHTML = dark
      ? '<span aria-hidden="true">☀️</span> Light mode'
      : '<span aria-hidden="true">🌙</span> Dark mode';
  }

  function toggle() {
    const next = current() === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // Not saved, but still switch for this page.
    }
    apply(next);
  }

  // Adds the toggle to a top bar (into its .bar-right group, created if missing).
  // Safe to call repeatedly; renderTopbar() calls it after redrawing the bar.
  function mountThemeToggle(topbar) {
    const bar = topbar || document.querySelector('.topbar');
    if (!bar || bar.querySelector('.theme-toggle')) return;
    let right = bar.querySelector('.bar-right');
    if (!right) {
      right = document.createElement('div');
      right.className = 'bar-right';
      bar.appendChild(right);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pill-btn theme-toggle';
    btn.addEventListener('click', toggle);
    syncButton(btn);
    right.prepend(btn);
  }

  apply(current());

  // Follow device changes live, unless the person has picked a theme themselves.
  systemDark.addEventListener('change', () => {
    if (!saved()) apply(current());
  });

  document.addEventListener('DOMContentLoaded', () => mountThemeToggle());

  window.mountThemeToggle = mountThemeToggle;
})();
