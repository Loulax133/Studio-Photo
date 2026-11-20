// Vue fiche (téléphone) : rendu calculé sur l'ordi, schéma vu de dessus, réglages. Pas de 3D en direct.
import { icon, esc, toast } from './ui.js';
import { parseScene } from './store.js';
import { drawDiagram, basicInfo } from './editor/sheet.js';
import { BACKGROUNDS, SKINS, defaultScene } from './editor/defaults.js';

export function openFiche(root, store, setId, { shareId, onOpen3D } = {}) {
  let alive = true, data = null, set = null, render = null;
  root.innerHTML = `<div class="fiche">
    <header class="fiche-top">
      <button class="btn ghost icon" id="fback" aria-label="Retour">${icon('back')}</button>
      <div class="fiche-title"><b id="fname">…</b><span id="fsub"></span></div>
      <button class="btn sm" id="f3d">${icon('cube')}3D</button>
    </header>
    <main class="fiche-body" id="fbody"><div class="card sk"><div class="frame" style="aspect-ratio:4/5"></div></div></main>
  </div>`;
  const $ = s => root.querySelector(s);
  $('#fback').onclick = () => location.hash = shareId ? '' : (set?.folderId ? 'folder-' + set.folderId : '');
  $('#f3d').onclick = () => onOpen3D?.();

  (async () => {
    try {
      if (shareId) {
        const sh = await store.getShared(shareId);
        if (sh) { set = { name: sh.name, scene: sh.scene }; render = sh.render ? { img: sh.render, info: sh.info ? JSON.parse(sh.info) : null } : null; }
      } else {
        set = await store.getSet(setId);
        if (set) render = await store.getRender?.(setId).catch(() => null);
      }
    } catch (e) { console.error(e); }
    if (!alive) return;
    if (!set) { toast(shareId ? 'Ce lien de partage n\'existe plus' : 'Set introuvable'); location.hash = ''; return; }
    data = parseScene(set.scene) || defaultScene();
    draw();
  })();

  function draw() {
    const info = render?.info || basicInfo(data);
    const stale = render && set.updatedAt && render.updatedAt && render.updatedAt < set.updatedAt - 5000;
    $('#fname').textContent = set.name;
    $('#fsub').textContent = shareId ? 'Lecture seule' : (info.expo || '');
    const bg = BACKGROUNDS.find(b => b.c.toLowerCase() === data.background.color.toLowerCase());
    const evCls = info.ev == null ? '' : Math.abs(info.ev) < .34 ? 'ok' : Math.abs(info.ev) < 1.01 ? 'warn' : 'bad';
    $('#fbody').innerHTML = `
      ${render?.img ? `<img class="fiche-render" src="${render.img}" alt="Rendu simulé">` : `<div class="fiche-empty">${icon('frame')}<p>Le rendu apparaîtra ici après la prochaine sauvegarde depuis l'ordinateur.</p><button class="btn sm" id="f3d2">${icon('cube')}Calculer en 3D</button></div>`}
      ${stale ? '<p class="fiche-note">Rendu antérieur aux dernières modifications.</p>' : ''}
      ${info.expo ? `<div class="fiche-expo ${evCls}"><b>${esc(info.expo)}</b>${info.meter ? `<span>Cellule ${esc(info.meter)}</span>` : ''}</div>` : ''}
      <section class="fiche-sec"><h2>Schéma</h2><button class="fiche-diag" id="fdiag" aria-label="Agrandir le schéma"><canvas id="fcv"></canvas></button></section>
      <section class="fiche-sec"><h2>Appareil photo</h2><dl class="fiche-dl">${info.cam.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>
      <section class="fiche-sec"><h2>Lumières & accessoires</h2>
        ${info.rows.length ? info.rows.map(r => `<div class="fiche-item"><span class="num ${r.type === 'light' ? 'l' : ''}">${r.n}</span><div><b>${esc(r.name)}</b>${r.mod && r.mod !== '—' ? `<span class="mod">${esc(r.mod)}</span>` : ''}
          <div class="chips-ro">${[r.power, r.temp].filter(v => v && v !== '—').map(v => `<i>${esc(v)}</i>`).join('')}<i>Haut. ${esc(r.height)}</i><i>${esc(r.dist)}</i><i>${esc(r.angle)}</i>${r.cell && r.cell !== '—' ? `<i class="cell">${esc(r.cell)}</i>` : ''}</div></div></div>`).join('') : '<p class="fiche-note">Aucun élément.</p>'}
      </section>
      <section class="fiche-sec"><h2>Décor</h2><p class="fiche-p">Fond ${esc(bg ? bg.n.toLowerCase() : `personnalisé (${data.background.color})`)}, sujet à ${String(data.model.distance).replace('.', ',')} m du fond, murs ${data.studio.walls === 'light' ? 'clairs' : 'sombres'}${data.studio.haze ? `, brume ${Math.round(data.studio.haze * 100)} %` : ''}.<br>Mannequin ${data.model.gender === 'm' ? 'homme' : 'femme'}, carnation ${SKINS[data.model.skin].label.toLowerCase()}.</p></section>`;
    if ($('#f3d2')) $('#f3d2').onclick = () => onOpen3D?.();
    const paint = (cv, w, h) => {
      const dpr = Math.min(devicePixelRatio, 2); cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + 'px'; cv.style.height = h + 'px';
      const ctx = cv.getContext('2d'), U = 560; // schéma dessiné dans un repère de 560 de large puis mis à l'échelle
      ctx.setTransform(dpr * w / U, 0, 0, dpr * w / U, 0, 0);
      drawDiagram(ctx, 0, 0, U, U * h / w, data);
    };
    const cv = $('#fcv'), w = cv.parentElement.clientWidth; paint(cv, w, Math.round(w * 1.05));
    $('#fdiag').onclick = () => {
      const ov = document.createElement('div'); ov.className = 'fiche-full';
      ov.innerHTML = `<button class="btn icon" aria-label="Fermer">${icon('x')}</button><canvas></canvas>`;
      document.body.appendChild(ov);
      paint(ov.querySelector('canvas'), innerWidth - 16, innerHeight - 80);
      ov.onclick = () => ov.remove();
    };
  }
  return { destroy() { alive = false; document.querySelectorAll('.fiche-full').forEach(n => n.remove()); } };
}
