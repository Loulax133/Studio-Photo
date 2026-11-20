import { createStore } from './store.js';
import { renderAuth } from './auth.js';
import { renderHome } from './home.js';
import { toast } from './ui.js';

const app = document.getElementById('app');
let store, current = null; // vue active (pour la nettoyer)

function route() {
  current?.destroy?.(); current = null;
  app.innerHTML = '';
  if (!store.user) { current = renderAuth(app, store); return; }
  const h = location.hash.slice(1);
  if (h.startsWith('set-')) {
    import('./editor/editor.js').then(m => { current = m.openEditor(app, store, h.slice(4)); })
      .catch(e => { console.error(e); toast("Impossible d'ouvrir l'éditeur"); });
  } else if (h.startsWith('folder-')) current = renderHome(app, store, h.slice(7));
  else current = renderHome(app, store, null);
}

(async () => {
  app.innerHTML = '<div class="auth"><div class="brand"><span class="brand-mark"></span>Light Studio</div></div>';
  store = await createStore();
  let first = true;
  store.onAuth(() => { if (first) { first = false; } route(); });
  addEventListener('hashchange', route);
})();
