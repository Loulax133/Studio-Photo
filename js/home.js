import { icon, esc, modal, popMenu, toast, timeAgo } from './ui.js';
import { defaultScene } from './editor/defaults.js';

export function renderHome(root, store, folderId) {
  let alive = true;
  const u = store.user;
  root.innerHTML = `
    <header class="top"><div class="top-in">
      <div class="brand"><span class="brand-mark"></span>Light Studio</div>
      <div class="grow"></div>
      <button class="avatar" id="me" title="${esc(u.name)}">${u.photo ? `<img src="${esc(u.photo)}" alt="">` : esc((u.name || '?')[0].toUpperCase())}</button>
    </div></header>
    <main class="home" id="main"><div class="empty">Chargement…</div></main>`;
  root.querySelector('#me').onclick = e => popMenu(e.currentTarget, [
    { icon: 'out', label: store.mode === 'local' ? 'Quitter le studio' : 'Se déconnecter', run: () => store.signOut() }]);
  const main = root.querySelector('#main');

  const setCard = s => `<div class="card set" data-set="${s.id}">
      <button class="frame" data-open="${s.id}" aria-label="Ouvrir ${esc(s.name)}">${s.thumb ? `<img src="${s.thumb}" alt="">` : icon('frame')}</button>
      <div class="meta"><div style="flex:1;min-width:0"><div class="t">${esc(s.name)}</div><div class="d">${timeAgo(s.updatedAt)}</div></div>
      <button class="more" data-more-set="${s.id}" aria-label="Options">${icon('more')}</button></div></div>`;

  async function draw() {
    try {
      if (!folderId) {
        const [folders, sets] = await Promise.all([store.listFolders(), store.listSets(null)]);
        if (!alive) return;
        const byFolder = {}; for (const s of sets) (byFolder[s.folderId] ||= []).push(s);
        main.innerHTML = `
          <div class="home-head"><h1>Projets</h1><button class="btn primary" id="nf">${icon('plus')}Nouveau dossier</button></div>
          ${folders.length ? `<div class="grid">${folders.map(f => {
            const fs = byFolder[f.id] || [];
            const ph = [0, 1, 2, 3].map(i => `<div class="ph">${fs[i]?.thumb ? `<img src="${fs[i].thumb}" alt="">` : ''}</div>`).join('');
            return `<div class="card folder"><button class="frame" data-folder="${f.id}" aria-label="Ouvrir ${esc(f.name)}">${ph}</button>
              <div class="meta"><div style="flex:1;min-width:0"><div class="t">${esc(f.name)}</div><div class="d">${fs.length} set${fs.length > 1 ? 's' : ''}</div></div>
              <button class="more" data-more-folder="${f.id}" aria-label="Options">${icon('more')}</button></div></div>`;
          }).join('')}</div>` : `<div class="empty">Crée un premier dossier pour ranger tes sets (un client, une campagne, un shooting…).</div>`}
          ${sets.length ? `<h2 class="section-label" style="margin-top:44px">Récents</h2><div class="grid">${sets.slice(0, 8).map(setCard).join('')}</div>` : ''}`;
        main.querySelector('#nf').onclick = newFolder;
        main.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => location.hash = 'folder-' + b.dataset.folder);
        main.querySelectorAll('[data-more-folder]').forEach(b => b.onclick = () => {
          const f = folders.find(x => x.id === b.dataset.moreFolder);
          popMenu(b, [
            { icon: 'edit', label: 'Renommer', run: async () => { const n = await modal({ title: 'Renommer le dossier', input: f.name, ok: 'Renommer' }); if (n) { await store.updateFolder(f.id, { name: n }); draw(); } } },
            { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await modal({ title: 'Supprimer « ' + f.name + ' » ?', text: 'Le dossier et tous ses sets seront supprimés définitivement.', ok: 'Supprimer', danger: true })) { await store.deleteFolder(f.id); draw(); } } }]);
        });
      } else {
        const folders = await store.listFolders();
        const f = folders.find(x => x.id === folderId);
        if (!f) { location.hash = ''; return; }
        const sets = await store.listSets(folderId);
        if (!alive) return;
        main.innerHTML = `
          <div class="crumbs"><button id="up">Projets</button>${icon('chev')}<span>${esc(f.name)}</span></div>
          <div class="home-head"><h1>${esc(f.name)}</h1></div>
          <div class="grid">
            <div class="card new"><button class="frame" id="ns">${icon('plus')}<span>Nouveau set</span></button></div>
            ${sets.map(setCard).join('')}
          </div>`;
        main.querySelector('#up').onclick = () => location.hash = '';
        main.querySelector('#ns').onclick = async () => {
          const n = await modal({ title: 'Nouveau set', input: `Set ${sets.length + 1}`, ok: 'Créer' });
          if (!n) return;
          const s = await store.createSet(folderId, n, defaultScene());
          location.hash = 'set-' + s.id;
        };
      }
      main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => location.hash = 'set-' + b.dataset.open);
      main.querySelectorAll('[data-more-set]').forEach(b => b.onclick = async () => {
        const s = (await store.listSets(null)).find(x => x.id === b.dataset.moreSet);
        popMenu(b, [
          { icon: 'edit', label: 'Renommer', run: async () => { const n = await modal({ title: 'Renommer le set', input: s.name, ok: 'Renommer' }); if (n) { await store.updateSet(s.id, { name: n }); draw(); } } },
          { icon: 'dup', label: 'Dupliquer', run: async () => { const full = await store.getSet(s.id); const c = await store.createSet(s.folderId, s.name + ' (copie)', typeof full.scene === 'string' ? JSON.parse(full.scene) : full.scene); await store.updateSet(c.id, { thumb: full.thumb || '' }); draw(); } },
          { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await modal({ title: 'Supprimer « ' + s.name + ' » ?', text: 'Ce set sera supprimé définitivement.', ok: 'Supprimer', danger: true })) { await store.deleteSet(s.id); draw(); } } }]);
      });
    } catch (e) { console.error(e); main.innerHTML = '<div class="empty">Impossible de charger tes projets. Vérifie ta connexion.</div>'; }
  }
  async function newFolder() {
    const n = await modal({ title: 'Nouveau dossier', input: '', ok: 'Créer' });
    if (!n) return;
    await store.createFolder(n); toast('Dossier créé'); draw();
  }
  draw();
  return { destroy() { alive = false; } };
}
