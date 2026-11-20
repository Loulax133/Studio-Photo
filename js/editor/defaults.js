// Données du catalogue et scène par défaut (sans dépendance à Three.js)

// Modeleurs : comportement physique simplifié
//  area : taille de la surface émettrice (m) → lumière diffuse + ombres douces
//  frac : part de la lumière émise par la surface (le reste par un spot qui porte les ombres)
//  eff  : rendement sur l'axe par rapport à un réflecteur standard
//  angle: ouverture du faisceau (°), pen: douceur du bord, soft: flou des ombres
export const MODS = {
  standard:   { label: 'Réflecteur standard', angle: 55, pen: .35, eff: 1,    soft: 2 },
  bare_small: { label: 'Tête nue',            angle: 70, pen: .25, eff: .55,  soft: 1.5 },
  grid:       { label: 'Nid d\'abeille 20°',   angle: 22, pen: .9,  eff: 1.3,  soft: 2 },
  snoot:      { label: 'Snoot',               angle: 10, pen: .55, eff: 1.6,  soft: 1.5 },
  beauty:     { label: 'Beauty dish 55',      angle: 75, pen: .7,  eff: .55,  soft: 5,  area: [.55, .55], frac: .25, shape: 'round' },
  softbox:    { label: 'Softbox 60×90',       angle: 95, pen: 1,   eff: .3,   soft: 9,  area: [.6, .9],   frac: .4 },
  octa:       { label: 'Octabox 120',         angle: 105, pen: 1,  eff: .25,  soft: 13, area: [1.2, 1.2], frac: .4, shape: 'round' },
  strip:      { label: 'Stripbox 30×120',     angle: 95, pen: 1,   eff: .25,  soft: 8,  area: [.3, 1.2],  frac: .4 },
  umb_white:  { label: 'Parapluie translucide', angle: 130, pen: 1, eff: .3,  soft: 13, area: [1.05, 1.05], frac: .4, shape: 'round' },
  umb_silver: { label: 'Parapluie argent',    angle: 100, pen: .9, eff: .5,   soft: 9,  area: [1, 1],     frac: .35,  shape: 'round' },
  fresnel:    { label: 'Lentille de Fresnel', angle: 30, pen: .45, eff: 1.4,  soft: 2.5 },
  panel:      { label: 'Panneau LED',         angle: 110, pen: 1,  eff: .45,  soft: 5,  area: [.3, .3],   frac: .45 },
  window:     { label: 'Fenêtre',             angle: 150, pen: 1,  eff: .5,   soft: 12, area: [1.2, 1.6], frac: .55 },
  tube:       { label: 'Tube LED',            angle: 160, pen: 1,  eff: .12,  soft: 6,  area: [.035, 1.2], frac: .6 },
};
export const FLASH_MODS = ['standard', 'grid', 'snoot', 'beauty', 'softbox', 'octa', 'strip', 'umb_white', 'umb_silver'];

// Bibliothèque (menu de gauche)
export const LIBRARY = [
  { section: 'Lumières', items: [
    { key: 'flash', icon: 'flash', label: 'Flash studio', sub: 'Torche · 400 Ws', make: { type: 'light', kind: 'flash', mod: 'standard', power: 400 } },
    { key: 'speedlight', icon: 'flash', label: 'Flash cobra', sub: 'Speedlight · 60 Ws', make: { type: 'light', kind: 'flash', mod: 'bare_small', power: 60, small: true } },
    { key: 'fresnel', icon: 'fresnel', label: 'Fresnel', sub: 'Continu · 300 W', make: { type: 'light', kind: 'cont', mod: 'fresnel', power: 300, kelvin: 3200, zoom: 30 } },
    { key: 'panel', icon: 'panel', label: 'Panneau LED', sub: 'Continu · 100 W', make: { type: 'light', kind: 'cont', mod: 'panel', power: 100 } },
    { key: 'tube', icon: 'tube', label: 'Tube LED', sub: 'Continu · 30 W', make: { type: 'light', kind: 'cont', mod: 'tube', power: 30 } },
    { key: 'window', icon: 'window', label: 'Fenêtre', sub: 'Lumière du jour', make: { type: 'light', kind: 'cont', mod: 'window', power: 500, kelvin: 5600 } },
  ]},
  { section: 'Modeleurs', note: 'Montés sur un flash studio', items: [
    { key: 'softbox', icon: 'softbox', label: 'Softbox', sub: '60 × 90 cm', make: { type: 'light', kind: 'flash', mod: 'softbox', power: 300 } },
    { key: 'octa', icon: 'octa', label: 'Octabox', sub: 'Ø 120 cm', make: { type: 'light', kind: 'flash', mod: 'octa', power: 400 } },
    { key: 'strip', icon: 'strip', label: 'Stripbox', sub: '30 × 120 cm', make: { type: 'light', kind: 'flash', mod: 'strip', power: 300 } },
    { key: 'beauty', icon: 'dish', label: 'Beauty dish', sub: 'Ø 55 cm', make: { type: 'light', kind: 'flash', mod: 'beauty', power: 200 } },
    { key: 'umb_white', icon: 'umbrella', label: 'Parapluie', sub: 'Translucide', make: { type: 'light', kind: 'flash', mod: 'umb_white', power: 300 } },
    { key: 'umb_silver', icon: 'umbrella', label: 'Parapluie', sub: 'Argent', make: { type: 'light', kind: 'flash', mod: 'umb_silver', power: 300 } },
    { key: 'grid', icon: 'grid', label: 'Nid d\'abeille', sub: '20°', make: { type: 'light', kind: 'flash', mod: 'grid', power: 200 } },
    { key: 'snoot', icon: 'snoot', label: 'Snoot', sub: 'Faisceau serré', make: { type: 'light', kind: 'flash', mod: 'snoot', power: 200 } },
  ]},
  { section: 'Réflecteurs & drapeaux', items: [
    { key: 'refl_white', icon: 'reflector', label: 'Réflecteur', sub: 'Blanc · Ø 80', make: { type: 'refl', finish: 'white' } },
    { key: 'refl_silver', icon: 'reflector', label: 'Réflecteur', sub: 'Argent · Ø 80', make: { type: 'refl', finish: 'silver' } },
    { key: 'refl_gold', icon: 'reflector', label: 'Réflecteur', sub: 'Doré · Ø 80', make: { type: 'refl', finish: 'gold' } },
    { key: 'vflat_white', icon: 'vflat', label: 'V-flat', sub: 'Blanc · 1 × 2 m', make: { type: 'refl', finish: 'vwhite' } },
    { key: 'vflat_black', icon: 'vflat', label: 'V-flat', sub: 'Noir · 1 × 2 m', make: { type: 'refl', finish: 'vblack' } },
    { key: 'flag', icon: 'flag', label: 'Drapeau', sub: 'Noir · 60 × 90', make: { type: 'refl', finish: 'flag' } },
  ]},
];

export const BACKGROUNDS = [
  { c: '#f4f4f2', n: 'Blanc' }, { c: '#cfcfcc', n: 'Gris clair' }, { c: '#8d8d8a', n: 'Gris moyen' },
  { c: '#3c3c3b', n: 'Anthracite' }, { c: '#111111', n: 'Noir' }, { c: '#d9c7b0', n: 'Sable' },
  { c: '#9fb3c8', n: 'Bleu ciel' }, { c: '#b84a3a', n: 'Rouge brique' },
];
export const SKINS = { light: { label: 'Caucasienne', c: '#e7c4ab' }, medium: { label: 'Asiatique', c: '#d6ab88' }, dark: { label: 'Foncée', c: '#5e3c2b' } };
export const FOCALS = [14, 20, 24, 28, 35, 40, 50, 70, 85, 90, 100, 105, 135, 200];
export const FORMATS = { '2:3': [24, 36], '4:5': [24, 30], '1:1': [24, 24], '3:2': [36, 24], '16:9': [36, 20.25] };
export const APERTURES = [1.4, 2, 2.8, 4, 5.6, 8, 11, 16, 22];
export const ISOS = [100, 200, 400, 800, 1600];
export const SHUTTERS = [['1/30', 1 / 30], ['1/60', 1 / 60], ['1/125', 1 / 125], ['1/200', 1 / 200], ['1/250', 1 / 250], ['1/500', 1 / 500]];
export const WBS = [3200, 4300, 5600, 6500];

export function defaultScene() {
  return {
    v: 1,
    background: { color: '#f4f4f2' },
    studio: { walls: 'dark' },
    model: { gender: 'f', skin: 'light', distance: 1.8, rot: 0 },
    camera: { x: 0, y: 1.5, z: 3.4, tx: 0, ty: 1.42, tz: 0, focal: 85, format: '4:5', iso: 100, f: 11, shutter: 1 / 125, wb: 5600 },
    items: [
      { id: 'key', type: 'light', kind: 'flash', mod: 'octa', power: 200, kelvin: 5600, x: -1.35, y: 2.3, z: 0.95, aim: 'face' },
      { id: 'refl', type: 'refl', finish: 'white', x: 0.9, y: 1.0, z: 0.75, aim: 'face' },
    ],
  };
}

export const FINISHES = { white: 'Réflecteur blanc', silver: 'Réflecteur argent', gold: 'Réflecteur doré', vwhite: 'V-flat blanc', vblack: 'V-flat noir', flag: 'Drapeau noir' };
export function itemName(it) {
  if (it.type !== 'light') return FINISHES[it.finish] || 'Réflecteur';
  if (it.small) return 'Flash cobra';
  if (it.kind === 'cont') return MODS[it.mod].label;
  return 'Flash studio';
}
export function itemModifier(it) {
  if (it.type === 'light' && it.off) return 'Éteinte';
  if (it.type !== 'light') return (it.yaw || it.pitch) ? `Tourné ${it.yaw || 0}° / ${it.pitch || 0}°` : '—';
  let s = it.small ? 'Tête nue' : it.kind === 'cont' ? (it.mod === 'fresnel' ? `Faisceau ${it.zoom || 30}°` : '') : MODS[it.mod].label;
  const extra = [];
  if (it.gel && GELS[it.gel]) extra.push(GELS[it.gel].label.replace(/ \(.*\)/, ''));
  if (it.gobo && GOBOS[it.gobo]) extra.push('gobo ' + GOBOS[it.gobo].toLowerCase());
  if (extra.length) s = (s ? s + ' + ' : '') + extra.join(' + ');
  return s || '—';
}

// Gélatines : k = [température visée, température d'origine] (correction), rgb = couleur créative (sRGB)
export const GELS = {
  none: { label: 'Aucune' },
  cto_half: { label: 'CTO ½ (orange)', k: [4300, 5600], t: .95 },
  cto: { label: 'CTO (orange)', k: [3200, 5600], t: .95 },
  ctb_half: { label: 'CTB ½ (bleu)', k: [4300, 3200], t: .95 },
  ctb: { label: 'CTB (bleu)', k: [5600, 3200], t: .95 },
  red: { label: 'Rouge', rgb: [1, .12, .1] },
  amber: { label: 'Ambre', rgb: [1, .62, .2] },
  yellow: { label: 'Jaune', rgb: [1, .9, .25] },
  green: { label: 'Vert', rgb: [.25, 1, .3] },
  cyan: { label: 'Cyan', rgb: [.2, .85, 1] },
  blue: { label: 'Bleu', rgb: [.15, .3, 1] },
  violet: { label: 'Violet', rgb: [.55, .25, 1] },
  magenta: { label: 'Magenta', rgb: [1, .2, .75] },
  pink: { label: 'Rose', rgb: [1, .55, .7] },
};
export const GOBOS = { '': 'Aucun', window: 'Fenêtre', blinds: 'Stores', leaves: 'Feuillage', dots: 'Points' };
export const GOBO_MODS = ['standard', 'grid', 'snoot', 'fresnel', 'bare_small'];

// Schémas classiques. p = puissance relative (l'exposition est équilibrée automatiquement à l'application)
const L = (id, mod, p, x, y, z, extra = {}) => ({ id, type: 'light', kind: 'flash', mod, power: p, kelvin: 5600, x, y, z, aim: 'face', ...extra });
const R = (id, finish, x, y, z, extra = {}) => ({ id, type: 'refl', finish, x, y, z, aim: 'face', ...extra });
export const PRESETS = [
  { key: 'rembrandt', label: 'Rembrandt', desc: 'Triangle de lumière sous l\'œil', build: () => ({ items: [L('k', 'softbox', 100, -1.15, 2.3, .7), R('f', 'white', 1, 1, .7)] }) },
  { key: 'loop', label: 'Loop', desc: 'Petite ombre du nez en boucle', build: () => ({ items: [L('k', 'softbox', 100, -.85, 2.2, 1.25), R('f', 'white', .9, 1, .8)] }) },
  { key: 'butterfly', label: 'Papillon', desc: 'Ombre sous le nez, lumière face haute', build: () => ({ items: [L('k', 'beauty', 100, 0, 2.3, 1.15), R('f', 'white', 0, .75, .75, { aim: 'face' })] }) },
  { key: 'clamshell', label: 'Clamshell', desc: 'Beauté : dessus + dessous', build: () => ({ items: [L('k', 'octa', 100, 0, 2.25, 1.05), L('b', 'strip', 30, 0, .75, .95, { aim: 'face' })] }) },
  { key: 'split', label: 'Split', desc: 'Moitié du visage dans l\'ombre', build: () => ({ items: [L('k', 'strip', 100, -1.5, 1.7, .05), R('n', 'vblack', 1.1, 1, .2)] }) },
  { key: 'rim', label: 'Contre-jour', desc: 'Deux strips de découpe + face', build: () => ({ walls: 'dark', bg: '#3c3c3b', items: [L('k', 'octa', 100, -.7, 2.2, 1.45), L('r1', 'strip', 140, -1.2, 1.9, -.65), L('r2', 'strip', 140, 1.2, 1.9, -.65)] }) },
  { key: 'highkey', label: 'High key', desc: 'Fond blanc éclatant', build: d => ({ bg: '#f4f4f2', walls: 'light', items: [L('k', 'octa', 100, 0, 2.35, 1.25), L('b1', 'softbox', 320, -1.15, 1.6, -d + .9, { aim: 'bg' }), L('b2', 'softbox', 320, 1.15, 1.6, -d + .9, { aim: 'bg' }), R('f', 'white', 0, .8, .8)] }) },
  { key: 'lowkey', label: 'Low key', desc: 'Fond noir, lumière sculptée', build: () => ({ bg: '#111111', walls: 'dark', items: [L('k', 'grid', 100, -1.3, 2.05, .55), R('n', 'vblack', 1.1, 1, .3)] }) },
];

// ---------- fichier de set (.lightset) ----------
// { "format": "lightstudio-set", "version": 1, "name": "…", "scene": { background, studio, model, camera, items } }
export const SET_FORMAT = 'lightstudio-set';
const num = (v, d, lo = -Infinity, hi = Infinity) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
export function normalizeScene(src) {
  const def = defaultScene(), s = src && typeof src === 'object' ? src : {};
  const hexOk = c => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);
  const out = {
    v: 1,
    background: { color: hexOk(s.background?.color) ? s.background.color : def.background.color },
    studio: { walls: s.studio?.walls === 'light' ? 'light' : 'dark', haze: num(s.studio?.haze, 0, 0, 1) },
    model: {
      gender: s.model?.gender === 'm' ? 'm' : 'f', skin: SKINS[s.model?.skin] ? s.model.skin : 'light', style: s.model?.style === 'real' ? 'real' : 'mannequin',
      distance: num(s.model?.distance, def.model.distance, .5, 5), rot: num(s.model?.rot, 0, -180, 180),
    },
    camera: { ...def.camera },
    items: [],
  };
  const c = s.camera || {};
  for (const k of ['x', 'y', 'z', 'tx', 'ty', 'tz']) out.camera[k] = num(c[k], def.camera[k], -10, 10);
  out.camera.focal = num(c.focal, 85, 10, 300); out.camera.f = num(c.f, 11, 1, 32); out.camera.iso = num(c.iso, 100, 50, 25600);
  out.camera.shutter = num(c.shutter, 1 / 125, 1 / 8000, 30); out.camera.wb = num(c.wb, 5600, 2500, 10000);
  out.camera.format = FORMATS[c.format] ? c.format : '4:5'; out.camera.dof = c.dof !== false;
  for (const it of Array.isArray(s.items) ? s.items.slice(0, 16) : []) {
    const base = { id: Math.random().toString(36).slice(2, 9), x: num(it.x, 0, -8, 8), y: num(it.y, 1.9, .2, 4.2), z: num(it.z, 1.5, -8, 8),
      aim: ['face', 'chest', 'bg'].includes(it.aim) ? it.aim : 'face', yaw: num(it.yaw, 0, -90, 90), pitch: num(it.pitch, 0, -60, 60) };
    if (it.type === 'refl') { if (FINISHES[it.finish]) out.items.push({ ...base, type: 'refl', finish: it.finish }); continue; }
    const mod = MODS[it.mod] ? it.mod : 'standard';
    const kind = it.kind === 'cont' || ['fresnel', 'panel', 'tube', 'window'].includes(mod) ? 'cont' : 'flash';
    const l = { ...base, type: 'light', kind, mod, power: num(it.power, 200, 5, 3000), kelvin: num(it.kelvin, kind === 'cont' && mod === 'fresnel' ? 3200 : 5600, 2700, 6500) };
    if (it.small || mod === 'bare_small') { l.small = true; l.mod = 'bare_small'; }
    if (mod === 'fresnel') l.zoom = num(it.zoom, 30, 12, 55);
    if (GELS[it.gel] && it.gel !== 'none') l.gel = it.gel;
    if (it.off) l.off = true;
    if (GOBOS[it.gobo] && it.gobo && GOBO_MODS.includes(l.mod)) l.gobo = it.gobo;
    out.items.push(l);
  }
  return out;
}
export function parseSetFile(text) {
  const j = JSON.parse(text);
  if (j && j.format === SET_FORMAT) return { name: String(j.name || 'Set importé').slice(0, 80), scene: normalizeScene(j.scene) };
  if (j && (Array.isArray(j.items) || j.camera)) return { name: 'Set importé', scene: normalizeScene(j) }; // scène seule
  throw new Error('format');
}
export function makeSetFile(name, scene) { return JSON.stringify({ format: SET_FORMAT, version: 1, name, scene }, null, 2); }
