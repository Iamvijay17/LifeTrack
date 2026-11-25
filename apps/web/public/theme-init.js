// Apply stored theme and appearance before first paint (non-sensitive preferences only).
try {
  var t = localStorage.getItem('lifetrack:theme') || 'dark';
  var dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  var root = document.documentElement;
  root.classList.toggle('dark', dark);
  var a = JSON.parse(localStorage.getItem('lifetrack:appearance') || 'null');
  if (a) {
    var pct = { small: 93.75, large: 112.5 }[a.font_size];
    if (pct) root.style.fontSize = pct + '%';
    root.dataset.density = a.density === 'compact' ? 'compact' : 'comfortable';
    root.dataset.motion = a.motion === 'reduced' ? 'reduced' : 'system';
    var v = JSON.parse(localStorage.getItem('lifetrack:appearance-vars') || 'null');
    v = v && v[dark ? 'dark' : 'light'];
    if (v) {
      var mod = '';
      for (var k in v) {
        if (k === '--mod' || k === '--mod-2' || k === '--mod-text') mod += k + ':' + v[k] + ';';
        else root.style.setProperty(k, v[k]);
      }
      var s = document.createElement('style');
      s.id = 'lt-accent';
      s.textContent = (dark ? ".dark [data-module='dashboard'],html.dark:not([data-module])" : "[data-module='dashboard'],html:not([data-module])") + '{' + mod + '}';
      document.head.appendChild(s);
    }
  }
} catch (e) {}
