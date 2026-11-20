import * as THREE from 'three';
import { OrbitControls } from 'three/addons/OrbitControls.js';
import { TransformControls } from 'three/addons/TransformControls.js';
import { Studio } from './studio.js';
import { LIBRARY, MODS, FLASH_MODS, BACKGROUNDS, SKINS, FOCALS, FORMATS, APERTURES, ISOS, SHUTTERS, WBS, defaultScene } from './defaults.js';
import { parseScene } from '../store.js';
import { icon, esc, toast, modal } from '../ui.js';

const clone = o => JSON.parse(JSON.stringify(o));
const fmtF = n => 'f/' + (n >= 10 ? Math.round(n) : (Math.round(n * 10) / 10)).toString().replace('.', ',');
const fmtSh = t => t >= 1 ? t + ' s' : '1/' + Math.round(1 / t);

export function openEditor(root, store, setId) {
  let alive = true, set = null, data = null, studio, orbit, gizmo, raf = 0;
  let sel = null; // { kind: 'item'|'camera'|'target'|'model', id }
  let saveT = 0, dirty = false, history = [], future = [];
  const isMobile = matchMedia('(max-width:760px)').matches;

  root.innerHTML = `<div class="editor">
    <canvas class="stage"></canvas>
    <div class="ed-top float">
      <div class="pill">
        <button class="btn ghost icon sm" id="back" title="Retour">${icon('back')}</button>
        <input class="name" id="name" aria-label="Nom du set">
        <span class="status hide-m" id="status"></span>
      </div>
      <div class="pill hide-m">
        <button class="btn ghost icon sm" id="undo" title="Annuler (Ctrl+Z)">${icon('undo')}</button>
        <button class="btn ghost icon sm" id="redo" title="Rétablir (Ctrl+Maj+Z)">${icon('redo')}</button>
      </div>
      <div class="grow"></div>
      <div class="pill"><div class="seg" id="viewseg"><button data-v="3d" class="on">3D</button><button data-v="top">Schéma</button></div></div>
      <div class="pill hide-m"><button class="btn ghost sm" id="export">${icon('download')}Exporter</button></div>
    </div>
    <aside class="float lib" id="lib">
      <button class="btn ghost lib-toggle" id="libtog" style="width:100%;justify-content:space-between">Bibliothèque ${icon('chev')}</button>
      <div class="lib-scroll" id="libscroll"></div>
    </aside>
    <section class="float render" id="render">
      <div class="render-head" id="rhead"><span class="t">Rendu</span>
        <button class="btn ghost icon sm hide-m" id="rsize" title="Taille">${icon('max')}</button>
        <button class="btn ghost icon sm" id="rmin" title="Réduire">${icon('min')}</button></div>
      <div class="render-view" id="rview"></div>
      <div class="render-foot" id="rfoot"></div>
    </section>
    <section class="float insp hidden" id="insp"></section>
    <div class="hint" id="hint">Clique un élément pour le sélectionner · glisse pour tourner autour du set</div>
  </div>`;
  const $ = s => root.querySelector(s);
  const canvas = $('canvas.stage'), rview = $('#rview'), renderBox = $('#render');

  /* ---------------- chargement ---------------- */
  (async () => {
    try { set = await store.getSet(setId); } catch (e) { console.error(e); }
    if (!alive) return;
    if (!set) { toast('Set introuvable'); location.hash = ''; return; }
    data = parseScene(set.scene) || defaultScene();
    $('#name').value = set.name;
    init();
  })();

  function init() {
    studio = new Studio(canvas);
    studio.load(data);
    window.__ls = { studio, get data() { return data; } }; // aide au débogage
    orbit = new OrbitControls(studio.view, canvas);
    orbit.enableDamping = true; orbit.dampingFactor = .12;
    orbit.target.set(0, 1, -0.3); orbit.maxPolarAngle = Math.PI * 0.495; orbit.minDistance = 1.2; orbit.maxDistance = 18;
    studio.view.position.set(isMobile ? 7.5 : 5.2, isMobile ? 5 : 3.6, isMobile ? 8.5 : 5.8);
    gizmo = new TransformControls(studio.view, canvas);
    gizmo.setSize(isMobile ? 1.1 : .8);
    const helper = gizmo.getHelper(); helper.traverse(o => o.layers.set(1)); studio.scene.add(helper);
    gizmo.addEventListener('dragging-changed', e => { orbit.enabled = !e.value; if (!e.value) commit(); });
    gizmo.addEventListener('objectChange', onGizmo);
    buildLibrary(); bindTop(); bindRender(); bindPicking();
    addEventListener('resize', onResize); onResize();
    addEventListener('keydown', onKey);
    snapshot();
    loop();
  }

  function onResize() {
    const w = innerWidth, h = innerHeight;
    studio.resize(w, h); layoutRender();
  }
  function layoutRender() {
    const a = studio.shot.aspect, w = rview.clientWidth;
    rview.style.height = Math.round(w / a) + 'px';
  }
  function loop() {
    if (!alive) return;
    raf = requestAnimationFrame(loop);
    orbit.update();
    let rect = null;
    if (!renderBox.classList.contains('min')) {
      const r = rview.getBoundingClientRect();
      rect = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
    }
    studio.render(rect);
    placeInspector();
  }
  function placeInspector() {
    const el = $('#insp'); if (isMobile || el.classList.contains('hidden')) return;
    const r = renderBox.getBoundingClientRect(), w = el.offsetWidth;
    const libR = $('#lib').getBoundingClientRect().right;
    let left = r.left - w - 12, top = r.top;
    if (left < libR + 12) { left = Math.min(innerWidth - w - 14, r.left); top = r.bottom + 12; }
    el.style.left = Math.round(left) + 'px'; el.style.top = Math.round(top) + 'px';
    el.style.maxHeight = Math.max(160, innerHeight - top - 14) + 'px';
  }

  /* ---------------- historique & sauvegarde ---------------- */
  function snapshot() { history.push(JSON.stringify(data)); if (history.length > 80) history.shift(); future = []; }
  function commit(opts = {}) {
    if (!data) return;
    const s = JSON.stringify(data);
    if (history[history.length - 1] !== s) { history.push(s); if (history.length > 80) history.shift(); future = []; }
    scheduleSave();
    if (!opts.keepInspector) renderInspector();
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
    dirty = true; setStatus('Modifications…');
    clearTimeout(saveT); saveT = setTimeout(save, 1200);
  }
  async function save() {
    if (!dirty || !set) return; dirty = false; setStatus('Enregistrement…');
    try {
      const thumb = studio.capture(480, 'image/jpeg', .72);
      await store.updateSet(set.id, { scene: data, thumb, name: $('#name').value.trim() || set.name });
      setStatus('Enregistré');
    } catch (e) { console.error(e); dirty = true; setStatus('Hors ligne — réessai…'); saveT = setTimeout(save, 5000); }
  }
  function setStatus(t) { const s = $('#status'); if (s) s.textContent = t; }

  /* ---------------- barre du haut ---------------- */
  function bindTop() {
    $('#back').onclick = async () => { clearTimeout(saveT); await save(); location.hash = set.folderId ? 'folder-' + set.folderId : ''; };
    $('#name').onchange = () => scheduleSave();
    $('#undo').onclick = undo; $('#redo').onclick = redo;
    $('#viewseg').onclick = e => { const b = e.target.closest('button'); if (!b) return; setView(b.dataset.v); };
    $('#export').onclick = () => {
      const url = studio.capture(2400, 'image/jpeg', .93);
      const a = document.createElement('a'); a.href = url; a.download = ($('#name').value || 'rendu') + '.jpg'; a.click();
      toast('Rendu exporté (2400 px)');
    };
    $('#libtog').onclick = () => $('#lib').classList.toggle('collapsed');
    if (isMobile) $('#lib').classList.add('collapsed');
  }
  let viewMode = '3d', saved3d = null;
  function setView(v) {
    if (v === viewMode) return; viewMode = v;
    root.querySelectorAll('#viewseg button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    if (v === 'top') {
      saved3d = { p: studio.view.position.clone(), t: orbit.target.clone() };
      orbit.minPolarAngle = 0; orbit.maxPolarAngle = 0.0001;
      orbit.target.set(0, 0, 0.2); studio.view.position.set(0, 9.5, 0.2001);
      gizmo.showY = false;
    } else {
      orbit.minPolarAngle = 0; orbit.maxPolarAngle = Math.PI * 0.495;
      if (saved3d) { studio.view.position.copy(saved3d.p); orbit.target.copy(saved3d.t); }
      gizmo.showY = true;
    }
  }

  /* ---------------- fenêtre de rendu ---------------- */
  function bindRender() {
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
    $('#rmin').onclick = () => { renderBox.classList.toggle('min'); };
    renderFoot();
  }
  function renderFoot() {
    if (!studio) return;
    const c = data.camera, m = studio.meter();
    let expo = '';
    if (m) {
      const ev = 2 * Math.log2(m / c.f);
      expo = Math.abs(ev) < 0.34 ? 'juste' : (ev > 0 ? '+' : '') + ev.toFixed(1).replace('.', ',') + ' IL';
    }
    const flashOn = data.items.some(i => i.type === 'light' && i.kind === 'flash');
    $('#rfoot').innerHTML = `<span><b>${c.focal} mm</b></span><span><b>${fmtF(c.f)}</b></span><span><b>${fmtSh(c.shutter)}</b></span><span>ISO <b>${c.iso}</b></span>
      <span>Sujet à <b>${studio.subjectDistance().toFixed(1).replace('.', ',')} m</b></span>
      ${m ? `<span>Cellule <b>${fmtF(m)}</b> (${expo})</span>` : '<span>Aucune lumière</span>'}
      ${flashOn && c.shutter < 1 / 250 - 1e-6 ? '<span style="color:#c62828">Au-delà de la synchro flash</span>' : ''}`;
  }

  /* ---------------- bibliothèque (gauche) ---------------- */
  const openSecs = new Set(['Lumières', 'Modeleurs']);
  function buildLibrary() {
    const el = $('#libscroll'), c = data.camera, m = data.model;
    const chips = (name, list, cur, fmt = x => x) => `<div class="chips" data-chips="${name}">${list.map(v => `<button class="chip ${String(v) === String(cur) ? 'on' : ''}" data-v="${v}">${fmt(v)}</button>`).join('')}</div>`;
    const sec = (title, ic, body) => `<div class="acc ${openSecs.has(title) ? 'open' : ''}" data-sec="${title}"><button>${icon(ic)}${title}${icon('chev', 'i chev')}</button><div class="body">${body}</div></div>`;
    let h = '';
    h += sec('Fond', 'bg', `<div class="swatches">${BACKGROUNDS.map(b => `<button class="sw ${b.c === data.background.color ? 'on' : ''}" style="background:${b.c}" data-bg="${b.c}" title="${b.n}"></button>`).join('')}
        <label class="sw" style="background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red)" title="Couleur personnalisée"><input type="color" id="bgpick" value="${data.background.color}"></label></div>
      <div class="ctl"><label>Murs du studio</label>${chips('walls', ['dark', 'light'], data.studio.walls, v => v === 'dark' ? 'Sombres' : 'Clairs')}</div>`);
    h += sec('Mannequin', 'person', `<div class="ctl" style="margin-top:0"><label>Modèle</label>${chips('gender', ['f', 'm'], m.gender, v => v === 'f' ? 'Femme' : 'Homme')}</div>
      <div class="ctl"><label>Carnation</label>${chips('skin', Object.keys(SKINS), m.skin, v => SKINS[v].label)}</div>
      <div class="ctl"><label>Distance au fond <b id="vdist">${m.distance.toFixed(1).replace('.', ',')} m</b></label><input type="range" min="0.5" max="5" step="0.1" value="${m.distance}" data-range="distance"></div>
      <div class="ctl"><label>Orientation <b id="vrot">${m.rot || 0}°</b></label><input type="range" min="-180" max="180" step="5" value="${m.rot || 0}" data-range="rot"></div>`);
    for (const g of LIBRARY) {
      h += sec(g.section, g.section === 'Lumières' ? 'bulb' : g.section === 'Modeleurs' ? 'softbox' : 'reflector',
        `${g.note ? `<div class="s" style="font-size:11.5px;color:var(--ink3);margin:-2px 0 8px">${g.note}</div>` : ''}<div class="items">${g.items.map(it => `<button class="item" data-add="${it.key}"><span class="ico">${icon(it.icon)}</span><span class="n">${esc(it.label)}</span><span class="s">${esc(it.sub)}</span></button>`).join('')}</div>`);
    }
    h += sec('Appareil photo', 'camera', `<div class="ctl" style="margin-top:0"><label>Focale</label>${chips('focal', FOCALS, c.focal, v => v + ' mm')}</div>
      <div class="ctl"><label>Format</label>${chips('format', Object.keys(FORMATS), c.format)}</div>
      <div class="ctl"><label>Ouverture</label>${chips('f', APERTURES, c.f, v => fmtF(v))}</div>
      <div class="ctl"><label>Vitesse</label>${chips('shutter', SHUTTERS.map(s => s[1]), c.shutter, v => fmtSh(+v))}</div>
      <div class="ctl"><label>ISO</label>${chips('iso', ISOS, c.iso)}</div>
      <div class="ctl"><label>Balance des blancs</label>${chips('wb', WBS, c.wb, v => v + ' K')}</div>
      <div class="ctl"><label>Hauteur de l'appareil <b id="vch">${c.y.toFixed(2).replace('.', ',')} m</b></label><input type="range" min="0.3" max="2.6" step="0.05" value="${c.y}" data-range="camy"></div>
      <div class="ctl"><label>Cadrage rapide</label><div class="chips">
        <button class="chip" data-frame="face">Visage</button><button class="chip" data-frame="bust">Buste</button><button class="chip" data-frame="half">Mi-corps</button><button class="chip" data-frame="full">Pied</button></div></div>`);
    el.innerHTML = h;

    el.querySelectorAll('.acc>button').forEach(b => b.onclick = () => {
      const a = b.parentElement, t = a.dataset.sec; a.classList.toggle('open');
      a.classList.contains('open') ? openSecs.add(t) : openSecs.delete(t);
    });
    el.querySelectorAll('[data-bg]').forEach(b => b.onclick = () => { data.background.color = b.dataset.bg; studio.applyBackground(); commit(); buildLibrary(); });
    el.querySelector('#bgpick').oninput = e => { data.background.color = e.target.value; studio.applyBackground(); };
    el.querySelector('#bgpick').onchange = () => { commit(); buildLibrary(); };
    el.querySelectorAll('[data-chips]').forEach(box => box.onclick = e => {
      const b = e.target.closest('.chip'); if (!b) return;
      const k = box.dataset.chips, v = b.dataset.v;
      if (k === 'walls') { data.studio.walls = v; studio.applyBackground(); }
      else if (k === 'gender' || k === 'skin') { data.model[k] = v; studio.applyModel(); }
      else { c[k] = k === 'format' ? v : +v; studio.applyCamera(); if (k === 'format') layoutRender(); }
      commit(); buildLibrary();
    });
    el.querySelectorAll('[data-range]').forEach(r => {
      r.oninput = () => {
        const k = r.dataset.range, v = +r.value;
        if (k === 'distance') { m.distance = v; studio.applyModel(); $('#vdist').textContent = v.toFixed(1).replace('.', ',') + ' m'; }
        if (k === 'rot') { m.rot = v; studio.applyModel(); $('#vrot').textContent = v + '°'; }
        if (k === 'camy') { c.y = v; studio.applyCamera(); $('#vch').textContent = v.toFixed(2).replace('.', ',') + ' m'; }
        renderFoot();
      };
      r.onchange = () => commit({ keepInspector: true });
    });
    el.querySelectorAll('[data-frame]').forEach(b => b.onclick = () => quickFrame(b.dataset.frame));
    el.querySelectorAll('[data-add]').forEach(b => b.onclick = () => addItem(b.dataset.add));
  }

  function quickFrame(kind) {
    const c = data.camera, u = studio.model.userData;
    const H = { face: .42, bust: .75, half: 1.15, full: 2.05 }[kind];
    const ty = { face: u.headY - .01, bust: u.headY - .2, half: u.headY - .45, full: u.height / 2 + .02 }[kind];
    const [, fh] = FORMATS[c.format];
    const dist = c.focal * H / fh;
    const dir = new THREE.Vector3(c.x - c.tx, 0, c.z - c.tz); if (dir.lengthSq() < .01) dir.set(0, 0, 1); dir.normalize();
    c.tx = 0; c.tz = 0; c.ty = ty;
    c.x = dir.x * dist; c.z = dir.z * dist; c.y = kind === 'full' ? 1.1 : ty + .05;
    if (dist > 9) toast('Recule beaucoup : passe à une focale plus courte');
    studio.applyCamera(); commit(); buildLibrary();
  }

  /* ---------------- ajout d'éléments ---------------- */
  function addItem(key) {
    const def = LIBRARY.flatMap(g => g.items).find(i => i.key === key); if (!def) return;
    const it = { id: Math.random().toString(36).slice(2, 9), ...clone(def.make) };
    // placement : prochain angle libre autour du sujet
    const used = data.items.map(i => Math.atan2(i.x, i.z));
    const cands = it.type === 'refl' ? [50, -50, 20, -20, 90, -90] : [-45, 45, -120, 120, -90, 90, 20, -20];
    let best = cands[0], bestScore = -1;
    for (const a of cands) { const r = a * Math.PI / 180; const sc = Math.min(9, ...used.map(u => Math.abs(Math.atan2(Math.sin(u - r), Math.cos(u - r))))); if (sc > bestScore + .3) { best = a; bestScore = sc; } }
    const ang = best * Math.PI / 180, dist = it.type === 'refl' ? 1.1 : Math.abs(best) > 100 ? 1.3 : (it.mod === 'octa' || it.mod?.startsWith('umb') ? 1.8 : 1.6);
    it.x = +(Math.sin(ang) * dist).toFixed(2); it.z = +(Math.cos(ang) * dist).toFixed(2);
    it.y = it.type === 'refl' ? (it.finish === 'flag' ? 1.7 : 1.0) : (Math.abs(best) > 120 ? 2.0 : 1.95);
    if (it.type === 'light') it.kelvin = it.kelvin || 5600;
    it.aim = 'face';
    if (Math.abs(best) > 120 && it.type === 'light' && (it.mod === 'grid' || it.mod === 'snoot' || it.mod === 'strip')) it.aim = 'face';
    data.items.push(it);
    studio.syncItems(); select({ kind: 'item', id: it.id }); commit();
    if (isMobile) $('#lib').classList.add('collapsed');
  }

  /* ---------------- sélection & gizmo ---------------- */
  const proxy = new THREE.Object3D();
  function select(s) {
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
      if (s.kind === 'model') { openSecs.add('Mannequin'); buildLibrary(); $('#lib').classList.remove('collapsed'); }
      if (s.kind === 'camera') { openSecs.add('Appareil photo'); buildLibrary(); }
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
    let down = null;
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 || gizmo.dragging) { down = null; return; }
      down = null;
      if (gizmo.axis) return; // clic sur la poignée
      const ndc = new THREE.Vector2(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
      ray.setFromCamera(ndc, studio.view);
      const hit = ray.intersectObjects(studio.pickables(), true).find(h => h.object.userData.pick && h.object.visible);
      const pk = hit?.object.userData.pick;
      if (!pk) return select(null);
      select(pk.kind === 'item' ? { kind: 'item', id: pk.id } : { kind: pk.kind });
    });
  }

  /* ---------------- inspecteur ---------------- */
  function renderInspector() {
    const el = $('#insp');
    if (!sel || !data) { el.classList.add('hidden'); return; }
    if (sel.kind === 'camera' || sel.kind === 'target') {
      el.classList.remove('hidden');
      el.innerHTML = `<h4>${icon('camera')}${sel.kind === 'camera' ? 'Appareil photo' : 'Point visé'}</h4>
        <p style="color:var(--ink2);font-size:12.5px;margin:10px 0 0">${sel.kind === 'camera' ? 'Déplace l\'appareil avec les flèches. Le point bleu indique où il vise.' : 'Déplace le point bleu pour changer ce que vise l\'appareil.'} Focale, ouverture et cadrage rapide sont dans « Appareil photo » à gauche.</p>
        <div class="row"><button class="btn sm" id="tgt">${sel.kind === 'camera' ? 'Régler le point visé' : 'Régler l\'appareil'}</button></div>`;
      el.querySelector('#tgt').onclick = () => select({ kind: sel.kind === 'camera' ? 'target' : 'camera' });
      return;
    }
    if (sel.kind !== 'item') { el.classList.add('hidden'); return; }
    const it = data.items.find(i => i.id === sel.id); if (!it) { el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const aimChips = `<div class="ctl"><label>Viser</label><div class="chips" id="aim">${[['face', 'Visage'], ['chest', 'Buste'], ['bg', 'Fond']].map(([v, l]) => `<button class="chip ${it.aim === v ? 'on' : ''}" data-v="${v}">${l}</button>`).join('')}</div></div>`;
    const heightCtl = it.finish?.startsWith('v') ? '' : `<div class="ctl"><label>Hauteur <b id="vh">${it.y.toFixed(2).replace('.', ',')} m</b></label><input type="range" id="hy" min="0.25" max="4" step="0.05" value="${it.y}"></div>`;
    let body = '';
    if (it.type === 'light') {
      const flash = it.kind === 'flash', max = flash ? (it.small ? 120 : 1200) : 1200;
      body = `
        ${flash && !it.small ? `<div class="ctl"><label>Modeleur</label><select class="field" id="mod">${FLASH_MODS.map(k => `<option value="${k}" ${k === it.mod ? 'selected' : ''}>${MODS[k].label}</option>`).join('')}</select></div>` : ''}
        <div class="ctl"><label>Puissance <b id="vp">${it.power} ${flash ? 'Ws' : 'W'}</b></label><input type="range" id="pw" min="0" max="1" step="0.001" value="${Math.log(it.power / 5) / Math.log(max / 5)}"></div>
        ${it.mod === 'fresnel' ? `<div class="ctl"><label>Faisceau <b id="vz">${it.zoom}°</b></label><input type="range" id="zm" min="12" max="55" step="1" value="${it.zoom}"></div>` : ''}
        <div class="ctl"><label>Température <b id="vk">${it.kelvin} K</b></label><input type="range" id="kv" min="2700" max="6500" step="100" value="${it.kelvin}"></div>
        ${heightCtl}${aimChips}
        <div class="ctl"><label>Cellule (cette lumière seule) <b id="vm"></b></label></div>`;
    } else {
      body = `${heightCtl}${aimChips}`;
    }
    const name = it.type === 'light' ? (it.small ? 'Flash cobra' : it.kind === 'cont' ? MODS[it.mod].label : MODS[it.mod].label) : { white: 'Réflecteur blanc', silver: 'Réflecteur argent', gold: 'Réflecteur doré', vwhite: 'V-flat blanc', vblack: 'V-flat noir', flag: 'Drapeau noir' }[it.finish];
    el.innerHTML = `<h4>${icon(it.type === 'light' ? (it.kind === 'flash' ? 'flash' : 'bulb') : 'reflector')}${esc(name)}<span class="k">${it.type === 'light' ? (it.kind === 'flash' ? 'Flash' : 'Continu') : ''}</span></h4>
      ${body}
      <div class="row"><button class="btn sm" id="dup">${icon('dup')}Dupliquer</button><button class="btn sm" id="del" style="color:#c62828">${icon('trash')}Supprimer</button></div>`;
    const q = s => el.querySelector(s);
    if (q('#mod')) q('#mod').onchange = e => { it.mod = e.target.value; studio.syncItems(); commit(); };
    if (q('#pw')) {
      const flash = it.kind === 'flash', max = flash ? (it.small ? 120 : 1200) : 1200;
      q('#pw').oninput = e => {
        const v = 5 * Math.pow(max / 5, +e.target.value);
        it.power = v < 50 ? Math.round(v) : v < 300 ? Math.round(v / 5) * 5 : Math.round(v / 10) * 10;
        q('#vp').textContent = it.power + (flash ? ' Ws' : ' W'); studio.recompute(); updateInspectorMeter(); renderFoot();
      };
      q('#pw').onchange = () => commit({ keepInspector: true });
    }
    if (q('#zm')) { q('#zm').oninput = e => { it.zoom = +e.target.value; q('#vz').textContent = it.zoom + '°'; studio.recompute(); updateInspectorMeter(); renderFoot(); }; q('#zm').onchange = () => commit({ keepInspector: true }); }
    if (q('#kv')) { q('#kv').oninput = e => { it.kelvin = +e.target.value; q('#vk').textContent = it.kelvin + ' K'; studio.recompute(); }; q('#kv').onchange = () => commit({ keepInspector: true }); }
    if (q('#hy')) { q('#hy').oninput = e => { it.y = +e.target.value; q('#vh').textContent = it.y.toFixed(2).replace('.', ',') + ' m'; studio.syncItems(); proxy.position.y = it.y; updateInspectorMeter(); renderFoot(); }; q('#hy').onchange = () => commit({ keepInspector: true }); }
    q('#aim').onclick = e => { const b = e.target.closest('.chip'); if (!b) return; it.aim = b.dataset.v; studio.syncItems(); commit(); };
    q('#dup').onclick = () => { const c = { ...clone(it), id: Math.random().toString(36).slice(2, 9), x: +(it.x + .4).toFixed(2) }; data.items.push(c); studio.syncItems(); select({ kind: 'item', id: c.id }); commit(); };
    q('#del').onclick = () => { data.items = data.items.filter(i => i.id !== it.id); studio.syncItems(); select(null); commit(); };
    updateInspectorMeter();
  }
  function updateInspectorMeter() {
    const el = $('#insp #vm'); if (!el || !sel) return;
    const m = studio.meter(sel.id); el.textContent = m ? fmtF(m) : 'hors faisceau';
  }

  function onKey(e) {
    if (e.target.matches('input,select,textarea')) return;
    const z = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z';
    if (z) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel?.kind === 'item') { data.items = data.items.filter(i => i.id !== sel.id); studio.syncItems(); select(null); commit(); }
    if (e.key === 'Escape') select(null);
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
