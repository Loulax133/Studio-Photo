import { createStore } from './store.js';
import { renderAuth } from './auth.js';
import { renderHome } from './home.js';
import { toast } from './ui.js';

const isMobile = () => matchMedia('(max-width:760px)').matches;
// téléphone : vue fiche par défaut, 3D à la demande
function openSet(setId, shareId) {
  const open3D = () => import('./editor/editor.js').then(m => {
    current?.destroy?.(); app.innerHTML = '';
    current = m.openEditor(app, store, setId, { shareId, onFiche: isMobile() ? () => openSet(setId, shareId) : null });
  });
  if (isMobile()) {
    import('./fiche.js').then(m => { current?.destroy?.(); app.innerHTML = ''; current = m.openFiche(app, store, setId, { shareId, onOpen3D: open3D }); })
      .catch(e => { console.error(e); toast("Impossible d'ouvrir le set"); });
  } else open3D().catch(e => { console.error(e); toast("Impossible d'ouvrir l'éditeur"); });
}

const app = document.getElementById('app');
let store, current = null; // vue active (pour la nettoyer)

function route() {
  current?.destroy?.(); current = null;
  app.innerHTML = '';
  const h = location.hash.slice(1);
  // lien de partage : visible sans compte
  if (h.startsWith('share-')) {
    if (store.mode !== 'firebase') { app.innerHTML = '<div class="auth"><p class="sub">Ce lien de partage nécessite la version en ligne de Light Studio.</p></div>'; return; }
    openSet(null, h.slice(6));
    return;
  }
  if (!store.user) { current = renderAuth(app, store); return; }
  if (h.startsWith('set-')) openSet(h.slice(4));
  else if (h.startsWith('folder-')) current = renderHome(app, store, h.slice(7));
  else current = renderHome(app, store, null);
}

(async () => {
  app.innerHTML = '<div class="auth"><div class="brand"><span class="brand-mark"></span>Light Studio</div></div>';
  store = await createStore();
  let first = true;
  store.onAuth(() => { if (first) { first = false; } route(); });
  addEventListener('hashchange', route);
})();
