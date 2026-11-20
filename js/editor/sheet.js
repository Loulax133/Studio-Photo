// Fiche du set : schéma vu de dessus + réglages des lumières et de l'appareil + rendu.
// Générée en image PNG (imprimable, partageable).
import { MODS, FORMATS, BACKGROUNDS, SKINS, itemName, itemModifier } from './defaults.js';

const INK = '#111111', INK2 = '#5f5f5c', INK3 = '#9a9a96', LINE = '#e6e6e4', BLUE = '#2f6bff', WARM = '#f2b33d';
const fr = (n, d = 1) => n.toFixed(d).replace('.', ',');
const fmtF = n => 'f/' + (n >= 10 ? Math.round(n) : fr(Math.round(n * 10) / 10)).toString();
const fmtSh = t => '1/' + Math.round(1 / t);

function loadImg(url) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; }); }
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// angle d'une lumière vue depuis l'appareil : 0° = dans l'axe de l'objectif, + à gauche de l'image
function azimuth(it, cam) {
  const a = Math.atan2(cam.x, cam.z), b = Math.atan2(it.x, it.z);
  let d = (b - a) * 180 / Math.PI; d = ((d + 540) % 360) - 180;
  return d;
}
function azLabel(d) {
  const a = Math.round(Math.abs(d));
  if (a < 8) return 'face';
  if (a > 172) return 'dos';
  return `${a}° ${d < 0 ? 'gauche' : 'droite'}`; // gauche/droite de l'image
}

/* ---------- schéma 2D vu de dessus ---------- */
export function drawDiagram(ctx, X, Y, W, H, data) {
  const dist = data.model.distance, cam = data.camera;
  const pts = [[-1.5, -dist], [1.5, -dist], [0, .6], [cam.x, cam.z]];
  for (const it of data.items) pts.push([it.x, it.z]);
  let minX = Math.min(...pts.map(p => p[0])) - .7, maxX = Math.max(...pts.map(p => p[0])) + .7;
  let minZ = Math.min(...pts.map(p => p[1])) - .5, maxZ = Math.max(...pts.map(p => p[1])) + .6;
  const s = Math.min(W / (maxX - minX), H / (maxZ - minZ));
  const ox = X + (W - (maxX - minX) * s) / 2 - minX * s, oy = Y + (H - (maxZ - minZ) * s) / 2 - minZ * s;
  const P = (x, z) => [ox + x * s, oy + z * s];

  ctx.save();
  rr(ctx, X, Y, W, H, 18); ctx.fillStyle = '#fafaf9'; ctx.fill(); ctx.clip();
  // grille 50 cm
  ctx.strokeStyle = '#efefed'; ctx.lineWidth = 1;
  for (let x = Math.floor(minX * 2) / 2; x <= maxX; x += .5) { const [px] = P(x, 0); ctx.beginPath(); ctx.moveTo(px, Y); ctx.lineTo(px, Y + H); ctx.stroke(); }
  for (let z = Math.floor(minZ * 2) / 2; z <= maxZ; z += .5) { const [, py] = P(0, z); ctx.beginPath(); ctx.moveTo(X, py); ctx.lineTo(X + W, py); ctx.stroke(); }
  // fond papier
  const [px1, pz1] = P(-1.36, -dist), [px2, pz2] = P(1.36, -dist + 2.4);
  const g = ctx.createLinearGradient(0, pz1, 0, pz2); g.addColorStop(0, data.background.color); g.addColorStop(1, data.background.color + '00');
  ctx.fillStyle = g; ctx.globalAlpha = .55; ctx.fillRect(px1, pz1, px2 - px1, pz2 - pz1); ctx.globalAlpha = 1;
  ctx.strokeStyle = INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(px1, pz1); ctx.lineTo(px2, pz1); ctx.stroke();
  ctx.fillStyle = INK2; ctx.font = '500 20px Inter, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Fond', (px1 + px2) / 2, pz1 + 28);

  // faisceaux (sous tout le reste)
  const face = [0, .03];
  data.items.forEach(it => {
    if (it.type !== 'light') return;
    const [lx, lz] = P(it.x, it.z), tgt = it.aim === 'bg' ? [0, -dist] : face, [tx, tz] = P(...tgt);
    const half = Math.min(80, MODS[it.mod].angle / 2) * Math.PI / 180, ang = Math.atan2(tz - lz, tx - lx), len = Math.hypot(tx - lx, tz - lz) * 1.15;
    const gr = ctx.createRadialGradient(lx, lz, 0, lx, lz, len);
    gr.addColorStop(0, 'rgba(242,179,61,.35)'); gr.addColorStop(1, 'rgba(242,179,61,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(lx, lz); ctx.arc(lx, lz, len, ang - half, ang + half); ctx.closePath(); ctx.fill();
  });
  // appareil : champ de vision
  {
    const [cx, cz] = P(cam.x, cam.z), [tx, tz] = P(cam.tx, cam.tz);
    const [fw, fh] = FORMATS[cam.format] || FORMATS['4:5'];
    const half = Math.atan(fw / 2 / cam.focal), ang = Math.atan2(tz - cz, tx - cx), len = Math.hypot(tx - cx, tz - cz) + 1.2 * s;
    ctx.strokeStyle = BLUE; ctx.globalAlpha = .7; ctx.lineWidth = 2; ctx.setLineDash([8, 6]);
    for (const k of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx, cz); ctx.lineTo(cx + Math.cos(ang + k * half) * len, cz + Math.sin(ang + k * half) * len); ctx.stroke(); }
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(cx, cz); ctx.rotate(ang + Math.PI / 2);
    rr(ctx, -20, -8, 40, 26, 5); ctx.fillStyle = INK; ctx.fill();
    ctx.fillRect(-9, -18, 18, 12);
    ctx.restore();
    ctx.fillStyle = BLUE; ctx.font = '600 19px Inter, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Appareil · ${cam.focal} mm`, cx, cz + 46);
  }
  // sujet
  {
    const [mx, mz] = P(0, 0), r = (data.model.rot || 0) * Math.PI / 180;
    ctx.save(); ctx.translate(mx, mz); ctx.rotate(-r);
    ctx.fillStyle = '#d9d9d6'; ctx.beginPath(); ctx.ellipse(0, 0, .24 * s, .13 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = SKINS[data.model.skin]?.c || '#e7c4ab'; ctx.beginPath(); ctx.arc(0, 0, .1 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ctx.moveTo(-.035 * s, .09 * s); ctx.lineTo(.035 * s, .09 * s); ctx.lineTo(0, .15 * s); ctx.fill(); // nez
    ctx.restore();
    ctx.fillStyle = INK2; ctx.font = '500 19px Inter, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Sujet', mx + .3 * s, mz + 6);
  }
  // éléments
  data.items.forEach((it, i) => {
    const [lx, lz] = P(it.x, it.z), tgt = it.type === 'light' && it.aim === 'bg' ? [0, -dist] : face, [tx, tz] = P(...tgt);
    const ang = Math.atan2(tz - lz, tx - lx);
    ctx.save(); ctx.translate(lx, lz); ctx.rotate(ang + Math.PI / 2);
    if (it.type === 'light') {
      const m = MODS[it.mod], w = Math.max(.16, m.area ? m.area[0] : .16) * s, d = Math.max(.12, m.area ? .3 : .22) * s;
      ctx.fillStyle = INK;
      if (m.shape === 'round' || !m.area) { ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.quadraticCurveTo(0, d * .9, w / 2, 0); ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.lineTo(w * .12, d); ctx.lineTo(-w * .12, d); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = WARM; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    } else if (it.finish === 'vwhite' || it.finish === 'vblack') {
      ctx.strokeStyle = it.finish === 'vwhite' ? '#bdbdb9' : INK; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-.5 * s, .35 * s); ctx.lineTo(0, 0); ctx.lineTo(.5 * s, .35 * s); ctx.stroke();
    } else if (it.finish === 'flag') {
      ctx.strokeStyle = INK; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(-.3 * s, 0); ctx.lineTo(.3 * s, 0); ctx.stroke();
    } else {
      ctx.strokeStyle = { white: '#bdbdb9', silver: '#9a9a96', gold: '#d9a441' }[it.finish]; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(0, .55 * s, .4 * s, -Math.PI * .5 - .9, -Math.PI * .5 + .9); ctx.stroke();
    }
    ctx.restore();
    // pastille numérotée
    const bx = lx + Math.cos(ang + Math.PI) * 34, bz = lz + Math.sin(ang + Math.PI) * 34;
    ctx.fillStyle = it.type === 'light' ? INK : '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(bx, bz, 15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = it.type === 'light' ? '#fff' : INK; ctx.font = '600 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), bx, bz + 1); ctx.textBaseline = 'alphabetic';
  });
  // échelle
  const [sx] = P(minX + .3, 0); const sy = Y + H - 26;
  ctx.strokeStyle = INK2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + s, sy); ctx.moveTo(sx, sy - 6); ctx.lineTo(sx, sy + 6); ctx.moveTo(sx + s, sy - 6); ctx.lineTo(sx + s, sy + 6); ctx.stroke();
  ctx.fillStyle = INK2; ctx.font = '500 16px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('1 m', sx + s / 2, sy - 10);
  ctx.restore();
}

/* ---------- tableau ---------- */
function table(ctx, x, y, cols, rows, rowH = 44) {
  ctx.textAlign = 'left';
  ctx.font = '500 17px Inter, sans-serif'; ctx.fillStyle = INK3;
  let cx = x; cols.forEach(c => { ctx.fillText(c.t, cx, y); cx += c.w; });
  y += 14; ctx.strokeStyle = LINE; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, y); ctx.stroke();
  rows.forEach(r => {
    y += rowH; cx = x;
    r.forEach((v, i) => {
      ctx.font = (i === 0 ? '600 ' : '400 ') + '19px Inter, sans-serif'; ctx.fillStyle = i === 0 ? INK : INK;
      let t = String(v); const max = cols[i].w - 14;
      while (ctx.measureText(t).width > max && t.length > 2) t = t.slice(0, -2) + '…';
      ctx.fillText(t, cx, y - 14); cx += cols[i].w;
    });
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(cx, y); ctx.stroke();
  });
  return y;
}

// données de la fiche (réutilisées par la vue téléphone)
export function sheetInfo(studio, data) {
  const cam = data.camera, meter = studio.meter();
  const ev = meter ? 2 * Math.log2(meter / cam.f) : null;
  const expo = ev === null ? 'Aucune lumière' : Math.abs(ev) < .34 ? 'Exposition juste' : `${ev > 0 ? 'Surexposé' : 'Sous-exposé'} de ${fr(Math.abs(ev))} IL`;
  const rows = data.items.map((it, i) => {
    const d = Math.hypot(it.x, it.z, (it.y || 1) - 1.58), m = studio.meter(it.id);
    return { n: i + 1, type: it.type, name: itemName(it), mod: itemModifier(it),
      power: it.type === 'light' ? `${it.power} ${it.kind === 'flash' ? 'Ws' : 'W'}` : '—', temp: it.type === 'light' ? `${it.kelvin} K` : '—',
      height: it.finish?.startsWith('v') ? '2 m' : `${fr(it.y, 2)} m`, dist: `${fr(d)} m`, angle: azLabel(azimuth(it, cam)),
      cell: it.type === 'light' ? (m ? fmtF(m) : 'hors faisceau') : (m ? `${fmtF(m)} (rebond)` : '—') };
  });
  return { expo, ev, rows, meter: meter ? fmtF(meter) : null, subject: fr(studio.subjectDistance()),
    cam: [['Focale', `${cam.focal} mm`], ['Ouverture', fmtF(cam.f)], ['Vitesse', fmtSh(cam.shutter)], ['ISO', String(cam.iso)], ['Balance des blancs', `${cam.wb} K`], ['Format', cam.format], ['Hauteur', `${fr(cam.y, 2)} m`], ['Distance au sujet', `${fr(studio.subjectDistance())} m`]] };
}
// version sans moteur 3D (sets jamais sauvegardés depuis l'ordi)
export function basicInfo(data) {
  const cam = data.camera;
  return { expo: null, meter: null, rows: data.items.map((it, i) => ({ n: i + 1, type: it.type, name: itemName(it), mod: itemModifier(it),
    power: it.type === 'light' ? `${it.power} ${it.kind === 'flash' ? 'Ws' : 'W'}` : '—', temp: it.type === 'light' ? `${it.kelvin} K` : '—',
    height: it.finish?.startsWith('v') ? '2 m' : `${fr(it.y, 2)} m`, dist: `${fr(Math.hypot(it.x, it.z, (it.y || 1) - 1.58))} m`, angle: azLabel(azimuth(it, cam)), cell: '—' })),
    cam: [['Focale', `${cam.focal} mm`], ['Ouverture', fmtF(cam.f)], ['Vitesse', fmtSh(cam.shutter)], ['ISO', String(cam.iso)], ['Balance des blancs', `${cam.wb} K`], ['Format', cam.format], ['Hauteur', `${fr(cam.y, 2)} m`]] };
}

export async function buildSheet({ studio, data, name }) {
  await document.fonts?.ready;
  const cam = data.camera, renderUrl = studio.capture(1400, 'image/jpeg', .92), img = await loadImg(renderUrl);
  const W = 2480, M = 90, colL = 1000, gap = 70, colR = W - M * 2 - colL - gap;
  const items = data.items, rowH = 46;
  const imgH = Math.round(colL / (img.width / img.height));
  const diagH = 820;
  const rightH = diagH + 70 + 230 + 70 + 60 + rowH * Math.max(1, items.length) + 40;
  const H = Math.max(330 + imgH + 200, 330 + rightH) + M;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);

  // en-tête
  ctx.fillStyle = INK; rr(ctx, M, M - 6, 34, 34, 9); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(M + 17, M + 11, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = INK2; ctx.font = '600 20px Inter, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Light Studio', M + 48, M + 18);
  ctx.textAlign = 'right'; ctx.fillStyle = INK3; ctx.font = '400 20px Inter, sans-serif';
  ctx.fillText(new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }), W - M, M + 18);
  ctx.textAlign = 'left'; ctx.fillStyle = INK; ctx.font = '600 60px Inter, sans-serif'; ctx.fillText(name, M, M + 110);
  const meter = studio.meter();
  const ev = meter ? 2 * Math.log2(meter / cam.f) : null;
  const expo = ev === null ? 'aucune lumière' : Math.abs(ev) < .34 ? 'exposition juste' : `${ev > 0 ? 'surexposé' : 'sous-exposé'} de ${fr(Math.abs(ev))} IL`;
  ctx.fillStyle = INK2; ctx.font = '400 24px Inter, sans-serif';
  ctx.fillText(`${cam.focal} mm · ${fmtF(cam.f)} · ${fmtSh(cam.shutter)} · ISO ${cam.iso} — cellule ${meter ? fmtF(meter) : '—'} (${expo})`, M, M + 155);

  const top = 330;
  // rendu
  ctx.fillStyle = INK3; ctx.font = '500 18px Inter, sans-serif'; ctx.fillText('RENDU SIMULÉ', M, top - 18);
  ctx.save(); rr(ctx, M, top, colL, imgH, 16); ctx.clip(); ctx.drawImage(img, M, top, colL, imgH); ctx.restore();
  // fond + mannequin sous le rendu
  const bg = BACKGROUNDS.find(b => b.c.toLowerCase() === data.background.color.toLowerCase());
  ctx.fillStyle = INK2; ctx.font = '400 21px Inter, sans-serif';
  const sub = data.model;
  ctx.fillText(`Fond : ${bg ? bg.n : data.background.color} · sujet à ${fr(sub.distance)} m du fond · murs ${data.studio.walls === 'light' ? 'clairs' : 'sombres'}`, M, top + imgH + 44);
  ctx.fillText(`Mannequin : ${sub.gender === 'm' ? 'homme' : 'femme'}, carnation ${SKINS[sub.skin].label.toLowerCase()}${sub.rot ? `, tourné de ${sub.rot}°` : ''}`, M, top + imgH + 78);

  // colonne droite
  const RX = M + colL + gap;
  ctx.fillStyle = INK3; ctx.font = '500 18px Inter, sans-serif'; ctx.fillText('SCHÉMA (VUE DE DESSUS)', RX, top - 18);
  drawDiagram(ctx, RX, top, colR, diagH, data);

  let y = top + diagH + 70;
  ctx.fillStyle = INK3; ctx.font = '500 18px Inter, sans-serif'; ctx.fillText('APPAREIL PHOTO', RX, y);
  const [fw, fh] = FORMATS[cam.format];
  const camRows = [
    ['Focale', `${cam.focal} mm (plein format)`, 'Format', `${cam.format}`],
    ['Ouverture', fmtF(cam.f), 'Vitesse', fmtSh(cam.shutter)],
    ['ISO', String(cam.iso), 'Balance des blancs', `${cam.wb} K`],
    ['Hauteur', `${fr(cam.y, 2)} m`, 'Distance au sujet', `${fr(studio.subjectDistance())} m`],
  ];
  camRows.forEach((r, i) => {
    const yy = y + 44 + i * 44;
    ctx.font = '400 19px Inter, sans-serif'; ctx.fillStyle = INK2; ctx.fillText(r[0], RX, yy); ctx.fillText(r[2], RX + colR / 2, yy);
    ctx.font = '600 19px Inter, sans-serif'; ctx.fillStyle = INK; ctx.fillText(r[1], RX + 190, yy); ctx.fillText(r[3], RX + colR / 2 + 230, yy);
  });
  y += 44 * 4 + 90;
  ctx.fillStyle = INK3; ctx.font = '500 18px Inter, sans-serif'; ctx.fillText('LUMIÈRES & ACCESSOIRES', RX, y);
  const cols = [{ t: '#', w: 50 }, { t: 'Élément', w: 220 }, { t: 'Modeleur', w: 250 }, { t: 'Puissance', w: 130 }, { t: 'Temp.', w: 100 }, { t: 'Haut.', w: 95 }, { t: 'Dist.', w: 95 }, { t: 'Angle', w: 150 }, { t: 'Cellule', w: colR - 1090 }];
  const rows = sheetInfo(studio, data).rows.map(r => [r.n, r.name, r.mod, r.power, r.temp, r.height, r.dist, r.angle, r.cell]);
  if (!rows.length) rows.push(['', 'Aucun élément', '', '', '', '', '', '', '']);
  table(ctx, RX, y + 44, cols, rows, rowH);

  ctx.fillStyle = INK3; ctx.font = '400 16px Inter, sans-serif'; ctx.textAlign = 'left';
  ctx.fillText('Angles mesurés depuis l\'appareil (gauche / droite de l\'image). Simulation indicative : photométrie simplifiée, mannequin stylisé.', M, H - M + 30);

  return new Promise(res => c.toBlob(b => res(URL.createObjectURL(b)), 'image/png'));
}
