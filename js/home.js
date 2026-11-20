import { icon, esc, modal, popMenu, toast, timeAgo } from './ui.js';
import { defaultScene, parseSetFile } from './editor/defaults.js';

const skeleton = n => `<div class="grid">${Array.from({ length: n }, () => '<div class="card sk"><div class="frame"></div><div class="meta"><div class="sk-line"></div></div></div>').join('')}</div>`;

export function renderHome(root, store, folderId) {
  let alive = true, folders = [], sets = [], lastSig = '';
  const u = store.user;
  root.innerHTML = `
    <header class="top"><div class="top-in">
      <button class="brand" id="logo"><span class="brand-mark"></span>Light Studio</button>
      <div class="grow"></div>
      <button class="avatar" id="me" title="${esc(u.name)}">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc((u.name || '?')[0].toUpperCase())}</button>
    </div></header>
    <main class="home" id="main">
      <div class="home-head"><h1 class="sk-title"></h1></div>${skeleton(4)}
    </main>`;
  root.querySelector('#logo').onclick = () => location.hash = '';
  root.querySelector('#me').onclick = e => popMenu(e.currentTarget, [
    { icon: 'out', label: store.mode === 'local' ? 'Quitter le studio' : 'Se déconnecter', run: () => store.signOut() }]);
  const main = root.querySelector('#main');

  const setCard = s => `<div class="card set">
      <button class="frame" data-open="${s.id}" aria-label="Ouvrir ${esc(s.name)}">${s.thumb ? `<img src="${s.thumb}" alt="" loading="lazy">` : icon('frame')}</button>
      <div class="meta"><div style="flex:1;min-width:0"><div class="t">${esc(s.name)}</div><div class="d">${timeAgo(s.updatedAt)}</div></div>
      <button class="more" data-more-set="${s.id}" aria-label="Options">${icon('more')}</button></div></div>`;

  // 1) cache local (instantané), 2) serveur (à jour)
  async function load() {
    try {
      const [cf, cs] = await Promise.all([store.listFolders('cache'), store.listSets(null, 'cache')]);
      if (alive && cf && cf.length + (cs?.length || 0) > 0) { folders = cf; sets = cs || []; draw(); }
      const [sf, ss] = await Promise.all([store.listFolders(), store.listSets(null)]);
      if (!alive) return;
      folders = sf; sets = ss; draw();
    } catch (e) {
      console.error(e);
      if (!folders.length) main.innerHTML = '<div class="empty">Impossible de charger tes projets. Vérifie ta connexion puis recharge la page.</div>';
    }
  }
  const reload = () => load();

  function draw() {
    // évite de redessiner si rien n'a changé entre le cache et le serveur
    const sig = JSON.stringify([folderId, folders.map(f => [f.id, f.name, f.updatedAt]), sets.map(s => [s.id, s.name, s.updatedAt, s.folderId, (s.thumb || '').length])]);
    if (sig === lastSig) return; lastSig = sig;
    if (!folderId) drawRoot(); else drawFolder();
    bindCards();
  }

  function drawRoot() {
    const byFolder = {}; for (const s of sets) (byFolder[s.folderId] ||= []).push(s);
    main.innerHTML = `
      <div class="home-head"><h1>Projets</h1><button class="btn primary" id="new">${icon('plus')}Nouveau</button></div>
      ${folders.length ? `<div class="grid">${folders.map(f => {
        const fs = byFolder[f.id] || [];
        const ph = [0, 1, 2, 3].map(i => `<div class="ph">${fs[i]?.thumb ? `<img src="${fs[i].thumb}" alt="" loading="lazy">` : ''}</div>`).join('');
        return `<div class="card folder"><button class="frame" data-folder="${f.id}" aria-label="Ouvrir ${esc(f.name)}">${ph}</button>
          <div class="meta"><div style="flex:1;min-width:0"><div class="t">${esc(f.name)}</div><div class="d">${fs.length} set${fs.length > 1 ? 's' : ''}</div></div>
          <button class="more" data-more-folder="${f.id}" aria-label="Options">${icon('more')}</button></div></div>`;
      }).join('')}</div>` : `<div class="empty">Clique sur « Nouveau » pour créer ton premier set ou un dossier (un client, une campagne, un shooting…).</div>`}
      ${sets.length ? `<h2 class="section-label" style="margin-top:44px">Récents</h2><div class="grid">${sets.slice(0, 8).map(setCard).join('')}</div>` : ''}`;
    main.querySelector('#new').onclick = e => popMenu(e.currentTarget, [
      { icon: 'frame', label: 'Set', run: () => newSet(null) },
      { icon: 'folder', label: 'Dossier', run: newFolder },
      { icon: 'download', label: 'Importer un fichier de set', run: () => importSet(null) }]);
    main.querySelectorAll('[data-folder]').forEach(b => b.onclick = () => location.hash = 'folder-' + b.dataset.folder);
    main.querySelectorAll('[data-more-folder]').forEach(b => b.onclick = () => {
      const f = folders.find(x => x.id === b.dataset.moreFolder);
      popMenu(b, [
        { icon: 'plus', label: 'Nouveau set ici', run: () => newSet(f.id) },
        { icon: 'edit', label: 'Renommer', run: async () => { const n = await modal({ title: 'Renommer le dossier', input: f.name, ok: 'Renommer' }); if (n) { await store.updateFolder(f.id, { name: n }); reload(); } } },
        { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await modal({ title: 'Supprimer « ' + f.name + ' » ?', text: 'Le dossier et tous ses sets seront supprimés définitivement.', ok: 'Supprimer', danger: true })) { await store.deleteFolder(f.id); reload(); } } }]);
    });
  }

  function drawFolder() {
    const f = folders.find(x => x.id === folderId);
    if (!f) { location.hash = ''; return; }
    const fs = sets.filter(s => s.folderId === folderId);
    main.innerHTML = `
      <div class="crumbs"><button id="up">Projets</button>${icon('chev')}<span>${esc(f.name)}</span></div>
      <div class="home-head"><h1>${esc(f.name)}</h1><button class="btn primary" id="ns2">${icon('plus')}Nouveau</button></div>
      <div class="grid">
        <div class="card new"><button class="frame" id="ns">${icon('plus')}<span>Nouveau set</span></button></div>
        ${fs.map(setCard).join('')}
      </div>`;
    main.querySelector('#up').onclick = () => location.hash = '';
    main.querySelector('#ns').onclick = () => newSet(folderId);
    main.querySelector('#ns2').onclick = e => popMenu(e.currentTarget, [
      { icon: 'frame', label: 'Nouveau set', run: () => newSet(folderId) },
      { icon: 'download', label: 'Importer un fichier de set', run: () => importSet(folderId) }]);
  }

  function bindCards() {
    main.querySelectorAll('[data-open]').forEach(b => b.onclick = () => location.hash = 'set-' + b.dataset.open);
    main.querySelectorAll('[data-more-set]').forEach(b => b.onclick = () => {
      const s = sets.find(x => x.id === b.dataset.moreSet);
      popMenu(b, [
        { icon: 'edit', label: 'Renommer', run: async () => { const n = await modal({ title: 'Renommer le set', input: s.name, ok: 'Renommer' }); if (n) { await store.updateSet(s.id, { name: n }); reload(); } } },
        { icon: 'dup', label: 'Dupliquer', run: async () => { const full = await store.getSet(s.id); const c = await store.createSet(s.folderId, s.name + ' (copie)', typeof full.scene === 'string' ? JSON.parse(full.scene) : full.scene); await store.updateSet(c.id, { thumb: full.thumb || '' }); reload(); } },
        { icon: 'folder', label: 'Déplacer…', run: () => moveSet(s) },
        { icon: 'trash', label: 'Supprimer', danger: true, run: async () => { if (await modal({ title: 'Supprimer « ' + s.name + ' » ?', text: 'Ce set sera supprimé définitivement.', ok: 'Supprimer', danger: true })) { await store.deleteSet(s.id); reload(); } } }]);
    });
  }

  // Fenêtre « nouveau set » : nom + dossier (ou nouveau dossier)
  function setDialog({ title, name, folder, ok }) {
    return new Promise(res => {
      const mr = document.getElementById('modal-root');
      const opts = folders.map(f => `<option value="${f.id}" ${f.id === folder ? 'selected' : ''}>${esc(f.name)}</option>`).join('');
      mr.innerHTML = `<div class="modal-bg"><form class="modal">
        <h3>${esc(title)}</h3>
        ${name !== null ? `<label class="lbl">Nom du set</label><input class="field" name="n" value="${esc(name)}" autocomplete="off">` : ''}
        <label class="lbl">Dossier</label>
        <select class="field" name="f">${opts}<option value="__new" ${folders.length ? '' : 'selected'}>+ Nouveau dossier…</option></select>
        <input class="field ${folders.length ? 'hidden' : ''}" name="nf" placeholder="Nom du nouveau dossier" autocomplete="off" style="margin-top:8px">
        <div class="row"><button type="button" class="btn" data-x>Annuler</button><button class="btn primary">${esc(ok)}</button></div>
      </form></div>`;
      const form = mr.querySelector('form'), sel = form.f, nf = form.nf;
      (form.n || nf).focus(); form.n?.select();
      sel.onchange = () => { nf.classList.toggle('hidden', sel.value !== '__new'); if (sel.value === '__new') nf.focus(); };
      const close = v => { mr.innerHTML = ''; res(v); };
      form.querySelector('[data-x]').onclick = () => close(null);
      mr.querySelector('.modal-bg').onclick = e => { if (e.target.classList.contains('modal-bg')) close(null); };
      form.onsubmit = e => {
        e.preventDefault();
        const isNew = sel.value === '__new';
        if (isNew && !nf.value.trim()) { nf.focus(); return; }
        close({ name: form.n ? (form.n.value.trim() || 'Sans titre') : null, folderId: isNew ? null : sel.value, newFolder: isNew ? nf.value.trim() : null });
      };
    });
  }
  async function newSet(defFolder) {
    const r = await setDialog({ title: 'Nouveau set', name: `Set ${sets.length + 1}`, folder: defFolder || folders[0]?.id, ok: 'Créer' });
    if (!r) return;
    let fid = r.folderId;
    if (r.newFolder) fid = (await store.createFolder(r.newFolder)).id;
    const s = await store.createSet(fid, r.name, defaultScene());
    location.hash = 'set-' + s.id;
  }
  async function moveSet(s) {
    const r = await setDialog({ title: 'Déplacer « ' + s.name + ' »', name: null, folder: s.folderId, ok: 'Déplacer' });
    if (!r) return;
    let fid = r.folderId;
    if (r.newFolder) fid = (await store.createFolder(r.newFolder)).id;
    await store.updateSet(s.id, { folderId: fid }); toast('Set déplacé'); reload();
  }
  // fichier .lightset (exporté depuis l'app ou préparé par Claude) → set prêt en 3D
  function importSet(defFolder) {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.lightset,.json,application/json';
    inp.onchange = async () => {
      const f = inp.files?.[0]; if (!f) return;
      let parsed;
      try { parsed = parseSetFile(await f.text()); } catch { toast('Fichier non reconnu (il faut un fichier .lightset)', 3500); return; }
      const r = await setDialog({ title: 'Importer « ' + parsed.name + ' »', name: parsed.name, folder: defFolder || folders[0]?.id, ok: 'Importer' });
      if (!r) return;
      let fid = r.folderId;
      if (r.newFolder) fid = (await store.createFolder(r.newFolder)).id;
      const s = await store.createSet(fid, r.name, parsed.scene);
      toast('Set importé'); location.hash = 'set-' + s.id;
    };
    inp.click();
  }
  async function newFolder() {
    const n = await modal({ title: 'Nouveau dossier', input: '', ok: 'Créer' });
    if (!n) return;
    await store.createFolder(n); toast('Dossier créé'); reload();
  }

  load();
  return { destroy() { alive = false; } };
}
