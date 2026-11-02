// Apply stored theme before first paint (non-sensitive preference only). External file so the CSP can forbid inline scripts.
try {
  var t = localStorage.getItem('lifetrack:theme') || 'dark';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
} catch (e) {}
