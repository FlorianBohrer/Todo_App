// Das Theme vor dem ersten Bild, damit nichts aufblitzt. Dieselbe Regel wie in
// theme.service.ts: dunkel, ausser es ist hell oder System gewählt.
//
// Eine eigene Datei und kein Skript in index.html: die Content-Security-Policy
// (vercel.json) erlaubt nur Skripte aus eigenen Dateien. Ein eingebettetes
// Skript bräuchte 'unsafe-inline' — und damit wäre genau die Regel weg, die
// eingeschleusten Code am Laufen hindert.
(function () {
  var choice = 'dark';
  try { choice = localStorage.getItem('theme') || 'dark'; } catch (e) {}
  var light = choice === 'light' ||
    (choice === 'system' && window.matchMedia && matchMedia('(prefers-color-scheme: light)').matches);
  if (light) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#F3F2F8');
  }
})();
