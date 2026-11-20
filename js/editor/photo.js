// Analyse d'une photo de portrait → schéma lumière de départ.
// 1. Détection du visage (MediaPipe Face Landmarker, 478 points 3D, tout dans le navigateur)
// 2. Normales du visage à partir du maillage + luminance mesurée sur la peau
// 3. Ajustement d'un modèle d'éclairage (direction, douceur de la source, ambiance) par moindres carrés
// 4. Reflets dans les yeux (forme de la source), contre-jour sur les contours, luminosité / couleur du fond
// Résultat approximatif : un point de départ à ajuster, pas une reconstitution exacte.

const BASE = new URL('../../vendor/mediapipe/', import.meta.url).href;
let landmarkerP = null;
export function loadLandmarker() {
  if (!landmarkerP) landmarkerP = (async () => {
    const vision = await import(BASE + 'vision_bundle.mjs');
    const fileset = await vision.FilesetResolver.forVisionTasks(BASE + 'wasm');
    const lm = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: BASE + 'face_landmarker.task', delegate: 'CPU' },
      runningMode: 'IMAGE', numFaces: 1,
    });
    return { lm, vision };
  })().catch(e => { landmarkerP = null; throw e; });
  return landmarkerP;
}

const toLin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
const LIN = new Float32Array(256).map((_, i) => toLin(i));
const toSrgb = v => { v = Math.max(0, Math.min(1, v)); return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
const hex = (r, g, b) => '#' + [r, g, b].map(v => toSrgb(v).toString(16).padStart(2, '0')).join('');
const idxOf = conns => new Set(conns.flatMap(c => [c.start, c.end]));

// plus petit vecteur propre d'une matrice 3x3 symétrique (Jacobi)
function smallestEigen(m) {
  const a = [[m[0], m[1], m[2]], [m[1], m[3], m[4]], [m[2], m[4], m[5]]], v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let s = 0; s < 24; s++) {
    let p = 0, q = 1; if (Math.abs(a[0][2]) > Math.abs(a[p][q])) { p = 0; q = 2; } if (Math.abs(a[1][2]) > Math.abs(a[p][q])) { p = 1; q = 2; }
    if (Math.abs(a[p][q]) < 1e-12) break;
    const th = (a[q][q] - a[p][p]) / (2 * a[p][q]), t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), sn = t * c;
    for (let k = 0; k < 3; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - sn * akq; a[k][q] = sn * akp + c * akq; }
    for (let k = 0; k < 3; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - sn * aqk; a[q][k] = sn * apk + c * aqk; }
    for (let k = 0; k < 3; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - sn * vkq; v[k][q] = sn * vkp + c * vkq; }
  }
  let mi = 0; for (let i = 1; i < 3; i++) if (a[i][i] < a[mi][mi]) mi = i;
  return [v[0][mi], v[1][mi], v[2][mi]];
}

export async function analyzePhoto(source) {
  const { lm, vision } = await loadLandmarker();
  // image de travail (max 1024 px)
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const k = Math.min(1, 1024 / Math.max(sw, sh)), W = Math.round(sw * k), H = Math.round(sh * k);
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true }); ctx.drawImage(source, 0, 0, W, H);
  const res = lm.detect(cv);
  const pts = res.faceLandmarks?.[0];
  if (!pts) return { ok: false, reason: 'face' };
  const px = ctx.getImageData(0, 0, W, H).data;
  const lumAt = (x, y, r) => {
    let s = 0, n = 0, R = 0, G = 0, B = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) {
      const xx = Math.round(x + i), yy = Math.round(y + j); if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const o = (yy * W + xx) * 4, rr = LIN[px[o]], gg = LIN[px[o + 1]], bb = LIN[px[o + 2]];
      R += rr; G += gg; B += bb; s += 0.2126 * rr + 0.7152 * gg + 0.0722 * bb; n++;
    }
    return n ? { L: s / n, R: R / n, G: G / n, B: B / n } : { L: 0, R: 0, G: 0, B: 0 };
  };
  const F = vision.FaceLandmarker;
  // points 3D en pixels : X droite, Y haut, Z vers l'appareil
  const P = pts.map(p => [p.x * W, -p.y * H, -p.z * W]);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]);
  const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
  const faceW = fx1 - fx0, faceH = fy1 - fy0, cx = (fx0 + fx1) / 2;
  // voisinages (2 anneaux) depuis le maillage
  const nb = P.map(() => new Set());
  for (const c of F.FACE_LANDMARKS_TESSELATION) { nb[c.start]?.add(c.end); nb[c.end]?.add(c.start); }
  const normals = P.map((p, i) => {
    const ring = new Set(nb[i]); for (const j of nb[i]) for (const q of nb[j]) ring.add(q); ring.add(i);
    const arr = [...ring].map(j => P[j]); if (arr.length < 4) return null;
    const m = [0, 0, 0]; arr.forEach(a => { m[0] += a[0]; m[1] += a[1]; m[2] += a[2]; }); m.forEach((_, t) => m[t] /= arr.length);
    const C = [0, 0, 0, 0, 0, 0];
    for (const a of arr) { const d = [a[0] - m[0], a[1] - m[1], a[2] - m[2]]; C[0] += d[0] * d[0]; C[1] += d[0] * d[1]; C[2] += d[0] * d[2]; C[3] += d[1] * d[1]; C[4] += d[1] * d[2]; C[5] += d[2] * d[2]; }
    let n = smallestEigen(C); if (n[2] < 0) n = n.map(v => -v);
    const l = Math.hypot(...n); return n.map(v => v / l);
  });
  const skip = new Set([...idxOf(F.FACE_LANDMARKS_LEFT_EYE), ...idxOf(F.FACE_LANDMARKS_RIGHT_EYE), ...idxOf(F.FACE_LANDMARKS_LEFT_EYEBROW),
    ...idxOf(F.FACE_LANDMARKS_RIGHT_EYEBROW), ...idxOf(F.FACE_LANDMARKS_LIPS), ...idxOf(F.FACE_LANDMARKS_FACE_OVAL)]);
  for (let i = 468; i < P.length; i++) skip.add(i);
  const r = Math.max(1, Math.round(faceW * 0.008));
  const samples = [];
  for (let i = 0; i < Math.min(468, P.length); i++) {
    if (skip.has(i) || !normals[i] || normals[i][2] < 0.15) continue;
    const s = lumAt(P[i][0], -P[i][1], r);
    samples.push({ n: normals[i], L: s.L, c: s });
  }
  if (samples.length < 60) return { ok: false, reason: 'face' };

  // ajustement : L = a + b · max(0, (n·l + w) / (1 + w))
  const fit = (l, w, set) => {
    let s1 = 0, s2 = 0, sy = 0, sxy = 0, n = set.length;
    const sh = set.map(p => Math.max(0, (p.n[0] * l[0] + p.n[1] * l[1] + p.n[2] * l[2] + w) / (1 + w)));
    for (let i = 0; i < n; i++) { s1 += sh[i]; s2 += sh[i] * sh[i]; sy += set[i].L; sxy += sh[i] * set[i].L; }
    const den = n * s2 - s1 * s1; if (Math.abs(den) < 1e-9) return null;
    let b = (n * sxy - s1 * sy) / den, a = (sy - b * s1) / n;
    if (b <= 0) return null; if (a < 0) { a = 0; b = sxy / Math.max(1e-9, s2); }
    let err = 0; for (let i = 0; i < n; i++) { const e = set[i].L - a - b * sh[i]; err += e * e; }
    return { a, b, err, sh };
  };
  const dirOf = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];
  const D = Math.PI / 180, WRAPS = [0, 0.15, 0.3, 0.5, 0.75];
  const search = set => {
    let best = null;
    for (let az = -120; az <= 120; az += 5) for (let el = -35; el <= 70; el += 5) for (const w of WRAPS) {
      const l = dirOf(az * D, el * D), f = fit(l, w, set);
      if (f && (!best || f.err < best.err)) best = { ...f, az, el, w, l };
    }
    // affinage local
    for (let az = best.az - 4; az <= best.az + 4; az += 1) for (let el = best.el - 4; el <= best.el + 4; el += 1) for (let w = Math.max(0, best.w - .12); w <= best.w + .12; w += .04) {
      const l = dirOf(az * D, el * D), f = fit(l, w, set);
      if (f && f.err < best.err) best = { ...f, az, el, w, l };
    }
    return best;
  };
  let best = search(samples);
  // robustesse : on retire les 12 % de points les plus éloignés du modèle (barbe, maquillage, reflets) et on recommence
  const resid = samples.map((p, i) => Math.abs(p.L - best.a - best.b * best.sh[i]));
  const thr = [...resid].sort((x, y) => x - y)[Math.floor(resid.length * .88)];
  const clean = samples.filter((_, i) => resid[i] <= thr);
  best = search(clean);

  // dureté : une source dure crée des ombres portées nettes (nez, orbites) là où la peau devrait être éclairée
  const shF = clean.map(p => Math.max(0, p.n[0] * best.l[0] + p.n[1] * best.l[1] + p.n[2] * best.l[2]));
  const litPts = clean.filter((_, i) => shF[i] > .35);
  const cast = clean.filter((p, i) => shF[i] > .35 && p.L < best.a + best.b * shF[i] * .45).length / Math.max(1, litPts.length);

  // reflets dans les yeux (iris : 468 et 473)
  const catches = [];
  if (P.length >= 478) for (const [c0, e0] of [[468, 469], [473, 474]]) {
    const c = P[c0], ir = Math.max(2, Math.hypot(P[e0][0] - c[0], P[e0][1] - c[1])) * 1.15;
    let mx = 0; const cells = [];
    for (let y = -ir; y <= ir; y++) for (let x = -ir; x <= ir; x++) {
      if (x * x + y * y > ir * ir) continue;
      const X = Math.round(c[0] + x), Y = Math.round(-c[1] + y); if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
      const o = (Y * W + X) * 4, L = 0.2126 * LIN[px[o]] + 0.7152 * LIN[px[o + 1]] + 0.0722 * LIN[px[o + 2]];
      cells.push([x, y, L]); if (L > mx) mx = L;
    }
    const mean = cells.reduce((s, q) => s + q[2], 0) / Math.max(1, cells.length);
    const hot = cells.filter(q => q[2] > Math.max(mx * .7, mean * 2.2));
    if (hot.length && mx > mean * 2) {
      const xs2 = hot.map(q => q[0]), ys2 = hot.map(q => q[1]);
      const w = Math.max(...xs2) - Math.min(...xs2) + 1, h = Math.max(...ys2) - Math.min(...ys2) + 1;
      catches.push({ dx: xs2.reduce((s, v) => s + v, 0) / hot.length / ir, dy: -ys2.reduce((s, v) => s + v, 0) / hot.length / ir, w: w / ir, h: h / ir });
    }
  }

  // contre-jour : contours du visage nettement plus clairs que l'intérieur du même côté
  const oval = [...idxOf(F.FACE_LANDMARKS_FACE_OVAL)];
  const sideStats = side => {
    const o = oval.filter(i => (P[i][0] - cx) * side > faceW * .25 && P[i][1] < fy1 - faceH * .2).map(i => lumAt(P[i][0] - side * r * 1.5, -P[i][1], r).L);
    const inn = samples.filter((p, i) => p.n[0] * side > .35).map(p => p.L);
    const avg = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;
    return { edge: avg(o), inner: avg(inn) };
  };
  const rims = [];
  for (const side of [-1, 1]) {
    const st = sideStats(side);
    // côté opposé à la lumière principale, ou bord très brillant
    if (st.edge > st.inner * 1.45 && st.edge > (best.a + best.b) * .55 && Math.sign(best.l[0]) !== side) rims.push(side);
  }

  // fond : bandes sur les côtés et en haut de l'image, hors visage élargi
  const bx0 = fx0 - faceW * .9, bx1 = fx1 + faceW * .9, by0 = -fy1 - faceH * .6;
  let bR = 0, bG = 0, bB = 0, bL = 0, bn = 0;
  const step = Math.max(2, Math.round(Math.min(W, H) / 120));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const inFace = x > bx0 && x < bx1 && y > by0; if (inFace) continue;
    if (!(x < W * .14 || x > W * .86 || y < H * .12)) continue;
    const o = (y * W + x) * 4, R = LIN[px[o]], G = LIN[px[o + 1]], B = LIN[px[o + 2]];
    bR += R; bG += G; bB += B; bL += 0.2126 * R + 0.7152 * G + 0.0722 * B; bn++;
  }
  const bg = bn ? { R: bR / bn, G: bG / bn, B: bB / bn, L: bL / bn } : { R: .2, G: .2, B: .2, L: .2 };
  const lit = best.a + best.b; // luminance de la peau côté lumière
  const ratioEV = Math.log2(lit / Math.max(best.a, lit / 64));
  // albédo du fond estimé : la peau claire réfléchit ~45 %, on ramène le fond à la même échelle
  const skinAlbedo = .42, scale = skinAlbedo / Math.max(1e-4, lit);
  const bgAlb = { R: bg.R * scale, G: bg.G * scale, B: bg.B * scale, L: bg.L * scale };

  return {
    ok: true, W, H, canvas: cv, points: P.map(p => [p[0], -p[1]]),
    // l'élévation est légèrement sous-estimée par l'ajustement : +5°
    key: { az: best.az, el: Math.min(75, best.el + 5), wrap: best.w, cast }, fill: { ratioEV }, rims, catches,
    bg: { color: hex(Math.min(.92, bgAlb.R), Math.min(.92, bgAlb.G), Math.min(.92, bgAlb.B)), albedo: bgAlb.L, rel: bg.L / Math.max(1e-4, lit) },
    framing: faceH / H,
    quality: Math.sqrt(best.err / clean.length) / Math.max(1e-4, lit),
  };
}

// choix du modeleur : la taille du reflet dans l'œil (relative à l'iris) suit la taille apparente de la source
function pickModifier(an) {
  const cs = an.catches;
  if (cs.length) {
    const size = cs.reduce((a, c) => a + Math.sqrt(c.w * c.h), 0) / cs.length;
    const asp = cs.reduce((a, c) => a + c.h / Math.max(.05, c.w), 0) / cs.length;
    if (asp > 2.2 && size > .2) return 'strip';
    if (size < .22) return 'standard';
    if (size < .36) return 'beauty';
    return size > .52 ? 'octa' : 'softbox';
  }
  // pas de reflet exploitable : on se fie aux ombres portées
  if (an.key.cast > .1) return 'standard';
  return an.key.wrap > .3 ? 'octa' : 'softbox';
}
const MOD_DIST = { standard: 2.1, beauty: 1.3, softbox: 1.5, strip: 1.4, octa: 1.7 };

// schéma de départ (coordonnées du studio, appareil supposé dans l'axe actuel)
export function analysisToScene(an, data) {
  const cam = data.camera, camAz = Math.atan2(cam.x - cam.tx, cam.z - cam.tz), D = Math.PI / 180;
  const face = [0, 1.58, 0.03];
  const place = (azDeg, elDeg, dist) => {
    const az = camAz + azDeg * D, el = elDeg * D;
    return { x: +(face[0] + Math.sin(az) * Math.cos(el) * dist).toFixed(2), y: +Math.max(.3, Math.min(3.3, face[1] + Math.sin(el) * dist)).toFixed(2), z: +(face[2] + Math.cos(az) * Math.cos(el) * dist).toFixed(2) };
  };
  const items = [], mod = pickModifier(an), id = () => Math.random().toString(36).slice(2, 9);
  items.push({ id: id(), type: 'light', kind: 'flash', mod, power: 100, kelvin: 5600, aim: 'face', role: 'key', ...place(an.key.az, an.key.el, MOD_DIST[mod]) });
  // débouchage selon le contraste mesuré
  const opp = an.key.az >= 0 ? -1 : 1, r = an.fill.ratioEV;
  if (r < 1.6) items.push({ id: id(), type: 'light', kind: 'flash', mod: 'softbox', power: 30, kelvin: 5600, aim: 'face', role: 'fill', ratioEV: r, ...place(opp * 40, 5, 1.8) });
  else if (r < 3.2) items.push({ id: id(), type: 'refl', finish: 'white', aim: 'face', ...place(opp * 55, -25, 1.0) });
  else if (r > 4.2) items.push({ id: id(), type: 'refl', finish: 'vblack', aim: 'face', ...place(opp * 70, 0, 1.1) });
  // contre-jours
  for (const side of an.rims) items.push({ id: id(), type: 'light', kind: 'flash', mod: 'strip', power: 60, kelvin: 5600, aim: 'face', role: 'rim', ...place(side * 130, 10, 1.3) });
  // fond
  let bgColor = an.bg.color, walls = an.bg.albedo > .45 ? 'light' : 'dark';
  if (an.bg.rel > 1.15) { // fond plus lumineux que la peau éclairée : high key, fond éclairé
    bgColor = '#f4f4f2';
    const d = data.model.distance;
    for (const s of [-1, 1]) items.push({ id: id(), type: 'light', kind: 'flash', mod: 'softbox', power: 150, kelvin: 5600, aim: 'bg', role: 'bg', x: s * 1.15, y: 1.6, z: +(-d + .9).toFixed(2) });
  }
  const framing = an.framing > .42 ? 'face' : an.framing > .22 ? 'bust' : an.framing > .12 ? 'half' : 'full';
  return { items, background: bgColor, walls, framing, mod };
}

export function describeAnalysis(an, sc) {
  const MODN = { standard: 'source dure (réflecteur standard)', beauty: 'source semi-douce (beauty dish)', softbox: 'source douce (softbox)', strip: 'source douce en bande (stripbox)', octa: 'grande source très douce (octabox)' };
  const side = an.key.az < -8 ? `${Math.abs(an.key.az)}° à gauche` : an.key.az > 8 ? `${an.key.az}° à droite` : 'de face';
  const height = an.key.el > 8 ? `${an.key.el}° au-dessus` : an.key.el < -8 ? `${-an.key.el}° en dessous` : 'à hauteur du visage';
  const r = an.fill.ratioEV;
  const fill = r < 1.6 ? `contraste faible (${r.toFixed(1).replace('.', ',')} IL) → débouchage par une 2e lumière` : r < 3.2 ? `contraste moyen (${r.toFixed(1).replace('.', ',')} IL) → réflecteur blanc` : `contraste fort (${r.toFixed(1).replace('.', ',')} IL) → pas de débouchage${r > 4.2 ? ', drapeau noir' : ''}`;
  const lines = [
    `Lumière principale : ${side}, ${height}`,
    `Qualité : ${MODN[sc.mod]}`,
    `Ombres : ${fill}`,
  ];
  if (an.rims.length) lines.push(`Contre-jour détecté : ${an.rims.map(s => s < 0 ? 'à gauche' : 'à droite').join(' et ')}`);
  if (an.catches.length) lines.push(`Reflets dans les yeux : ${an.catches.length === 2 ? 'visibles' : 'un œil'}${an.catches[0].h > an.catches[0].w * 2.2 ? ', forme allongée' : ''}`);
  lines.push(`Fond : ${an.bg.rel > 1.15 ? 'plus clair que le visage → high key, fond éclairé' : an.bg.albedo < .06 ? 'très sombre' : 'couleur reprise de la photo'}`);
  return lines;
}
