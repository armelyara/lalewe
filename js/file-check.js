// Classic (non-module) script: ES modules never run from file://, which
// leaves the page blank. Explain how to open the app instead.
if (location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', function () {
    var view = document.getElementById('view');
    if (!view) return;
    view.innerHTML =
      '<div style="max-width:560px;margin:48px auto;padding:24px;line-height:1.5">' +
      '<h1>Ouvrez Lalewe via un serveur web</h1>' +
      '<p>Le navigateur bloque l\'application quand <code>index.html</code> est ouvert directement depuis le disque.</p>' +
      '<p>Dans un terminal, depuis le dossier du projet :</p>' +
      '<pre style="background:#eee;padding:12px;border-radius:8px">python3 -m http.server 8080</pre>' +
      '<p>puis ouvrez <a href="http://localhost:8080">http://localhost:8080</a>.</p>' +
      '</div>';
  });
}

