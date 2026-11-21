// Le studio 3D : fond papier, mannequin, lumières, réflecteurs, appareil photo.
// Photométrie simplifiée mais cohérente :
//  - flash : nombre guide ≈ 3,2·√Ws (réflecteur standard, ISO 100), dépend de l'ISO et de l'ouverture
//  - continu : ≈ 150 lux à 1 m par watt (réflecteur), dépend de l'ISO, de l'ouverture et de la vitesse
// Une exposition « juste » donne un éclairement de π dans les unités Three (gris 18 % → 0,18).
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/RectAreaLightUniformsLib.js';
import { MODS, FORMATS, GELS } from './defaults.js';
import { buildMannequin, buildRealistic } from './mannequin.js';

RectAreaLightUniformsLib.init();
const HELP = 1;           // calque des aides (invisible dans le rendu)
const DEG = Math.PI / 180;
const SENSOR_H = 24;      // plein format (mm), côté court

/* ---------- courbe de rendu « boîtier » ----------
   Linéaire jusqu'à 0,7 (≈ +2 IL au-dessus du gris moyen), épaule douce, blanc pur à 1,3 (≈ +2,85 IL).
   Une surexposition à la cellule se voit donc vraiment dans l'image et l'histogramme. */
const CURVE_GLSL = `
float lsCurve1( float x ) { if ( x < 0.7 ) return max( x, 0.0 ); float t = clamp( ( x - 0.7 ) / 0.6, 0.0, 1.0 ); return 0.7 + 0.3 * ( 1.0 - ( 1.0 - t ) * ( 1.0 - t ) ); }
vec3 lsCurve( vec3 c ) { return vec3( lsCurve1( c.r ), lsCurve1( c.g ), lsCurve1( c.b ) ); }`;
THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  CURVE_GLSL + '\nvec3 CustomToneMapping( vec3 color ) { return lsCurve( color * toneMappingExposure ); }');

export function kelvinRGB(k) {
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = x => Math.min(255, Math.max(0, x)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}
const lumOf = c => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function lightColor(k, wb) {
  const a = kelvinRGB(k), w = kelvinRGB(wb);
  const c = new THREE.Color(a.r / w.r, a.g / w.g, a.b / w.b);
  return c.multiplyScalar(1 / lumOf(c));
}
// transmission d'une gélatine (couleur linéaire) : sa luminance = perte de lumière
export function gelTransmission(key) {
  const g = GELS[key]; if (!g || !g.k && !g.rgb) return new THREE.Color(1, 1, 1);
  if (g.k) { const a = kelvinRGB(g.k[0]), b = kelvinRGB(g.k[1]); const c = new THREE.Color(a.r / b.r, a.g / b.g, a.b / b.b); const m = Math.max(c.r, c.g, c.b); return c.multiplyScalar(g.t / m); }
  return new THREE.Color().setRGB(...g.rgb, THREE.SRGBColorSpace);
}
const onLayer = (o, l) => o.traverse(x => x.layers.set(l));

/* ---------- gobos (projections) ---------- */
const goboCache = {};
function goboTexture(kind) {
  if (goboCache[kind]) return goboCache[kind];
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, S, S); x.fillStyle = '#fff';
  if (kind === 'window') { const m = 10; for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) x.fillRect(28 + i * 104 + m / 2, 18 + j * 74 + m / 2, 100 - m, 70 - m); }
  else if (kind === 'blinds') { for (let i = 0; i < 12; i++) x.fillRect(16, 12 + i * 20, S - 32, 11); }
  else if (kind === 'dots') { for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) { x.beginPath(); x.arc(20 + i * 27, 20 + j * 27, 7, 0, Math.PI * 2); x.fill(); } }
  else if (kind === 'leaves') {
    x.fillRect(0, 0, S, S); x.fillStyle = '#000'; let s = 7;
    const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    for (let i = 0; i < 70; i++) { x.beginPath(); x.ellipse(rnd() * S, rnd() * S, 8 + rnd() * 26, 5 + rnd() * 14, rnd() * Math.PI, 0, Math.PI * 2); x.fill(); }
    x.filter = 'blur(3px)'; x.drawImage(c, 0, 0); x.filter = 'none';
  }
  // bord circulaire du faisceau
  const g = x.createRadialGradient(S / 2, S / 2, S * .38, S / 2, S / 2, S * .5); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)');
  x.globalCompositeOperation = 'source-atop'; x.fillStyle = g; x.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return goboCache[kind] = t;
}

/* ---------- géométries des modeleurs ---------- */
const M = {
  black: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: .6, metalness: .2 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: .35, metalness: .8 }),
  white: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: .8, side: THREE.DoubleSide }),
  silver: new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: .25, metalness: .9, side: THREE.DoubleSide }),
  stand: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: .5, metalness: .5 }),
  frame: new THREE.MeshStandardMaterial({ color: '#e9e9e6', roughness: .7 }),
};
function frustum(w, h, depth, sides) {
  const r = 0.5, geo = new THREE.CylinderGeometry(0.09, r, depth, sides, 1, true);
  geo.rotateX(-Math.PI / 2); if (sides === 4) geo.rotateZ(Math.PI / 4);
  geo.translate(0, 0, -depth / 2);
  const k = sides === 4 ? Math.SQRT2 : 2;
  geo.scale(w / (r * k), h / (r * k), 1);
  return geo;
}
function emitterGeo(mod) {
  const m = MODS[mod];
  if (!m.area) return new THREE.CircleGeometry(mod === 'snoot' ? 0.025 : mod === 'bare_small' ? 0.035 : 0.075, 24);
  const [w, h] = m.area;
  if (m.shape === 'round') { const g = new THREE.CircleGeometry(0.5, mod === 'octa' ? 8 : 32); g.scale(w, h, 1); if (mod === 'octa') g.rotateZ(Math.PI / 8); return g; }
  return new THREE.PlaneGeometry(w, h);
}
function headMesh(mod, small) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(small ? .07 : .13, small ? .05 : .14, small ? .09 : .26), M.black);
  body.position.z = small ? -0.06 : -0.2; g.add(body);
  const m = MODS[mod];
  let shell = null;
  if (mod === 'softbox' || mod === 'strip' || mod === 'panel') {
    const [w, h] = m.area; const d = mod === 'panel' ? .05 : mod === 'strip' ? .3 : .38;
    shell = new THREE.Mesh(mod === 'panel' ? new THREE.BoxGeometry(w + .02, h + .02, d).translate(0, 0, -d / 2) : frustum(w, h, d, 4), M.black);
    if (mod === 'panel') body.visible = false;
  } else if (mod === 'window') {
    body.visible = false;
    const [w, h] = m.area, t = .05;
    for (const [x, y, ww, hh] of [[0, h / 2, w + t, t], [0, -h / 2, w + t, t], [-w / 2, 0, t, h], [w / 2, 0, t, h], [0, 0, .03, h], [0, h / 6, w, .03], [0, -h / 6, w, .03]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(ww, hh, .06), M.frame); b.position.set(x, y, .01); g.add(b);
    }
    shell = new THREE.Mesh(new THREE.BoxGeometry(w + .3, h + .3, .02).translate(0, 0, -.04), new THREE.MeshStandardMaterial({ color: '#bdbdb9', roughness: .9 }));
  } else if (mod === 'octa') shell = new THREE.Mesh(frustum(1.2, 1.2, .55, 8), M.black);
  else if (mod === 'beauty') { shell = new THREE.Mesh(new THREE.CylinderGeometry(.275, .08, .14, 40, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.07), M.white); const d = new THREE.Mesh(new THREE.CircleGeometry(.07, 24), M.metal); d.position.z = -.02; g.add(d); }
  else if (mod === 'umb_white' || mod === 'umb_silver') {
    const geo = new THREE.SphereGeometry(.56, 16, 6, 0, Math.PI * 2, 0, .95).rotateX(mod === 'umb_white' ? Math.PI / 2 : -Math.PI / 2);
    shell = new THREE.Mesh(geo, mod === 'umb_white' ? new THREE.MeshStandardMaterial({ color: '#fafafa', roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: .85 }) : M.silver);
    shell.position.z = mod === 'umb_white' ? -0.45 : 0.35;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .9).rotateX(Math.PI / 2), M.stand); shaft.position.z = .1; g.add(shaft);
  } else if (mod === 'snoot') shell = new THREE.Mesh(new THREE.CylinderGeometry(.03, .07, .26, 24, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.13), M.black);
  else if (mod === 'fresnel') { shell = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, .22, 32).rotateX(Math.PI / 2).translate(0, 0, -.11), M.black); body.visible = false; }
  else if (mod === 'tube') { shell = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, 1.22, 16), M.black); body.visible = false; }
  else if (mod !== 'bare_small') shell = new THREE.Mesh(new THREE.CylinderGeometry(.09, .05, .14, 28, 1, true).rotateX(Math.PI / 2).translate(0, 0, -.07), M.metal);
  if (shell) g.add(shell);
  if (mod === 'grid') { const ring = new THREE.Mesh(new THREE.RingGeometry(.06, .092, 28), M.black); ring.position.z = .002; g.add(ring); }
  return g;
}
function standMesh(h) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.014, .018, h, 10), M.stand); pole.position.y = h / 2; g.add(pole);
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3, top = new THREE.Vector3(0, .38, 0), foot = new THREE.Vector3(Math.cos(a) * .34, 0, Math.sin(a) * .34);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, top.distanceTo(foot), 6), M.stand);
    leg.position.copy(top).add(foot).multiplyScalar(.5);
    leg.quaternion.setFromUnitVectors(up, top.clone().sub(foot).normalize()); g.add(leg);
  }
  return g;
}
// faisceau visible dans la brume
const beamMat = () => new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(1, 1, 1) }, uStrength: { value: 0 } },
  vertexShader: `varying float vT; varying vec3 vN; varying vec3 vV;
    void main(){ vT = uv.y; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uColor; uniform float uStrength; varying float vT; varying vec3 vN; varying vec3 vV;
    void main(){ float edge = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float fall = pow(vT, 1.3);
      gl_FragColor = vec4(uColor * uStrength * edge * fall, 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
});

/* ---------- passe finale du rendu : profondeur de champ + courbe + sRGB ---------- */
function postMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: .05 }, uFar: { value: 60 }, uFocus: { value: 3 }, uFocal: { value: .085 }, uAperture: { value: .01 },
      uPxPerM: { value: 10000 }, uMaxCoc: { value: 18 }, uDof: { value: 1 }, uTaps: { value: 40 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `precision highp float;
      uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 uRes;
      uniform float uNear, uFar, uFocus, uFocal, uAperture, uPxPerM, uMaxCoc, uDof, uTaps;
      varying vec2 vUv;
      ${CURVE_GLSL.replace(/lsCurve/g, 'ppCurve')}
      float linDepth(vec2 uv){ float d = texture2D(tDepth, uv).x; float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }
      float coc(vec2 uv){ float D = linDepth(uv); float c = abs(uAperture * uFocal * (D - uFocus) / (D * (uFocus - uFocal))); return min(c * uPxPerM, uMaxCoc); }
      vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
      void main(){
        vec3 col = texture2D(tColor, vUv).rgb;
        if (uDof > 0.5) {
          float c0 = coc(vUv);
          if (c0 > 0.6) {
            vec3 acc = col; float wsum = 1.0;
            const float GA = 2.39996323;
            for (int i = 1; i < 40; i++) {
              if (float(i) >= uTaps) break;
              float fi = float(i); float r = sqrt(fi / uTaps) * uMaxCoc; float a = fi * GA;
              vec2 o = vec2(cos(a), sin(a)) * r;
              vec2 uv = vUv + o / uRes;
              float cs = coc(uv);
              // un échantillon compte s'il est assez flou pour toucher ce pixel (évite les halos du fond sur le net)
              float w = clamp(min(cs, c0) - r + 1.0, 0.0, 1.0);
              acc += texture2D(tColor, uv).rgb * w; wsum += w;
            }
            col = acc / wsum;
          }
        }
        gl_FragColor = vec4(toSRGB(clamp(ppCurve(col), 0.0, 1.0)), 1.0);
      }`,
    depthTest: false, depthWrite: false, toneMapped: false,
  });
}

/* ---------- le studio ---------- */
export class Studio {
  constructor(canvas, { quality = 'precise' } = {}) {
    this.quality = quality;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.CustomToneMapping; r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.items = new Map();
    this.data = null;

    // caméras
    this.view = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.view.layers.enable(HELP);
    this.shot = new THREE.PerspectiveCamera(20, 0.8, 0.25, 40); // near/far serrés : meilleure précision de profondeur

    // rendu de la prise de vue via une cible intermédiaire (profondeur de champ)
    this.rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(4, 4) });
    this.post = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMaterial());
    this.post.frustumCulled = false;
    this.postScene = new THREE.Scene(); this.postScene.add(this.post);
    this.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // ambiance du studio (murs/plafond) + aide de visualisation (vue de travail uniquement)
    this.ambient = new THREE.HemisphereLight('#ffffff', '#8a8a86', 0.1); this.scene.add(this.ambient);
    this.aid = new THREE.HemisphereLight('#ffffff', '#cfcfcc', 0.9); this.aid.layers.set(HELP); this.scene.add(this.aid);
    // rebonds du papier (mur et sol) vers le sujet
    this.bounceWall = new THREE.RectAreaLight(0xffffff, 0, 2.6, 2.4); this.scene.add(this.bounceWall);
    this.bounceFloor = new THREE.RectAreaLight(0xffffff, 0, 2.4, 2); this.bounceFloor.rotation.set(Math.PI / 2, 0, 0); this.scene.add(this.bounceFloor);

    // sol du studio
    this.floorMat = new THREE.MeshStandardMaterial({ color: '#c2c2be', roughness: 1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), this.floorMat);
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; floor.name = 'floor'; this.scene.add(floor);
    const grid = new THREE.GridHelper(16, 32, 0x000000, 0x000000); grid.material.opacity = 0.06; grid.material.transparent = true; grid.position.y = 0.002;
    onLayer(grid, HELP); this.scene.add(grid);

    // fond papier (mur + arrondi + sol)
    this.paperMat = new THREE.MeshStandardMaterial({ color: '#f4f4f2', roughness: .95, side: THREE.DoubleSide });
    this.paper = new THREE.Mesh(this._paperGeo(), this.paperMat);
    this.paper.receiveShadow = true; this.paper.name = 'paper'; this.scene.add(this.paper);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 2.95, 12).rotateZ(Math.PI / 2), M.stand); bar.position.set(0, 3.05, -0.03); this.paper.add(bar);
    for (const sx of [-1, 1]) { const st = standMesh(3.05); st.position.x = sx * 1.47; st.scale.set(.6, 1, .6); this.paper.add(st); }

    // appareil photo (aides)
    this.camBody = new THREE.Group();
    const cb = new THREE.Mesh(new THREE.BoxGeometry(.14, .1, .08), new THREE.MeshStandardMaterial({ color: '#111', roughness: .4 }));
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, .1, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#222', roughness: .3 }));
    lens.position.z = -.08; this.camBody.add(cb, lens);
    const tri = standMesh(1); tri.name = 'tripod'; this.camBody.add(tri);
    this.camBody.userData.pick = { kind: 'camera' }; onLayer(this.camBody, HELP); this.scene.add(this.camBody);
    this.frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x2f6bff, transparent: true, opacity: .55 }));
    onLayer(this.frustum, HELP); this.scene.add(this.frustum);
    this.targetMark = new THREE.Mesh(new THREE.SphereGeometry(.03, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2f6bff }));
    this.targetMark.userData.pick = { kind: 'target' }; onLayer(this.targetMark, HELP); this.scene.add(this.targetMark);
    this.fog = new THREE.FogExp2(0x333333, 0);
  }

  _paperGeo() {
    // profil : mur vertical (3 m) → arrondi (r 0,6) → sol (3,5 m vers l'avant)
    const pts = [], R = .6;
    pts.push([0, 3]); pts.push([0, R]);
    for (let i = 1; i < 12; i++) { const a = i / 12 * Math.PI / 2; pts.push([R - Math.cos(a) * R, R - Math.sin(a) * R]); }
    pts.push([R, 0]); pts.push([3.5, 0]);
    const W = 2.72, pos = [], idx = [];
    pts.forEach(([z, y], i) => { pos.push(-W / 2, y + .003, z, W / 2, y + .003, z); if (i) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } });
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  /* ----- application des données ----- */
  load(data) {
    this.data = data;
    this.applyBackground(); this.applyModel(); this.syncItems(); this.applyCamera();
  }
  applyBackground() {
    const d = this.data;
    this.paperMat.color.set(d.background.color);
    this.paper.position.z = -d.model.distance;
    this.wallColor = new THREE.Color(d.studio.walls === 'light' ? '#c8c8c4' : '#2a2a29');
    this.recompute();
  }
  applyModel() {
    const m = this.data.model, style = m.style === 'real' ? 'real' : 'mannequin', key = style + m.gender + m.skin + (m.hair || '');
    if (this.modelKey !== key) {
      if (this.model) { this.scene.remove(this.model); if (this.model.userData.procedural) this.model.traverse(o => o.geometry?.dispose()); }
      if (style === 'real') {
        // chargement asynchrone : on réaligne les lumières une fois le modèle prêt
        this.model = buildRealistic(m, () => { if (this.modelKey === key) { this.syncItems(); this.onModelReady?.(); } });
      } else {
        this.model = buildMannequin(m); this.model.userData.procedural = true;
        this.model.traverse(o => { if (o.isMesh) o.userData.pick = { kind: 'model' }; });
      }
      this.modelKey = key;
      this.scene.add(this.model);
    }
    this.model.rotation.y = (m.rot || 0) * DEG;
    this.paper.position.z = -m.distance;
    this.syncItems();
  }
  aimPoint(aim) {
    const u = this.model?.userData || { headY: 1.58, chestY: 1.25 };
    if (aim === 'chest') return new THREE.Vector3(0, u.chestY, 0);
    if (aim === 'bg') return new THREE.Vector3(0, 1.3, -this.data.model.distance);
    return new THREE.Vector3(0, u.headY, 0.03);
  }

  // nombre d'échantillons d'ombre par grande source, dans la limite des textures du GPU
  _shadowBudget() {
    const lights = this.data.items.filter(i => i.type === 'light');
    const areas = lights.filter(i => MODS[i.mod].area).length, hard = lights.length - areas;
    if (this.quality !== 'precise' || !areas) return 1;
    return Math.max(1, Math.min(4, Math.floor((8 - hard) / areas)));
  }
  syncItems() {
    if (!this.data) return;
    const seen = new Set(), N = this._shadowBudget();
    for (const it of this.data.items) {
      seen.add(it.id);
      let o = this.items.get(it.id);
      const n = it.type === 'light' && MODS[it.mod].area ? N : 1;
      const sig = it.type + (it.mod || it.finish) + (it.small ? 's' : '') + n + (it.gobo || '');
      if (!o || o.sig !== sig) { if (o) this._disposeItem(o); o = this._buildItem(it, n); o.sig = sig; this.items.set(it.id, o); }
      this._placeItem(o, it);
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { this._disposeItem(o); this.items.delete(id); }
    this.recompute();
  }
  _buildItem(it, n = 1) {
    const o = { root: new THREE.Group(), head: new THREE.Group(), stand: null, spots: [], spot: null, rect: null, emit: null, cone: null, beam: null, n };
    o.root.add(o.head);
    if (it.type === 'light') {
      o.head.add(headMesh(it.mod, it.small));
      const m = MODS[it.mod];
      o.emit = new THREE.Mesh(emitterGeo(it.mod), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      o.emit.position.z = it.mod === 'umb_silver' ? 0.42 : 0.003; if (it.mod === 'umb_silver') o.emit.visible = false;
      o.head.add(o.emit);
      // grande source : n spots répartis sur la surface → pénombre réaliste (plus douce loin du sujet)
      const [aw, ah] = m.area || [0, 0];
      const offs = n === 4 ? [[-.3, -.3], [.3, -.3], [-.3, .3], [.3, .3]] : n === 3 ? [[-.32, -.2], [.32, -.2], [0, .3]] : n === 2 ? (aw >= ah ? [[-.3, 0], [.3, 0]] : [[0, -.3], [0, .3]]) : [[0, 0]];
      for (const [ox, oy] of offs) {
        const spot = new THREE.SpotLight(0xffffff, 1, 0, Math.min(85, m.angle / 2) * DEG, m.pen, 2);
        spot.castShadow = true;
        const sz = n > 1 ? 512 : 1024;
        spot.shadow.mapSize.set(sz, sz); spot.shadow.camera.near = .15; spot.shadow.camera.far = 20;
        spot.shadow.radius = n > 1 ? Math.max(1.5, m.soft / (n === 4 ? 3.5 : 2.5)) : m.soft;
        spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.02;
        spot.userData.off = new THREE.Vector3(ox * aw, oy * ah, 0.02);
        if (it.gobo && !m.area) spot.map = goboTexture(it.gobo);
        this.scene.add(spot, spot.target); o.spots.push(spot);
      }
      o.spot = o.spots[0];
      if (m.area) { o.rect = new THREE.RectAreaLight(0xffffff, 1, m.area[0] * (m.shape === 'round' ? .886 : 1), m.area[1] * (m.shape === 'round' ? .886 : 1)); this.scene.add(o.rect); }
      // cône d'aide (vue de travail)
      const cg = new THREE.ConeGeometry(Math.tan(Math.min(80, m.angle / 2) * DEG) * 0.6, 0.6, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, .3);
      o.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }));
      onLayer(o.cone, HELP); o.head.add(o.cone);
      // faisceau dans la brume
      const L = 4, half = Math.min(75, (it.mod === 'fresnel' ? (it.zoom || 30) : m.angle) / 2) * DEG;
      const bg = new THREE.ConeGeometry(Math.tan(half) * L, L, 32, 1, true).rotateX(-Math.PI / 2).translate(0, 0, L / 2);
      o.beam = new THREE.Mesh(bg, beamMat()); o.beam.visible = false; o.beam.renderOrder = 10; o.head.add(o.beam);
    } else {
      const f = it.finish;
      if (f === 'vwhite' || f === 'vblack') {
        const mat = new THREE.MeshStandardMaterial({ color: f === 'vwhite' ? '#f0f0ee' : '#141414', roughness: .95, side: THREE.DoubleSide });
        for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(1, 2, .04), mat); p.position.set(s * .35, 0, -.35); p.rotation.y = -s * Math.PI / 4; o.head.add(p); }
        if (f === 'vwhite') { o.rect = new THREE.RectAreaLight(0xffffff, 0, 1.3, 2); this.scene.add(o.rect); }
      } else if (f === 'flag') {
        const p = new THREE.Mesh(new THREE.BoxGeometry(.6, .9, .015), new THREE.MeshStandardMaterial({ color: '#141414', roughness: .95 })); o.head.add(p);
      } else {
        const mat = f === 'white' ? new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: .9, side: THREE.DoubleSide })
          : new THREE.MeshStandardMaterial({ color: f === 'gold' ? '#e2b765' : '#dcdcdc', roughness: .3, metalness: .85, side: THREE.DoubleSide });
        const disc = new THREE.Mesh(new THREE.CircleGeometry(.4, 40), mat); o.head.add(disc);
        const rim = new THREE.Mesh(new THREE.TorusGeometry(.4, .008, 6, 48), M.black); o.head.add(rim);
        o.rect = new THREE.RectAreaLight(0xffffff, 0, .71, .71); this.scene.add(o.rect);
      }
    }
    o.root.traverse(x => { if (x.isMesh && x !== o.emit && x !== o.cone && x !== o.beam) { x.castShadow = it.type === 'refl'; x.receiveShadow = true; } });
    o.root.traverse(x => { if (x !== o.beam) x.userData.pick = { kind: 'item', id: it.id }; });
    this.scene.add(o.root);
    return o;
  }
  _placeItem(o, it) {
    const vflat = it.finish === 'vwhite' || it.finish === 'vblack', window = it.mod === 'window';
    const y = vflat ? 1 : it.y;
    o.root.position.set(it.x, 0, it.z);
    o.head.position.set(0, y, 0);
    if (o.stand) o.root.remove(o.stand);
    if (!vflat && !window) {
      // lumière placée devant le sujet en hauteur : pied décalé + perche (girafe) pour ne pas être dans le champ
      const boom = Math.abs(it.x) < .6 && it.z > .2 && y > 1.2;
      if (boom) {
        const g = new THREE.Group(), side = it.x >= 0 ? 1 : -1, bx = side * 1.15, top = y + .18;
        const st = standMesh(top); st.position.x = bx; g.add(st);
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, Math.abs(bx) + .3, 8).rotateZ(Math.PI / 2), M.stand); arm.position.set(bx / 2 - side * .15, top, 0); g.add(arm);
        const drop = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .2, 8), M.stand); drop.position.set(0, y + .08, 0); g.add(drop);
        o.stand = g;
      } else o.stand = standMesh(Math.max(.2, y - .05));
      o.stand.traverse(x => { x.userData.pick = { kind: 'item', id: it.id }; }); o.root.add(o.stand);
    } else o.stand = null;
    const hp = new THREE.Vector3(it.x, y, it.z);
    // visée de base + décalages libres (rotation / inclinaison) pour « feather » la lumière
    const base = this.aimPoint(it.aim), dist = base.distanceTo(hp);
    const d0 = base.clone().sub(hp).normalize();
    let yaw = Math.atan2(d0.x, d0.z) + (it.yaw || 0) * DEG, pitch = Math.asin(THREE.MathUtils.clamp(d0.y, -1, 1)) + (it.pitch || 0) * DEG;
    pitch = THREE.MathUtils.clamp(pitch, -85 * DEG, 85 * DEG);
    const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    if (vflat) { dir.y = 0; dir.normalize(); }
    const target = hp.clone().addScaledVector(dir, Math.max(.5, dist));
    o.head.lookAt(target);
    o.head.updateMatrixWorld(true);
    o.target = target; o.pos = hp; o.dir = dir;
    for (const s of o.spots) {
      s.position.copy(s.userData.off).applyMatrix4(o.head.matrixWorld);
      s.target.position.copy(target).add(s.position).sub(hp);
      s.target.updateMatrixWorld();
    }
    if (o.rect) {
      const off = vflat ? -0.1 : 0.03;
      o.rect.position.copy(hp).addScaledVector(dir, off);
      o.rect.lookAt(o.rect.position.clone().add(dir));
    }
  }
  _disposeItem(o) {
    this.scene.remove(o.root);
    for (const s of o.spots) { this.scene.remove(s, s.target); s.shadow.map?.dispose(); s.dispose(); }
    if (o.rect) this.scene.remove(o.rect);
    o.root.traverse(x => { x.geometry?.dispose(); if (x === o.beam) x.material.dispose(); });
  }

  /* ----- photométrie ----- */
  cameraGain(kind) {
    const c = this.data.camera;
    const iso = c.iso / 100, ap = 1 / (c.f * c.f);
    return kind === 'flash' ? iso * ap : iso * ap * c.shutter;
  }
  // intensité sur l'axe en candela "Three" (avant gélatine et répartition spot / surface)
  axisIntensity(it) {
    const m = MODS[it.mod];
    if (it.kind === 'flash') return Math.PI * 10.24 * it.power * m.eff * this.cameraGain('flash');
    const zoomGain = it.mod === 'fresnel' ? Math.pow(30 / (it.zoom || 30), 1.6) : 1;
    return Math.PI * 150 * it.power * m.eff * zoomGain * this.cameraGain('cont') / 250;
  }
  // éclairement (unités Three) reçu en un point de normale n, sans occultation
  illuminanceAt(p, n, skipId) {
    let E = 0; const col = new THREE.Color(0, 0, 0);
    for (const lt of this.data.items) {
      if (lt.type !== 'light' || lt.id === skipId || lt.off) continue;
      const lo = this.items.get(lt.id); if (!lo || !lo.I || !lo.spots.length) continue;
      const v = p.clone().sub(lo.pos); const d2 = Math.max(.25, v.lengthSq()); v.normalize();
      const cosR = Math.max(0, -v.dot(n));
      const half = Math.min(85, (lt.mod === 'fresnel' ? (lt.zoom || 30) : MODS[lt.mod].angle) / 2) * DEG;
      const ang = Math.acos(THREE.MathUtils.clamp(v.dot(lo.dir), -1, 1));
      const cone = ang < half ? 1 : Math.max(0, 1 - (ang - half) / (20 * DEG));
      const e = lo.I * cone * cosR / d2; E += e; col.add(lo.col.clone().multiplyScalar(e));
    }
    if (E > 0) col.multiplyScalar(1 / E); else col.set(1, 1, 1);
    return { E, col };
  }
  recompute() {
    if (!this.data) return;
    const wb = this.data.camera.wb || 5600;
    let flux = 0;
    // lumières
    for (const it of this.data.items) {
      const o = this.items.get(it.id); if (!o || it.type !== 'light' || !o.spots.length) continue;
      // lumière éteinte : plus d'émission, plus d'ombre, surface émettrice sombre
      for (const sp of o.spots) sp.visible = !it.off;
      if (o.rect) o.rect.visible = !it.off;
      if (o.cone) o.cone.visible = !it.off;
      if (it.off) { o.I = 0; o.col = new THREE.Color(1, 1, 1); o.emit.material.color.set(0x2a2a2a); continue; }
      const m = MODS[it.mod], gel = gelTransmission(it.gel), gl = lumOf(gel);
      const I = this.axisIntensity(it) * gl, col = lightColor(it.kelvin || 5600, wb).multiply(gel).multiplyScalar(1 / Math.max(1e-4, gl));
      const frac = m.area ? m.frac : 0;
      for (const s of o.spots) {
        s.color.copy(col); s.intensity = I * (1 - frac) / o.spots.length;
        if (it.mod === 'fresnel') s.angle = (it.zoom || 30) / 2 * DEG;
      }
      if (o.rect) { const A = o.rect.width * o.rect.height; o.rect.color.copy(col); o.rect.intensity = I * frac / A; }
      // luminance visible de la surface émettrice (pour le rendu)
      const ea = m.area ? m.area[0] * m.area[1] : (it.mod === 'snoot' ? .002 : .018);
      o.emit.material.color.copy(col).multiplyScalar(Math.min(60, I / ea / 3));
      o.I = I; o.col = col; flux += I;
    }
    // réflecteurs : éclairement reçu → rebond diffus
    for (const it of this.data.items) {
      const o = this.items.get(it.id); if (!o || it.type !== 'refl' || !o.rect || o.spots.length) continue;
      const { E, col } = this.illuminanceAt(o.pos, o.dir);
      const rho = { white: .8, silver: 1.15, gold: 1.05, vwhite: .8 }[it.finish] || .8;
      const tint = it.finish === 'gold' ? new THREE.Color(1.0, .78, .45) : new THREE.Color(1, 1, 1);
      o.rect.color.copy(col).multiply(tint);
      o.rect.intensity = E * rho / Math.PI;
      flux += E * 0.4;
    }
    // rebonds du papier : mur derrière le sujet et sol devant lui
    const dist = this.data.model.distance, pc = this.paperMat.color, pl = lumOf(pc);
    const wallP = new THREE.Vector3(0, 1.3, -dist + .04), w = this.illuminanceAt(wallP, new THREE.Vector3(0, 0, 1));
    this.bounceWall.position.copy(wallP); this.bounceWall.lookAt(0, 1.3, 10);
    this.bounceWall.color.copy(w.col).multiply(pc).multiplyScalar(1 / Math.max(1e-4, pl));
    this.bounceWall.intensity = w.E * pl / Math.PI;
    const onPaper = dist < 2.9, fc = onPaper ? pc : this.floorMat.color, fl = lumOf(fc);
    const floorP = new THREE.Vector3(0, .02, .7), f = this.illuminanceAt(floorP, new THREE.Vector3(0, 1, 0));
    this.bounceFloor.position.copy(floorP);
    this.bounceFloor.color.copy(f.col).multiply(fc).multiplyScalar(1 / Math.max(1e-4, fl));
    this.bounceFloor.intensity = f.E * fl / Math.PI;
    // ambiance (murs / plafond du studio)
    const wall = this.data.studio.walls === 'light' ? 0.05 : 0.012;
    this.ambient.intensity = flux / 9 * wall;
    // brume et faisceaux
    const haze = this.data.studio.haze || 0;
    this.fog.density = haze * 0.1;
    this.fog.color.copy(this.wallColor).lerp(new THREE.Color(1, 1, 1), .15).multiplyScalar(Math.min(1, .3 + flux / 40));
    for (const it of this.data.items) {
      const o = this.items.get(it.id); if (!o?.beam || it.type !== 'light') continue;
      o.beam.visible = haze > 0.001 && !it.off;
      o.beam.material.uniforms.uColor.value.copy(o.col);
      o.beam.material.uniforms.uStrength.value = haze * Math.min(1.2, o.I / 25) * 0.35;
    }
  }

  applyCamera() {
    const c = this.data.camera, [fw, fh] = FORMATS[c.format] || FORMATS['4:5'];
    this.shot.fov = 2 * Math.atan(fh / 2 / c.focal) / DEG;
    this.shot.aspect = fw / fh;
    this.shot.position.set(c.x, c.y, c.z);
    this.shot.lookAt(c.tx, c.ty, c.tz);
    this.shot.updateProjectionMatrix(); this.shot.updateMatrixWorld();
    this.camBody.position.copy(this.shot.position); this.camBody.quaternion.copy(this.shot.quaternion);
    const tri = this.camBody.getObjectByName('tripod');
    tri.quaternion.copy(this.shot.quaternion).invert();
    tri.scale.set(1, Math.max(.2, c.y - .06), 1);
    tri.position.set(0, -c.y, 0).applyQuaternion(tri.quaternion);
    this.targetMark.position.set(c.tx, c.ty, c.tz);
    // pyramide de visée
    const d = Math.min(6, this.shot.position.distanceTo(this.targetMark.position));
    const h = Math.tan(this.shot.fov / 2 * DEG) * d, w = h * this.shot.aspect;
    const corners = [[-w, -h], [w, -h], [w, h], [-w, h]].map(([x, y]) => new THREE.Vector3(x, y, -d).applyMatrix4(this.shot.matrixWorld));
    const o = this.shot.position, pts = [];
    for (let i = 0; i < 4; i++) pts.push(o, corners[i], corners[i], corners[(i + 1) % 4]);
    this.frustum.geometry.setFromPoints(pts);
    this.recompute();
  }

  /* ----- mesures ----- */
  subjectDistance() { return this.shot.position.distanceTo(this.aimPoint('face')); }
  focusDistance() { return this.shot.position.distanceTo(this.targetMark.position); }
  // ouverture conseillée par la cellule (incidente, au visage) pour une lumière donnée ou toutes
  // dôme de cellule tourné vers l'appareil : une lumière de face compte entièrement, de profil à moitié, de dos presque pas
  meter(onlyId) {
    const c = this.data.camera, face = this.aimPoint('face');
    const camDir = this.shot.position.clone().sub(face).normalize();
    const dome = p => Math.max(0, 0.5 + 0.5 * p.clone().sub(face).normalize().dot(camDir));
    let E = 0;
    for (const it of this.data.items) {
      if (onlyId && it.id !== onlyId) continue;
      if (it.off) continue;
      const o = this.items.get(it.id); if (!o) continue;
      if (it.type === 'light') {
        const m = MODS[it.mod], v = face.clone().sub(o.pos), d2 = Math.max(.04, v.lengthSq()); v.normalize();
        const half = Math.min(85, (it.mod === 'fresnel' ? (it.zoom || 30) : m.angle) / 2) * DEG;
        const ang = Math.acos(THREE.MathUtils.clamp(v.dot(o.dir), -1, 1)), core = half * (1 - m.pen * .5);
        const cone = ang < core ? 1 : Math.max(0, 1 - (ang - core) / Math.max(.05, half * m.pen));
        E += o.I * cone / d2 * dome(o.pos);
      } else if (o.rect) {
        const v = face.clone().sub(o.pos), d2 = Math.max(.04, v.lengthSq());
        E += o.rect.intensity * o.rect.width * o.rect.height / d2 * dome(o.pos);
      }
    }
    if (E <= 0) return null;
    // E = π ↔ exposition juste à l'ouverture actuelle
    return c.f * Math.sqrt(E / Math.PI);
  }

  /* ----- rendu ----- */
  resize(w, h) {
    this.renderer.setSize(w, h, false);
    this.view.aspect = w / h; this.view.updateProjectionMatrix();
    this.size = [w, h];
  }
  // rendu de la prise de vue dans la zone (x, y bas-gauche, w, h) en pixels CSS du canvas
  _renderShot(x, y, w, h, pr) {
    const r = this.renderer, c = this.data.camera;
    const W = Math.max(1, Math.round(w * pr)), H = Math.max(1, Math.round(h * pr));
    if (this.rt.width !== W || this.rt.height !== H) this.rt.setSize(W, H);
    this.scene.background = this.wallColor;
    this.scene.fog = (this.data.studio.haze || 0) > 0.001 ? this.fog : null;
    r.setRenderTarget(this.rt); r.setScissorTest(false); r.setViewport(0, 0, w, h);
    r.render(this.scene, this.shot);
    r.setRenderTarget(null);
    this.scene.fog = null;
    const u = this.post.material.uniforms, fm = c.focal / 1000;
    u.tColor.value = this.rt.texture; u.tDepth.value = this.rt.depthTexture;
    u.uRes.value.set(W, H); u.uNear.value = this.shot.near; u.uFar.value = this.shot.far;
    u.uFocus.value = Math.max(fm * 2, this.focusDistance()); u.uFocal.value = fm; u.uAperture.value = fm / c.f;
    const fh = (FORMATS[c.format] || FORMATS['4:5'])[1] / 1000; // hauteur du cadre sur le capteur (m)
    u.uPxPerM.value = H / fh; u.uMaxCoc.value = Math.round(H * 0.035);
    u.uDof.value = c.dof === false ? 0 : 1;
    u.uTaps.value = this.hq || this.quality === 'precise' ? 40 : 16;
    r.setScissorTest(true); r.setScissor(x, y, w, h); r.setViewport(x, y, w, h);
    r.render(this.postScene, this.postCam);
    r.setScissorTest(false);
  }
  render(rect) {
    const r = this.renderer, [W, H] = this.size;
    r.setScissorTest(false); r.setViewport(0, 0, W, H);
    this.scene.background = new THREE.Color('#ffffff');
    r.render(this.scene, this.view);
    if (rect && rect.w > 4) {
      const y = H - rect.y - rect.h;
      this._renderShot(rect.x, y, rect.w, rect.h, r.getPixelRatio());
      if (this.wantHist) { this.wantHist = false; this._histogram(rect.x, y, rect.w, rect.h); }
    }
  }
  // histogramme du rendu : lu directement dans l'image affichée (après la courbe)
  _histogram(x, y, w, h) {
    const gl = this.renderer.getContext(), pr = this.renderer.getPixelRatio();
    const X = Math.round(x * pr), Y = Math.round(y * pr), W = Math.round(w * pr), H = Math.round(h * pr);
    const n = W * H * 4;
    if (!this._px || this._px.length < n) this._px = new Uint8Array(n);
    gl.readPixels(X, Y, W, H, gl.RGBA, gl.UNSIGNED_BYTE, this._px);
    const B = 64, lum = new Uint32Array(B), rc = new Uint32Array(B), gc = new Uint32Array(B), bc = new Uint32Array(B);
    let hi = 0, lo = 0, tot = 0;
    const step = Math.max(1, Math.floor((W * H) / 40000)) * 4, px = this._px;
    for (let i = 0; i < n; i += step) {
      const R = px[i], G = px[i + 1], Bl = px[i + 2], L = 0.2126 * R + 0.7152 * G + 0.0722 * Bl;
      lum[L >> 2]++; rc[R >> 2]++; gc[G >> 2]++; bc[Bl >> 2]++; tot++;
      if (R >= 253 || G >= 253 || Bl >= 253) hi++;
      if (L <= 3) lo++;
    }
    this.onHistogram?.({ lum, rc, gc, bc, tot, hi: hi / tot, lo: lo / tot });
  }
  // rendu haute définition (export / vignette / comparaison)
  capture(longEdge = 2400, type = 'image/jpeg', q = .92) {
    const r = this.renderer, [W, H] = this.size, pr = r.getPixelRatio();
    const a = this.shot.aspect, w = a >= 1 ? longEdge : Math.round(longEdge * a), h = a >= 1 ? Math.round(longEdge / a) : longEdge;
    r.setPixelRatio(1); r.setSize(w, h, false);
    this.hq = true; this._renderShot(0, 0, w, h, 1); this.hq = false;
    const url = r.domElement.toDataURL(type, q);
    r.setPixelRatio(pr); r.setSize(W, H, false);
    return url;
  }
  pickables() { const a = [this.camBody, this.targetMark]; if (this.model) a.push(this.model); for (const o of this.items.values()) a.push(o.root); return a; }
  dispose() { for (const o of this.items.values()) this._disposeItem(o); this.rt.dispose(); this.renderer.dispose(); }
}
