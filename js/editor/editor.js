import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { TransformControls } from 'three/addons/TransformControls.js';
import { Studio } from './studio.js';
import { HAIRS, hairFor } from './mannequin.js';
import { LIBRARY, MODS, FLASH_MODS, BACKGROUNDS, SKINS, FOCALS, FORMATS, APERTURES, ISOS, SHUTTERS, WBS, GELS, GOBOS, GOBO_MODS, PRESETS, defaultScene, itemName, makeSetFile } from './defaults.js';
import { buildSheet, sheetInfo } from './sheet.js';
import { parseScene } from '../store.js';
import { icon, esc, toast, modal, popMenu } from '../ui.js';

const clone = o => JSON.parse(JSON.stringify(o));
const fmtF = n => 'f/' + (n >= 10 ? Math.round(n) : (Math.round(n * 10) / 10)).toString().replace('.', ',');
const fmtSh = t => t >= 1 ? t + ' s' : '1/' + Math.round(1 / t);
const fr = (n, d = 1) => n.toFixed(d).replace('.', ',');
const newId = () => Math.random().toString(36).slice(2, 9);
const maxPower = it => it.kind === 'flash' ? (it.small ? 120 : 1200) : (it.mod === 'window' ? 3000 : 1200);

export function openEditor(root, store, setId, opts = {}) {
  const readOnly = !!opts.shareId;
  let alive = true, set = null, data = null, studio, orbit, gizmo, raf = 0, shared = null, myPresets = [];
  let pendingFrame = null;
  let sel = null; // { kind: 'item'|'camera'|'target'|'model', id }
  let saveT = 0, dirty = false, history = [], future = [];
  const isMobile = matchMedia('(max-width:760px)').matches;

  root.innerHTML = `<div class="editor ${readOnly ? 'ro' : ''}">
    <canvas class="stage"></canvas>
    <div class="ed-top float">
      <div class="pill">
        <button class="btn ghost icon sm" id="back" title="Retour">${icon('back')}</button>
        <input class="name" id="name" aria-label="Nom du set" ${readOnly ? 'readonly' : ''}>
        <span class="status hide-m" id="status"></span>
      </div>
      ${readOnly ? '' : `<div class="pill hide-m">
        <button class="btn ghost icon sm" id="undo" title="Annuler (Ctrl+Z)">${icon('undo')}</button>
        <button class="btn ghost icon sm" id="redo" title="Rétablir (Ctrl+Maj+Z)">${icon('redo')}</button>
      </div>`}
      <div class="grow"></div>
      ${opts.onFiche ? `<div class="pill"><button class="btn ghost sm" id="tofiche" title="Vue fiche">${icon('layers')}Fiche</button></div>` : ''}
      <div class="pill"><div class="seg" id="viewseg"><button data-v="3d" class="on">3D</button><button data-v="top">Schéma</button></div></div>
      ${!readOnly && store.canShare ? `<div class="pill"><button class="btn ghost sm" id="share" title="Partager">${icon('share')}<span class="hide-m">Partager</span></button></div>` : ''}
      <div class="pill"><button class="btn ghost sm" id="export" title="Exporter">${icon('download')}<span class="hide-m">Exporter</span></button></div>
    </div>
    ${readOnly ? '' : `<aside class="float lib" id="lib">
      <button class="btn ghost lib-toggle" id="libtog" style="width:100%;justify-content:space-between">Bibliothèque ${icon('chev')}</button>
      <div class="lib-scroll" id="libscroll"></div>
    </aside>`}
    <section class="float render" id="render">
      <div class="render-head" id="rhead"><span class="t">Rendu</span>
        <button class="btn ghost icon sm" id="rgrid" title="Grille des tiers">${icon('gridt')}</button>
        <button class="btn ghost icon sm" id="rab" title="Comparer avant / après">${icon('ab')}</button>
        <button class="btn ghost icon sm hide-m" id="rsize" title="Taille">${icon('max')}</button>
        <button class="btn ghost icon sm" id="rmin" title="Réduire">${icon('min')}</button></div>
      <div class="render-view" id="rview">
        <div class="thirds hidden" id="thirds"><i></i><i></i><i></i><i></i></div>
        <div class="ab hidden" id="abwrap"><img id="abimg" alt=""><div class="ab-bar" id="abbar"><span id="ablA">Avant</span><span>Maintenant</span></div></div>
      </div>
      <div class="hist" id="rhist"><canvas id="histc" aria-label="Histogramme du rendu"></canvas><div class="hist-warn" id="histw"></div></div>
      <div class="render-foot" id="rfoot"></div>
    </section>
    <section class="float insp hidden" id="insp"></section>
    <div class="hint" id="hint">${readOnly ? 'Lecture seule · glisse pour tourner autour du set' : 'Clique un élément pour le sélectionner · glisse-le pour le déplacer'}</div>
  </div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('canvas.stage'), rview = $('#rview'), renderBox = $('#render');

  /* ---------------- chargement ---------------- */
  (async () => {
    try {
      if (readOnly) {
        shared = await store.getShared?.(opts.shareId);
        if (shared) set = { id: null, name: shared.name, scene: shared.scene };
      } else set = await store.getSet(setId);
    } catch (e) { console.error(e); }
    if (!alive) return;
    if (!set) { toast(readOnly ? 'Ce lien de partage n\'existe plus' : 'Set introuvable'); location.hash = ''; return; }
    data = parseScene(set.scene) || defaultScene();
    data.studio ||= { walls: 'dark' };
    $('#name').value = set.name;
    if (readOnly) $('#status').textContent = 'Lecture seule' + (shared?.ownerName ? ` · partagé par ${shared.ownerName}` : '');
    init();
    if (!readOnly) store.listPresets?.().then(p => { myPresets = p || []; if (alive) buildLibrary(); }).catch(() => {});
  })();

  function init() {
    studio = new Studio(canvas, { quality: isMobile ? 'fast' : 'precise' });
    studio.load(data);
    studio.onHistogram = drawHistogram;
    studio.onModelReady = () => { if (pendingFrame) { quickFrame(pendingFrame, true); pendingFrame = null; } renderFoot(); };
    window.__ls = { studio, get data() { return data; }, select: s => select(s) }; // aide au débogage
    if (!readOnly) {
      // ordre important : gizmo et glisser-déposer avant l'orbite, pour qu'ils puissent la bloquer
      gizmo = new TransformControls(studio.view, canvas);
      gizmo.setSize(isMobile ? 1.1 : .8);
      const helper = gizmo.getHelper(); helper.traverse(o => o.layers.set(1)); studio.scene.add(helper);
      gizmo.getRaycaster().layers.enableAll(); // les poignées sont sur le calque des aides
      gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) commit(); });
      gizmo.addEventListener('objectChange', onGizmo);
      bindPicking();
    }
    orbit = new OrbitControls(studio.view, canvas);
    orbit.enableDamping = true; orbit.dampingFactor = .12;
    orbit.target.set(0, 1, -0.3); orbit.maxPolarAngle = Math.PI * 0.495; orbit.minDistance = 1.2; orbit.maxDistance = 18;
    studio.view.position.set(isMobile ? 7.5 : 5.2, isMobile ? 5 : 3.6, isMobile ? 8.5 : 5.8);
    if (!readOnly) buildLibrary();
    bindTop(); bindRender();
    addEventListener('resize', onResize); onResize();
    addEventListener('keydown', onKey);
    snapshot();
    loop();
  }

  function onResize() { studio.resize(innerWidth, innerHeight); layoutRender(); }
  function layoutRender() { rview.style.height = Math.round(rview.clientWidth / studio.shot.aspect) + 'px'; }
  let lastHist = 0;
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    orbit.update();
    let rect = null;
    if (!renderBox.classList.contains('min')) {
      const r = rview.getBoundingClientRect();
      rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    }
    if (rect && performance.now() - lastHist > 350) { studio.wantHist = true; lastHist = performance.now(); }
    studio.render(rect);
    placeInspector();
  }
  function drawHistogram(h) {
    const cv = $('#histc'); if (!cv) return;
    const w = cv.clientWidth, ht = cv.clientHeight, dpr = Math.min(devicePixelRatio, 2);
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(ht * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, ht);
    ctx.strokeStyle = '#ececea'; ctx.lineWidth = 1;
    for (const k of [.25, .5, .75]) { ctx.beginPath(); ctx.moveTo(Math.round(w * k) + .5, 0); ctx.lineTo(Math.round(w * k) + .5, ht); ctx.stroke(); }
    const B = h.lum.length, inner = a => Array.from(a).slice(1, B - 1);
    const max = Math.max(1, ...inner(h.lum), ...inner(h.rc), ...inner(h.gc), ...inner(h.bc));
    const y = v => ht - Math.min(1, Math.sqrt(v / max)) * (ht - 2);
    const path = arr => { ctx.beginPath(); ctx.moveTo(0, ht); for (let i = 0; i < B; i++) ctx.lineTo(i / (B - 1) * w, y(arr[i])); ctx.lineTo(w, ht); ctx.closePath(); };
    ctx.globalCompositeOperation = 'multiply';
    [['rc', 'rgba(230,70,60,.28)'], ['gc', 'rgba(60,170,90,.28)'], ['bc', 'rgba(60,110,230,.28)']].forEach(([k, c]) => { path(h[k]); ctx.fillStyle = c; ctx.fill(); });
    ctx.globalCompositeOperation = 'source-over';
    path(h.lum); ctx.fillStyle = 'rgba(17,17,17,.55)'; ctx.fill();
    const warn = [];
    if (h.hi > 0.005) warn.push(`<span class="hot">Hautes lumières cramées : ${fr(h.hi * 100, h.hi < .1 ? 1 : 0)} %</span>`);
    if (h.lo > 0.02) warn.push(`<span>Noirs bouchés : ${fr(h.lo * 100, h.lo < .1 ? 1 : 0)} %</span>`);
    $('#histw').innerHTML = warn.join('');
    $('#rhist').classList.toggle('clip-hi', h.hi > 0.005);
  }
  // position choisie à la main (glisser l'en-tête), mémorisée ; double-clic sur l'en-tête = placement auto
  let inspPos = (() => { try { return JSON.parse(localStorage.getItem('ls.inspPos')); } catch { return null; } })();
  function bindInspectorDrag() {
    const el = $('#insp'); let drag = null;
    el.addEventListener('pointerdown', e => {
      if (isMobile || !e.target.closest('h4') || e.target.closest('button')) return;
      const r = el.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, id: e.pointerId };
      el.setPointerCapture(e.pointerId); el.classList.add('dragging'); e.preventDefault();
    });
    el.addEventListener('pointermove', e => {
      if (!drag) return;
      inspPos = { x: e.clientX - drag.dx, y: e.clientY - drag.dy };
      placeInspector();
    });
    const end = () => { if (!drag) return; drag = null; el.classList.remove('dragging'); try { localStorage.setItem('ls.inspPos', JSON.stringify(inspPos)); } catch {} };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', e => { if (!e.target.closest('h4') || e.target.closest('button')) return; inspPos = null; try { localStorage.removeItem('ls.inspPos'); } catch {} placeInspector(); });
  }
  function placeInspector() {
    const el = $('#insp'); if (isMobile || el.classList.contains('hidden')) return;
    if (inspPos) {
      const w = el.offsetWidth, left = Math.max(4, Math.min(innerWidth - w - 4, inspPos.x)), top = Math.max(4, Math.min(innerHeight - 80, inspPos.y));
      el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
      el.style.maxHeight = Math.max(160, innerHeight - top - 14) + 'px';
      return;
    }
    const r = renderBox.getBoundingClientRect(), w = el.offsetWidth;
    const libR = $('#lib')?.getBoundingClientRect().right || 0;
    let left = r.left - w - 12, top = r.top;
    if (left < libR + 12) { left = Math.min(innerWidth - w - 14, r.left); top = r.bottom + 12; }
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
    el.style.maxHeight = Math.max(160, innerHeight - top - 14) + 'px';
  }

  /* ---------------- historique & sauvegarde ---------------- */
  function snapshot() { history.push(JSON.stringify(data)); if (history.length > 80) history.shift(); future = []; }
  function commit(o = {}) {
    if (!data || readOnly) return;
    const s = JSON.stringify(data);
    if (history[history.length - 1] !== s) { history.push(s); if (history.length > 80) history.shift(); future = []; }
    scheduleSave();
    if (!o.keepInspector) renderInspector();
    renderFoot();
  }
  function restore(s) {
    data = JSON.parse(s); studio.load(data); layoutRender();
    if (sel?.kind === 'item' && !data.items.find(i => i.id === sel.id)) select(null); else select(sel);
    buildLibrary(); renderFoot(); scheduleSave();
  }
  function undo() { if (history.length < 2) return; future.push(history.pop()); restore(history[history.length - 1]); }
  function redo() { if (!future.length) return; const s = future.pop(); history.push(s); restore(s); }
  function scheduleSave() {
    if (readOnly) return;
    dirty = true; setStatus('Modifications…');
    clearTimeout(saveT); saveT = setTimeout(save, 1200);
  }
  async function save() {
    if (!dirty || !set || readOnly) return; dirty = false; setStatus('Enregistrement…');
    try {
      const thumb = studio.capture(480, 'image/jpeg', .72);
      const name = $('#name').value.trim() || set.name; set.name = name;
      await store.updateSet(set.id, { scene: data, thumb, name });
      // rendu + réglages pour la vue fiche du téléphone et le lien de partage
      const render = { img: studio.capture(1000, 'image/jpeg', .82), info: sheetInfo(studio, data) };
      store.saveRender?.(set.id, render).catch(e => console.warn('[LS] rendu non enregistré', e));
      if (set.shareId) store.publishShare(set.shareId, set, data, thumb, render).catch(e => console.warn('[LS] partage non mis à jour', e));
      setStatus('Enregistré');
    } catch (e) { console.error(e); dirty = true; setStatus('Hors ligne — réessai…'); saveT = setTimeout(save, 5000); }
  }
  function setStatus(t) { if (readOnly) return; const s = $('#status'); if (s) s.textContent = t; }

  /* ---------------- barre du haut ---------------- */
  function bindTop() {
    $('#back').onclick = async () => {
      if (readOnly) { location.hash = ''; return; }
      clearTimeout(saveT); await save(); location.hash = set.folderId ? 'folder-' + set.folderId : '';
    };
    if (!readOnly) {
      $('#name').onchange = () => scheduleSave();
      $('#undo').onclick = undo; $('#redo').onclick = redo;
      $('#libtog').onclick = () => { const l = $('#lib'); l.classList.toggle('collapsed'); if (isMobile && !l.classList.contains('collapsed')) select(null); };
      if (isMobile) $('#lib').classList.add('collapsed');
      if ($('#share')) $('#share').onclick = shareDialog;
    }
    $('#viewseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; setView(b.dataset.v); };
    $('#export').onclick = e => popMenu(e.currentTarget, [
      { icon: 'layers', label: 'Fiche du set (schéma + réglages + rendu)', run: exportSheet },
      { icon: 'frame', label: 'Rendu seul (JPG 2400 px)', run: () => { download(studio.capture(2400, 'image/jpeg', .93), ($('#name').value || 'rendu') + '.jpg'); toast('Rendu exporté'); } },
      { icon: 'download', label: 'Fichier du set (.lightset)', run: () => {
        const name = $('#name').value || set.name, blob = new Blob([makeSetFile(name, data)], { type: 'application/json' });
        download(URL.createObjectURL(blob), name + '.lightset'); toast('Fichier du set exporté');
      } }]);
    if ($('#tofiche')) $('#tofiche').onclick = async () => { clearTimeout(saveT); await save(); opts.onFiche(); };
  }
  function download(url, name) { const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); }
  async function exportSheet() {
    toast('Préparation de la fiche…');
    try {
      const url = await buildSheet({ studio, data, name: $('#name').value || set.name });
      download(url, ($('#name').value || 'set') + ' - fiche.png');
      toast('Fiche exportée');
    } catch (e) { console.error(e); toast('Impossible de générer la fiche'); }
  }
  let viewMode = '3d', saved3d = null;
  function setView(v) {
    if (v === viewMode) return; viewMode = v;
    root.querySelectorAll('#viewseg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'top') {
      saved3d = { p: studio.view.position.clone(), t: orbit.target.clone() };
      orbit.minPolarAngle = 0; orbit.maxPolarAngle = 0.0001;
      orbit.target.set(0, 0, 0.2); studio.view.position.set(0, 9.5, 0.2001);
      if (gizmo) gizmo.showY = false;
    } else {
      orbit.minPolarAngle = 0; orbit.maxPolarAngle = Math.PI * 0.495;
      if (saved3d) { studio.view.position.copy(saved3d.p); orbit.target.copy(saved3d.t); }
      if (gizmo) gizmo.showY = true;
    }
  }

  /* ---------------- partage ---------------- */
  const shareUrl = id => location.origin + location.pathname + '#share-' + id;
  async function shareDialog() {
    const mr = document.getElementById('modal-root');
    const draw = (busy = false) => {
      const on = !!set.shareId;
      mr.innerHTML = `<div class="modal-bg"><div class="modal">
        <h3>Partager ce set</h3>
        <p>${on ? 'Toute personne qui a ce lien peut voir le set en 3D, le rendu et exporter la fiche, sans pouvoir le modifier. Le lien suit tes modifications.' : 'Crée un lien en lecture seule pour un assistant ou un client. Il pourra voir le set, le rendu et la fiche, sans rien modifier.'}</p>
        ${on ? `<div class="share-row"><input class="field" id="surl" readonly value="${esc(shareUrl(set.shareId))}"><button class="btn primary" id="scopy">${icon('copy')}Copier</button></div>` : ''}
        <div class="row">${on ? `<button class="btn" id="soff" style="color:#c62828;margin-right:auto">Désactiver le lien</button>` : ''}
          <button class="btn" data-x>Fermer</button>${on ? '' : `<button class="btn primary" id="son" ${busy ? 'disabled' : ''}>${busy ? 'Création…' : 'Créer le lien'}</button>`}</div>
      </div></div>`;
      mr.querySelector('[data-x]').onclick = () => mr.innerHTML = '';
      mr.querySelector('.modal-bg').onclick = e => { if (e.target.classList.contains('modal-bg')) mr.innerHTML = ''; };
      const on1 = mr.querySelector('#son');
      if (on1) on1.onclick = async () => {
        draw(true);
        try {
          const thumb = studio.capture(480, 'image/jpeg', .72);
          set.shareId = await store.publishShare(null, set, data, thumb, { img: studio.capture(1000, 'image/jpeg', .82), info: sheetInfo(studio, data) });
          await store.updateSet(set.id, { shareId: set.shareId });
        } catch (e) { console.error(e); toast('Impossible de créer le lien. As-tu mis à jour les règles Firestore ?', 5000); set.shareId = null; }
        draw();
      };
      const cp = mr.querySelector('#scopy');
      if (cp) cp.onclick = async () => {
        const inp = mr.querySelector('#surl');
        try { await navigator.clipboard.writeText(inp.value); toast('Lien copié'); } catch { inp.select(); toast('Sélectionné : copie-le avec Cmd+C'); }
      };
      const off = mr.querySelector('#soff');
      if (off) off.onclick = async () => {
        try { await store.unshare(set.shareId); } catch (e) { console.warn(e); }
        set.shareId = null; await store.updateSet(set.id, { shareId: null }); toast('Lien désactivé'); draw();
      };
    };
    draw();
  }

  /* ---------------- fenêtre de rendu ---------------- */
  function bindRender() {
    bindInspectorDrag();
    const head = $('#rhead'); let drag = null;
    head.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) return;
      const r = renderBox.getBoundingClientRect(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener('pointermove', e => {
      if (!drag) return;
      const x = Math.max(4, Math.min(innerWidth - renderBox.offsetWidth - 4, e.clientX - drag.dx));
      const y = Math.max(4, Math.min(innerHeight - 60, e.clientY - drag.dy));
      Object.assign(renderBox.style, { left: x + 'px', top: y + 'px', right: 'auto' });
    });
    head.addEventListener('pointerup', () => drag = null);
    const sizes = [320, 420, 560]; let si = 1;
    $('#rsize').onclick = () => { si = (si + 1) % 3; renderBox.style.width = sizes[si] + 'px'; layoutRender(); };
    $('#rmin').onclick = () => renderBox.classList.toggle('min');
    $('#rgrid').onclick = e => { $('#thirds').classList.toggle('hidden'); e.currentTarget.classList.toggle('on'); };
    // avant / après : fige le rendu actuel, puis compare avec le direct
    $('#rab').onclick = e => {
      const wrap = $('#abwrap'), btn = e.currentTarget;
      if (!wrap.classList.contains('hidden')) { wrap.classList.add('hidden'); btn.classList.remove('on'); return; }
      $('#abimg').src = studio.capture(900, 'image/jpeg', .9); $('#ablA').textContent = 'Avant';
      wrap.style.setProperty('--ab', '50%'); wrap.classList.remove('hidden'); btn.classList.add('on');
      toast('Rendu figé à gauche : modifie ta lumière pour comparer');
    };
    const bar = $('#abbar'); let abDrag = false;
    bar.addEventListener('pointerdown', e => { abDrag = true; bar.setPointerCapture(e.pointerId); });
    bar.addEventListener('pointermove', e => {
      if (!abDrag) return; const r = rview.getBoundingClientRect();
      $('#abwrap').style.setProperty('--ab', Math.max(2, Math.min(98, (e.clientX - r.left) / r.width * 100)) + '%');
    });
    bar.addEventListener('pointerup', () => abDrag = false);
    renderFoot();
  }
  const THIRDS = [1.4, 1.6, 1.8, 2, 2.2, 2.5, 2.8, 3.2, 3.5, 4, 4.5, 5, 5.6, 6.3, 7.1, 8, 9, 10, 11, 13, 14, 16, 18, 20, 22, 25, 29, 32];
  const nearestThird = f => THIRDS.reduce((a, b) => Math.abs(Math.log2(b / f)) < Math.abs(Math.log2(a / f)) ? b : a);
  function renderFoot() {
    if (!studio) return;
    const c = data.camera, m = studio.meter();
    const flashOn = data.items.some(i => i.type === 'light' && i.kind === 'flash');
    let meterHtml = '';
    if (m) {
      const ev = 2 * Math.log2(m / c.f), cl = Math.max(-3, Math.min(3, ev));
      const ok = Math.abs(ev) < 0.34, warn = Math.abs(ev) < 1.01;
      const label = ok ? 'Exposition juste' : `${ev > 0 ? 'Surexposé' : 'Sous-exposé'} de ${fr(Math.abs(ev))} IL${Math.abs(ev) > 3 ? ' (hors échelle)' : ''}`;
      const ticks = Array.from({ length: 19 }, (_, i) => `<i class="${i % 3 === 0 ? 'M' : ''}" style="left:${i / 18 * 100}%"></i>`).join('');
      const nums = [-3, -2, -1, 0, 1, 2, 3].map(v => `<span style="left:${(v + 3) / 6 * 100}%">${v > 0 ? '+' + v : v === 0 ? '0' : '−' + -v}</span>`).join('');
      meterHtml = `<div class="expo ${ok ? 'ok' : warn ? 'warn' : 'bad'}">
        <div class="expo-top"><b>${label}</b>${ok || readOnly ? '' : `<button class="btn sm" id="fixexpo" title="Régler l'ouverture sur la valeur de la cellule">Passer à ${fmtF(nearestThird(m))}</button>`}</div>
        <div class="expo-scale">${ticks}<em style="left:${(cl + 3) / 6 * 100}%"></em></div>
        <div class="expo-nums">${nums}</div></div>`;
    } else meterHtml = '<div class="expo"><div class="expo-top"><b>Aucune lumière dans le set</b></div></div>';
    $('#rfoot').innerHTML = `${meterHtml}<div class="foot-meta"><span><b>${c.focal} mm</b></span><span><b>${fmtF(c.f)}</b></span><span><b>${fmtSh(c.shutter)}</b></span><span>ISO <b>${c.iso}</b></span>
      <span>Sujet à <b>${fr(studio.subjectDistance())} m</b></span>
      ${m ? `<span>Cellule <b>${fmtF(m)}</b></span>` : ''}
      ${flashOn && c.shutter < 1 / 250 - 1e-6 ? '<span style="color:#c62828">Au-delà de la synchro flash</span>' : ''}</div>`;
    const fx = $('#fixexpo');
    if (fx) fx.onclick = () => { c.f = nearestThird(m); studio.applyCamera(); commit({ keepInspector: true }); buildLibrary(); toast(`Ouverture réglée à ${fmtF(c.f)}`); };
  }

  /* ---------------- schémas (presets) ---------------- */
  // ramène l'exposition au visage sur l'ouverture choisie, en gardant les rapports entre lumières
  function balanceExposure() {
    studio.syncItems();
    const m = studio.meter(); if (!m) return;
    const k = (data.camera.f / m) ** 2;
    for (const it of data.items) if (it.type === 'light') {
      const v = Math.max(5, Math.min(maxPower(it), it.power * k));
      it.power = v < 50 ? Math.round(v) : v < 300 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
    }
    studio.syncItems();
  }
  async function applyPreset(p, own) {
    if (data.items.length && !await modal({ title: `Appliquer « ${p.label || p.name} » ?`, text: 'Les lumières et accessoires actuels seront remplacés (tu peux annuler avec Ctrl+Z).', ok: 'Appliquer' })) return;
    if (own) {
      data.items = clone(p.items).map(i => ({ ...i, id: newId() }));
      if (p.background) data.background.color = p.background;
      if (p.walls) data.studio.walls = p.walls;
    } else {
      const b = p.build(data.model.distance);
      data.items = b.items.map(i => ({ ...i, id: newId() }));
      if (b.bg) data.background.color = b.bg;
      if (b.walls) data.studio.walls = b.walls;
    }
    select(null);
    studio.applyBackground(); studio.syncItems();
    if (!own) balanceExposure();
    commit(); buildLibrary(); toast(`Schéma « ${p.label || p.name} » appliqué`);
  }
  async function savePreset() {
    if (!data.items.length) return toast('Ajoute d\'abord des lumières');
    const name = await modal({ title: 'Enregistrer ce schéma', text: 'Les lumières, accessoires et le fond seront réutilisables dans tous tes sets.', input: $('#name').value || 'Mon schéma', ok: 'Enregistrer' });
    if (!name) return;
    try {
      const p = await store.createPreset({ name, items: clone(data.items), background: data.background.color, walls: data.studio.walls });
      myPresets.push(p); buildLibrary(); toast('Schéma enregistré');
    } catch (e) { console.error(e); toast('Impossible d\'enregistrer le schéma'); }
  }

  /* ---------------- schéma depuis une photo ---------------- */
  function photoDialog() {
    const mr = document.getElementById('modal-root');
    mr.innerHTML = `<div class="modal-bg"><div class="modal photo-modal">
      <h3>Recréer la lumière d'une photo</h3>
      <p>Choisis un portrait où le visage est bien visible. L'analyse se fait dans ton navigateur : direction et douceur de la lumière principale, contraste, contre-jour, reflets dans les yeux et fond. C'est un point de départ à ajuster.</p>
      <label class="btn primary" style="width:100%">${icon('frame')}Choisir une photo<input type="file" accept="image/*" id="phfile" hidden></label>
      <div id="phout"></div>
      <div class="row"><button class="btn" data-x>Fermer</button></div>
    </div></div>`;
    const close = () => mr.innerHTML = '';
    mr.querySelector('[data-x]').onclick = close;
    mr.querySelector('.modal-bg').onclick = e => { if (e.target.classList.contains('modal-bg')) close(); };
    mr.querySelector('#phfile').onchange = async e => {
      const f = e.target.files?.[0]; if (!f) return;
      const out = mr.querySelector('#phout');
      out.innerHTML = '<p class="ph-wait">Analyse en cours… (la première fois, le module de détection du visage se charge, ~18 Mo)</p>';
      try {
        const url = URL.createObjectURL(f), img = new Image(); img.src = url; await img.decode();
        const ph = await import('./photo.js');
        const an = await ph.analyzePhoto(img);
        if (!an.ok) { out.innerHTML = '<p class="ph-err">Aucun visage détecté. Essaie un portrait de face ou de 3/4, visage net et pas trop petit.</p>'; return; }
        const sc = ph.analysisToScene(an, data), lines = ph.describeAnalysis(an, sc);
        // aperçu : photo + points du visage + flèche de la lumière principale
        const pv = document.createElement('canvas'), k = Math.min(1, 460 / an.W); pv.width = an.W * k; pv.height = an.H * k;
        const c2 = pv.getContext('2d'); c2.drawImage(an.canvas, 0, 0, pv.width, pv.height);
        c2.fillStyle = 'rgba(47,107,255,.55)'; for (const [x, y] of an.points) { c2.fillRect(x * k - 1, y * k - 1, 2, 2); }
        out.innerHTML = `<div class="ph-prev"></div><ul class="ph-lines">${lines.map(l => `<li>${esc(l)}</li>`).join('')}</ul>
          <p class="ph-note">Fiabilité : ${an.quality < .12 ? 'bonne' : an.quality < .2 ? 'moyenne' : 'faible (photo complexe, à ajuster)'}. La puissance est réglée pour une exposition juste à ${fmtF(data.camera.f)}.</p>
          <button class="btn primary" id="phgo" style="width:100%;margin-top:10px">Créer ce schéma</button>`;
        out.querySelector('.ph-prev').appendChild(pv);
        out.querySelector('#phgo').onclick = async () => {
          if (data.items.length && !await modal({ title: 'Remplacer le schéma actuel ?', text: 'Les lumières actuelles seront remplacées (Ctrl+Z pour annuler).', ok: 'Remplacer' })) return;
          applyPhotoScene(sc, url);
        };
      } catch (err) {
        console.error(err);
        out.innerHTML = '<p class="ph-err">L\'analyse n\'a pas pu se lancer (module de détection non chargé). Vérifie ta connexion et réessaie.</p>';
      }
    };
  }
  function applyPhotoScene(sc, photoUrl) {
    document.getElementById('modal-root').innerHTML = '';
    select(null);
    data.items = sc.items.map(i => { const { role, ratioEV, ...rest } = i; return rest; });
    data.background.color = sc.background; data.studio.walls = sc.walls;
    studio.applyBackground(); studio.syncItems();
    quickFrame(sc.framing, true);
    balanceExposure();
    // débouchage : on respecte le contraste mesuré sur la photo
    const key = sc.items.find(i => i.role === 'key'), fill = sc.items.find(i => i.role === 'fill');
    if (key && fill) {
      const kId = data.items[sc.items.indexOf(key)].id, fIt = data.items[sc.items.indexOf(fill)];
      const mk = studio.meter(kId), mf = studio.meter(fIt.id);
      if (mk && mf) {
        const want = 1 / Math.max(.05, 2 ** fill.ratioEV - 1), have = (mf / mk) ** 2;
        fIt.power = Math.max(5, Math.min(1200, Math.round(fIt.power * want / have)));
        studio.syncItems(); balanceExposure();
      }
    }
    commit(); buildLibrary();
    // la photo devient l'image « Avant » de la comparaison
    const wrap = $('#abwrap'); $('#abimg').src = photoUrl; $('#ablA').textContent = 'Photo'; wrap.style.setProperty('--ab', '50%'); wrap.classList.remove('hidden'); $('#rab').classList.add('on');
    toast('Schéma créé : compare avec ta photo dans la fenêtre de rendu', 4000);
  }

  /* ---------------- bibliothèque (gauche) ---------------- */
  // sections ouvertes / fermées : mémorisées d'une session à l'autre
  const SECS_KEY = 'ls.openSecs';
  const openSecs = new Set((() => { try { const v = JSON.parse(localStorage.getItem(SECS_KEY)); if (Array.isArray(v)) return v; } catch {} return ['Schémas', 'Lumières']; })());
  const saveSecs = () => { try { localStorage.setItem(SECS_KEY, JSON.stringify([...openSecs])); } catch {} };
  let libScroll = null;
  function buildLibrary() {
    const el = $('#libscroll'); if (!el) return;
    if (libScroll === null) { try { libScroll = +sessionStorage.getItem('ls.libScroll') || 0; } catch { libScroll = 0; } }
    else libScroll = el.scrollTop;   // on garde la position de défilement quand le panneau se reconstruit
    const c = data.camera, m = data.model;
    const chips = (name, list, cur, fmt = x => x) => `<div class="chips" data-chips="${name}">${list.map(v => `<button class="chip ${String(v) === String(cur) ? 'on' : ''}" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
    const sec = (title, ic, body) => `<div class="acc ${openSecs.has(title) ? 'open' : ''}" data-sec="${title}"><button>${icon(ic)}${title}${icon('chev', 'i chev')}</button><div class="body">${body}</div></div>`;
    let h = '';
    h += sec('Schémas', 'star', `<div class="presets">${PRESETS.map(p => `<button class="preset" data-preset="${p.key}"><b>${p.label}</b><span>${p.desc}</span></button>`).join('')}</div>
      <div class="ctl"><label>Mes schémas</label>${myPresets.length ? `<div class="mine">${myPresets.map(p => `<div class="mine-row"><button class="chip" data-mine="${p.id}">${esc(p.name)}</button><button class="mine-x" data-mine-del="${p.id}" aria-label="Supprimer">${icon('x')}</button></div>`).join('')}</div>` : '<div class="s" style="font-size:12px;color:var(--ink3)">Aucun pour l\'instant.</div>'}
      <button class="btn sm" id="savepreset" style="margin-top:8px;width:100%">${icon('plus')}Enregistrer le schéma actuel</button>
      <button class="btn sm primary" id="fromphoto" style="margin-top:6px;width:100%">${icon('frame')}Recréer depuis une photo…</button></div>`);
    h += sec('Fond', 'bg', `<div class="swatches">${BACKGROUNDS.map(b => `<button class="sw ${b.c === data.background.color ? 'on' : ''}" style="background:${b.c}" data-bg="${b.c}" title="${b.n}"></button>`).join('')}
        <label class="sw" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" title="Couleur personnalisée"><input type="color" id="bgpick" value="${data.background.color}"></label></div>
      <div class="ctl"><label>Murs du studio</label>${chips('walls', ['dark', 'light'], data.studio.walls, v => v === 'dark' ? 'Sombres' : 'Clairs')}</div>
      <div class="ctl"><label>Fumée / brume <b id="vhaze">${Math.round((data.studio.haze || 0) * 100)} %</b></label><input type="range" min="0" max="1" step="0.01" value="${data.studio.haze || 0}" data-range="haze"></div>`);
    h += sec('Mannequin', 'person', `<div class="ctl" style="margin-top:0"><label>Rendu du personnage</label>${chips('style', ['real', 'mannequin'], m.style === 'real' ? 'real' : 'mannequin', v => v === 'real' ? 'Buste HD' : 'En pied')}
        <div class="s" style="font-size:11.5px;color:var(--ink3);margin-top:6px">${m.style === 'real' ? 'Buste seul, plus léger : idéal pour les portraits serrés.' : 'Même buste avec le corps entier, pour les plans larges.'}</div></div>
      <div class="ctl"><label>Modèle</label>${chips('gender', ['f', 'm'], m.gender, v => v === 'f' ? 'Femme' : 'Homme')}</div>
      <div class="ctl"><label>Carnation</label>${chips('skin', Object.keys(SKINS), m.skin, v => SKINS[v].label)}</div>
      ${(HAIRS[m.gender + '_' + m.skin] || []).length > 1 ? `<div class="ctl"><label>Cheveux</label>${chips('hair', HAIRS[m.gender + '_' + m.skin].map(h => h[0]), hairFor(m.gender, m.skin, m.hair), v => HAIRS[m.gender + '_' + m.skin].find(h => h[0] === v)[1])}</div>` : ''}
      <div class="ctl"><label>Distance au fond <b id="vdist">${fr(m.distance)} m</b></label><input type="range" min="0.5" max="5" step="0.1" value="${m.distance}" data-range="distance"></div>
      <div class="ctl"><label>Orientation <b id="vrot">${m.rot || 0}°</b></label><input type="range" min="-180" max="180" step="5" value="${m.rot || 0}" data-range="rot"></div>`);
    for (const g of LIBRARY) {
      h += sec(g.section, g.section === 'Lumières' ? 'bulb' : g.section === 'Modeleurs' ? 'softbox' : 'reflector',
        `${g.note ? `<div class="s" style="font-size:11.5px;color:var(--ink3);margin:-2px 0 8px">${g.note}</div>` : ''}<div class="items">${g.items.map(it => `<button class="item" data-add="${it.key}"><span class="ico">${icon(it.icon)}</span><span class="n">${esc(it.label)}</span><span class="s">${esc(it.sub)}</span></button>`).join('')}</div>`);
    }
    h += sec('Appareil photo', 'camera', `<div class="ctl" style="margin-top:0"><label>Focale <b id="vfoc">${c.focal} mm</b></label>${chips('focal', FOCALS, c.focal, v => v + ' mm')}
        <input type="range" min="10" max="300" step="1" value="${c.focal}" data-range="focal" aria-label="Focale libre" style="margin-top:8px"></div>
      <div class="ctl"><label>Format</label>${chips('format', Object.keys(FORMATS), c.format)}</div>
      <div class="ctl"><label>Ouverture</label>${chips('f', APERTURES, c.f, v => fmtF(v))}</div>
      <div class="ctl"><label>Profondeur de champ <span style="color:var(--ink3)">· mise au point sur le point bleu</span></label>${chips('dof', ['on', 'off'], c.dof === false ? 'off' : 'on', v => v === 'on' ? 'Simulée' : 'Tout net')}</div>
      <div class="ctl"><label>Vitesse</label>${chips('shutter', SHUTTERS.map(s => s[1]), c.shutter, v => fmtSh(+v))}</div>
      <div class="ctl"><label>ISO</label>${chips('iso', ISOS, c.iso)}</div>
      <div class="ctl"><label>Balance des blancs</label>${chips('wb', WBS, c.wb, v => v + ' K')}</div>
      <div class="ctl"><label>Hauteur de l'appareil <b id="vch">${fr(c.y, 2)} m</b></label><input type="range" min="0.3" max="2.6" step="0.05" value="${c.y}" data-range="camy"></div>
      <div class="ctl"><label>Cadrage rapide</label><div class="chips">
        <button class="chip" data-frame="face">Visage</button><button class="chip" data-frame="bust">Buste</button><button class="chip" data-frame="half">Mi-corps</button><button class="chip" data-frame="full">Pied</button></div></div>`);
    el.innerHTML = h;
    el.scrollTop = libScroll;
    if (!el.dataset.scrollBound) { el.dataset.scrollBound = 1; el.addEventListener('scroll', () => { try { sessionStorage.setItem('ls.libScroll', el.scrollTop); } catch {} }, { passive: true }); }

    el.querySelectorAll('.acc>button').forEach(b => b.onclick = () => {
      const a = b.parentElement, t = a.dataset.sec; a.classList.toggle('open');
      a.classList.contains('open') ? openSecs.add(t) : openSecs.delete(t);
      saveSecs();
    });
    el.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => applyPreset(PRESETS.find(p => p.key === b.dataset.preset)));
    el.querySelectorAll('[data-mine]').forEach(b => b.onclick = () => applyPreset(myPresets.find(p => p.id === b.dataset.mine), true));
    el.querySelectorAll('[data-mine-del]').forEach(b => b.onclick = async () => {
      const p = myPresets.find(x => x.id === b.dataset.mineDel);
      if (!await modal({ title: `Supprimer « ${p.name} » ?`, ok: 'Supprimer', danger: true })) return;
      await store.deletePreset(p.id); myPresets = myPresets.filter(x => x.id !== p.id); buildLibrary();
    });
    el.querySelector('#savepreset').onclick = savePreset;
    el.querySelector('#fromphoto').onclick = photoDialog;
    el.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { data.background.color = b.dataset.bg; studio.applyBackground(); commit(); buildLibrary(); });
    el.querySelector('#bgpick').oninput = e => { data.background.color = e.target.value; studio.applyBackground(); };
    el.querySelector('#bgpick').onchange = () => { commit(); buildLibrary(); };
    el.querySelectorAll('[data-chips]').forEach(box => box.onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      const k = box.dataset.chips, v = b.dataset.v;
      if (k === 'walls') { data.studio.walls = v; studio.applyBackground(); }
      else if (k === 'gender' || k === 'skin' || k === 'style' || k === 'hair') { data.model[k] = v; studio.applyModel(); if (k === 'style' && v === 'real') { pendingFrame = 'bust'; quickFrame('bust', true); } }
      else if (k === 'dof') { c.dof = v === 'on'; }
      else { c[k] = k === 'format' ? v : +v; studio.applyCamera(); if (k === 'format') layoutRender(); }
      commit(); buildLibrary();
    });
    el.querySelectorAll('[data-range]').forEach(r => {
      r.oninput = () => {
        const k = r.dataset.range, v = +r.value;
        if (k === 'distance') { m.distance = v; studio.applyModel(); $('#vdist').textContent = fr(v) + ' m'; }
        if (k === 'rot') { m.rot = v; studio.applyModel(); $('#vrot').textContent = v + '°'; }
        if (k === 'camy') { c.y = v; studio.applyCamera(); $('#vch').textContent = fr(v, 2) + ' m'; }
        if (k === 'haze') { data.studio.haze = v; studio.recompute(); $('#vhaze').textContent = Math.round(v * 100) + ' %'; }
        if (k === 'focal') { c.focal = v; studio.applyCamera(); $('#vfoc').textContent = v + ' mm'; root.querySelectorAll('[data-chips=focal] .chip').forEach(ch => ch.classList.toggle('on', +ch.dataset.v === v)); }
        renderFoot();
      };
      r.onchange = () => { commit({ keepInspector: true }); if (r.dataset.range === 'focal') buildLibrary(); };
    });
    el.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => quickFrame(b.dataset.frame));
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addItem(b.dataset.add));
  }

  function quickFrame(kind, silent) {
    const c = data.camera, u = studio.model.userData;
    const real = data.model.style === 'real';
    const H = { face: .42, bust: real ? .6 : .75, half: 1.15, full: 2.05 }[kind];
    const ty = { face: u.headY - .01, bust: u.headY - (real ? .16 : .2), half: u.headY - .45, full: u.height / 2 + .02 }[kind];
    const [, fh] = FORMATS[c.format];
    const dist = c.focal * H / fh;
    const dir = new THREE.Vector3(c.x - c.tx, 0, c.z - c.tz); if (dir.lengthSq() < .01) dir.set(0, 0, 1); dir.normalize();
    c.tx = 0; c.tz = 0.05; c.ty = ty;
    c.x = dir.x * dist; c.z = dir.z * dist; c.y = kind === 'full' ? 1.1 : ty + .05;
    if (dist > 9) toast('Recule beaucoup : passe à une focale plus courte');
    studio.applyCamera(); if (!silent) { commit(); buildLibrary(); }
  }

  /* ---------------- ajout d'éléments ---------------- */
  function addItem(key) {
    const def = LIBRARY.flatMap(g => g.items).find(i => i.key === key); if (!def) return;
    const it = { id: newId(), ...clone(def.make) };
    const used = data.items.map(i => Math.atan2(i.x, i.z));
    const cands = it.type === 'refl' ? [50, -50, 75, -75, 100, -100] : [-45, 45, -120, 120, -90, 90, 20, -20];
    let best = cands[0], bestScore = -1;
    for (const a of cands) { const r = a * Math.PI / 180; const sc = Math.min(9, ...used.map(u => Math.abs(Math.atan2(Math.sin(u - r), Math.cos(u - r))))); if (sc > bestScore + .3) { best = a; bestScore = sc; } }
    const ang = best * Math.PI / 180, dist = it.type === 'refl' ? 1.1 : it.mod === 'window' ? 2.2 : Math.abs(best) > 100 ? 1.3 : (it.mod === 'octa' || it.mod?.startsWith('umb') ? 1.8 : 1.6);
    it.x = +(Math.sin(ang) * dist).toFixed(2); it.z = +(Math.cos(ang) * dist).toFixed(2);
    it.y = it.type === 'refl' ? (it.finish === 'flag' ? 1.7 : 1.0) : it.mod === 'window' ? 1.6 : (Math.abs(best) > 120 ? 2.0 : 1.95);
    if (it.type === 'light') it.kelvin = it.kelvin || 5600;
    it.aim = 'face';
    data.items.push(it);
    studio.syncItems(); select({ kind: 'item', id: it.id }); commit();
    if (isMobile) $('#lib').classList.add('collapsed');
  }

  /* ---------------- sélection & gizmo ---------------- */
  const proxy = new THREE.Object3D();
  function select(s) {
    if (readOnly) return;
    sel = s; gizmo?.detach();
    if (s && studio) {
      let p = null;
      if (s.kind === 'item') { const it = data.items.find(i => i.id === s.id); if (it) p = [it.x, it.finish?.startsWith('v') ? 1 : it.y, it.z]; }
      if (s.kind === 'camera') p = [data.camera.x, data.camera.y, data.camera.z];
      if (s.kind === 'target') p = [data.camera.tx, data.camera.ty, data.camera.tz];
      if (p) {
        proxy.position.set(...p); studio.scene.add(proxy); gizmo.attach(proxy);
        const vflat = s.kind === 'item' && data.items.find(i => i.id === s.id)?.finish?.startsWith('v');
        gizmo.showY = viewMode !== 'top' && !vflat;
      }
      if (isMobile && s.kind === 'model') { openSecs.add('Mannequin'); buildLibrary(); $('#lib').classList.remove('collapsed'); }
      if (isMobile && s.kind !== 'model') $('#lib').classList.add('collapsed');
    }
    $('#hint')?.classList.toggle('hidden', !!s);
    renderInspector();
  }
  function onGizmo() {
    const p = proxy.position;
    p.y = Math.max(0.25, Math.min(4.2, p.y));
    const lim = 8; p.x = Math.max(-lim, Math.min(lim, p.x)); p.z = Math.max(-data.model.distance + .2, Math.min(lim, p.z));
    if (sel.kind === 'item') {
      const it = data.items.find(i => i.id === sel.id); it.x = +p.x.toFixed(3); it.z = +p.z.toFixed(3);
      if (!it.finish?.startsWith('v')) it.y = +p.y.toFixed(3);
      studio.syncItems();
    } else if (sel.kind === 'camera') { Object.assign(data.camera, { x: p.x, y: p.y, z: p.z }); studio.applyCamera(); }
    else if (sel.kind === 'target') { Object.assign(data.camera, { tx: p.x, ty: p.y, tz: p.z }); studio.applyCamera(); }
    renderFoot();
    if (sel.kind === 'item') updateInspectorMeter();
  }
  function bindPicking() {
    const ray = new THREE.Raycaster(); ray.layers.enableAll();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitP = new THREE.Vector3(), off = new THREE.Vector3();
    let down = null, drag = null;
    const pick = e => {
      const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, studio.view);
      const hit = ray.intersectObjects(studio.pickables(), true).find(h => h.object.userData.pick && h.object.visible);
      return hit?.object.userData.pick || null;
    };
    const toSel = pk => pk.kind === 'item' ? { kind: 'item', id: pk.id } : { kind: pk.kind };
    canvas.addEventListener('pointerdown', e => {
      down = { x: e.clientX, y: e.clientY }; drag = null;
      if (gizmo.axis || !studio || e.pointerType === 'touch' && !e.isPrimary) return;
      const pk = pick(e);
      if (pk && pk.kind !== 'model') {
        const s = toSel(pk);
        if (!sel || sel.kind !== s.kind || sel.id !== s.id) select(s);
        plane.constant = -proxy.position.y;
        if (ray.ray.intersectPlane(plane, hitP)) {
          off.copy(proxy.position).sub(hitP);
          drag = { moved: false }; orbit.enabled = false;
          canvas.setPointerCapture(e.pointerId);
        }
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (!drag) return;
      if (!drag.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 4) return;
      drag.moved = true;
      const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, studio.view);
      if (ray.ray.intersectPlane(plane, hitP)) { proxy.position.x = hitP.x + off.x; proxy.position.z = hitP.z + off.z; onGizmo(); }
    });
    canvas.addEventListener('pointerup', e => {
      if (drag) { orbit.enabled = true; if (drag.moved) commit(); drag = null; down = null; return; }
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || gizmo.dragging) { down = null; return; }
      down = null;
      if (gizmo.axis) return;
      const pk = pick(e);
      if (!pk) return select(null);
      select(toSel(pk));
    });
  }

  /* ---------------- inspecteur ---------------- */
  function renderInspector() {
    const el = $('#insp');
    if (!sel || !data) { el.classList.add('hidden'); return; }
    const close = `<button class="btn ghost icon sm insp-x" id="ix" title="Fermer">${icon('x')}</button>`;
    if (sel.kind === 'camera' || sel.kind === 'target') {
      el.classList.remove('hidden');
      el.innerHTML = `<h4>${icon('camera')}${sel.kind === 'camera' ? 'Appareil photo' : 'Point visé (mise au point)'}${close}</h4>
        <p style="color:var(--ink2);font-size:12.5px;margin:10px 0 0">${sel.kind === 'camera' ? 'Glisse l\'appareil ou utilise les flèches. Le point bleu indique où il vise et où se fait la mise au point.' : 'Déplace le point bleu pour changer ce que vise l\'appareil et la zone nette.'} Focale, ouverture et cadrage rapide sont dans « Appareil photo » à gauche.</p>
        <div class="row"><button class="btn sm" id="tgt">${sel.kind === 'camera' ? 'Régler le point visé' : 'Régler l\'appareil'}</button></div>`;
      el.querySelector('#tgt').onclick = () => select({ kind: sel.kind === 'camera' ? 'target' : 'camera' });
      el.querySelector('#ix').onclick = () => select(null);
      return;
    }
    if (sel.kind !== 'item') { el.classList.add('hidden'); return; }
    const it = data.items.find(i => i.id === sel.id); if (!it) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const vflat = it.finish?.startsWith('v');
    const aimChips = `<div class="ctl"><label>Viser</label><div class="chips" id="aim">${[['face', 'Visage'], ['chest', 'Buste'], ['bg', 'Fond']].map(([v, l]) => `<button class="chip ${it.aim === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
    const orient = `<div class="ctl"><label>Rotation ${it.yaw || it.pitch ? '<button class="linkbtn" id="ores">réinitialiser</button>' : ''}<b id="vyaw">${it.yaw || 0}°</b></label><input type="range" id="yaw" min="-90" max="90" step="1" value="${it.yaw || 0}"></div>
      ${vflat ? '' : `<div class="ctl"><label>Inclinaison <b id="vpitch">${it.pitch || 0}°</b></label><input type="range" id="pitch" min="-60" max="60" step="1" value="${it.pitch || 0}"></div>`}`;
    const heightCtl = vflat ? '' : `<div class="ctl"><label>Hauteur <b id="vh">${fr(it.y, 2)} m</b></label><input type="range" id="hy" min="0.25" max="4" step="0.05" value="${it.y}"></div>`;
    let body = '';
    if (it.type === 'light') {
      const flash = it.kind === 'flash', max = maxPower(it);
      body = `
        ${flash && !it.small ? `<div class="ctl"><label>Modeleur</label><select class="field" id="mod">${FLASH_MODS.map(k => `<option value="${k}" ${k === it.mod ? 'selected' : ''}>${MODS[k].label}</option>`).join('')}</select></div>` : ''}
        <div class="ctl"><label>Puissance <b id="vp">${it.power} ${flash ? 'Ws' : 'W'}</b></label><input type="range" id="pw" min="0" max="1" step="0.001" value="${Math.log(it.power / 5) / Math.log(max / 5)}"></div>
        ${it.mod === 'fresnel' ? `<div class="ctl"><label>Faisceau <b id="vz">${it.zoom}°</b></label><input type="range" id="zm" min="12" max="55" step="1" value="${it.zoom}"></div>` : ''}
        <div class="ctl"><label>Température <b id="vk">${it.kelvin} K</b></label><input type="range" id="kv" min="2700" max="6500" step="100" value="${it.kelvin}"></div>
        <div class="row2">
          <div class="ctl"><label>Gélatine</label><select class="field" id="gel">${Object.entries(GELS).map(([k, g]) => `<option value="${k}" ${k === (it.gel || 'none') ? 'selected' : ''}>${g.label}</option>`).join('')}</select></div>
          ${GOBO_MODS.includes(it.mod) ? `<div class="ctl"><label>Gobo</label><select class="field" id="gobo">${Object.entries(GOBOS).map(([k, l]) => `<option value="${k}" ${k === (it.gobo || '') ? 'selected' : ''}>${l}</option>`).join('')}</select></div>` : ''}
        </div>
        ${heightCtl}${aimChips}${orient}
        <div class="ctl"><label>Cellule (cette lumière seule) <b id="vm"></b></label></div>`;
    } else body = `${heightCtl}${aimChips}${orient}`;
    const name = it.type === 'light' && !it.small && it.kind === 'flash' ? MODS[it.mod].label : itemName(it);
    el.innerHTML = `<h4>${icon(it.type === 'light' ? (it.kind === 'flash' ? 'flash' : it.mod === 'window' ? 'window' : 'bulb') : 'reflector')}${esc(name)}<span class="k">${it.type === 'light' ? (it.kind === 'flash' ? 'Flash' : 'Continu') : ''}</span>${close}</h4>
      ${it.type === 'light' ? `<button class="power-tog ${it.off ? 'off' : ''}" id="ptog" role="switch" aria-checked="${!it.off}"><span class="dot"></span>${it.off ? 'Éteinte' : 'Allumée'}</button>` : ''}
      ${body}
      <div class="row"><button class="btn sm" id="dup">${icon('dup')}Dupliquer</button><button class="btn sm" id="del" style="color:#c62828">${icon('trash')}Supprimer</button></div>`;
    const q = s => el.querySelector(s);
    q('#ix').onclick = () => select(null);
    if (q('#ptog')) q('#ptog').onclick = () => { if (it.off) delete it.off; else it.off = true; studio.recompute(); commit(); };
    if (q('#mod')) q('#mod').onchange = e => { it.mod = e.target.value; if (!GOBO_MODS.includes(it.mod)) delete it.gobo; studio.syncItems(); commit(); };
    if (q('#gel')) q('#gel').onchange = e => { it.gel = e.target.value === 'none' ? undefined : e.target.value; studio.recompute(); commit({ keepInspector: true }); updateInspectorMeter(); };
    if (q('#gobo')) q('#gobo').onchange = e => { it.gobo = e.target.value || undefined; studio.syncItems(); commit({ keepInspector: true }); };
    if (q('#pw')) {
      const flash = it.kind === 'flash', max = maxPower(it);
      q('#pw').oninput = e => {
        const v = 5 * Math.pow(max / 5, +e.target.value);
        it.power = v < 50 ? Math.round(v) : v < 300 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
        q('#vp').textContent = it.power + (flash ? ' Ws' : ' W'); studio.recompute(); updateInspectorMeter(); renderFoot();
      };
      q('#pw').onchange = () => commit({ keepInspector: true });
    }
    if (q('#zm')) { q('#zm').oninput = e => { it.zoom = +e.target.value; q('#vz').textContent = it.zoom + '°'; studio.recompute(); updateInspectorMeter(); renderFoot(); }; q('#zm').onchange = () => { studio.syncItems(); commit({ keepInspector: true }); }; }
    if (q('#kv')) { q('#kv').oninput = e => { it.kelvin = +e.target.value; q('#vk').textContent = it.kelvin + ' K'; studio.recompute(); }; q('#kv').onchange = () => commit({ keepInspector: true }); }
    if (q('#hy')) { q('#hy').oninput = e => { it.y = +e.target.value; q('#vh').textContent = fr(it.y, 2) + ' m'; studio.syncItems(); proxy.position.y = it.y; updateInspectorMeter(); renderFoot(); }; q('#hy').onchange = () => commit({ keepInspector: true }); }
    for (const k of ['yaw', 'pitch']) {
      const r = q('#' + k); if (!r) continue;
      r.oninput = () => { it[k] = +r.value; q('#v' + k).textContent = it[k] + '°'; studio.syncItems(); updateInspectorMeter(); renderFoot(); };
      r.onchange = () => commit();
    }
    if (q('#ores')) q('#ores').onclick = () => { it.yaw = 0; it.pitch = 0; studio.syncItems(); commit(); };
    q('#aim').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; it.aim = b.dataset.v; studio.syncItems(); commit(); };
    q('#dup').onclick = () => { const c = { ...clone(it), id: newId(), x: +(it.x + .4).toFixed(2) }; data.items.push(c); studio.syncItems(); select({ kind: 'item', id: c.id }); commit(); };
    q('#del').onclick = () => { data.items = data.items.filter(i => i.id !== it.id); studio.syncItems(); select(null); commit(); };
    updateInspectorMeter();
  }
  function updateInspectorMeter() {
    const el = $('#insp #vm'); if (!el || !sel) return;
    const m = studio.meter(sel.id); el.textContent = m ? fmtF(m) : 'hors faisceau';
  }

  function onKey(e) {
    if (readOnly || e.target.matches('input,select,textarea')) return;
    const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
    if (z) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'item') { data.items = data.items.filter(i => i.id !== sel.id); studio.syncItems(); select(null); commit(); }
    if (e.key === 'Escape') select(null);
    if (e.key.toLowerCase() === 'l' && sel?.kind === 'item') { const it = data.items.find(i => i.id === sel.id); if (it?.type === 'light') { if (it.off) delete it.off; else it.off = true; studio.recompute(); commit(); } }
  }

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf); clearTimeout(saveT);
      if (dirty && set && studio) save();
      removeEventListener('resize', onResize); removeEventListener('keydown', onKey);
      gizmo?.dispose(); orbit?.dispose();
      setTimeout(() => studio?.dispose(), 50);
    },
  };
}
