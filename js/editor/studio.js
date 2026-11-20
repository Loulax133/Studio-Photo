// Le studio 3D : fond papier, mannequin, lumières, réflecteurs, appareil photo.
// Photométrie simplifiée mais cohérente :
//  - flash : nombre guide ≈ 3,2·√Ws (réflecteur standard, ISO 100), dépend de l'ISO et de l'ouverture
//  - continu : ≈ 150 lux à 1 m par watt (réflecteur), dépend de l'ISO, de l'ouverture et de la vitesse
// Une exposition « juste » donne un éclairement de π dans les unités Three (blanc diffus = 1).
import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/RectAreaLightUniformsLib.js';
import { MODS, FORMATS } from './defaults.js';
import { buildMannequin } from './mannequin.js';

RectAreaLightUniformsLib.init();
const HELP = 1;           // calque des aides (invisible dans le rendu)
const RECT_K = 1;         // calibrage lumière de surface (ajusté par mesure)
const DEG = Math.PI / 180;

export function kelvinRGB(k) {
  const t = k / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.47 * Math.log(t) - 161.12; b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04; }
  else { r = 329.7 * Math.pow(t - 60, -0.1332); g = 288.12 * Math.pow(t - 60, -0.0755); b = 255; }
  const c = x => Math.min(255, Math.max(0, x)) / 255;
  return new THREE.Color().setRGB(c(r), c(g), c(b), THREE.SRGBColorSpace);
}
function lightColor(k, wb) {
  const a = kelvinRGB(k), w = kelvinRGB(wb);
  const c = new THREE.Color(a.r / w.r, a.g / w.g, a.b / w.b);
  const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  return c.multiplyScalar(1 / lum);
}
const onLayer = (o, l) => o.traverse(x => x.layers.set(l));

/* ---------- géométries des modeleurs ---------- */
const M = {
  black: new THREE.MeshStandardMaterial({ color: '#1b1b1b', roughness: .6, metalness: .2 }),
  metal: new THREE.MeshStandardMaterial({ color: '#9a9a9a', roughness: .35, metalness: .8 }),
  white: new THREE.MeshStandardMaterial({ color: '#f2f2f2', roughness: .8, side: THREE.DoubleSide }),
  silver: new THREE.MeshStandardMaterial({ color: '#d9d9d9', roughness: .25, metalness: .9, side: THREE.DoubleSide }),
  stand: new THREE.MeshStandardMaterial({ color: '#2a2a2a', roughness: .5, metalness: .5 }),
};
function frustum(w, h, depth, sides) {
  const r = 0.5, geo = new THREE.CylinderGeometry(0.09, r, depth, sides, 1, true);
  geo.rotateX(-Math.PI / 2); if (sides === 4) geo.rotateZ(Math.PI / 4);
  geo.translate(0, 0, -depth / 2);
  const k = sides === 4 ? Math.SQRT2 : 2;
  geo.scale(w / (r * k) * (sides === 4 ? 1 : 1), h / (r * k), 1);
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

/* ---------- le studio ---------- */
export class Studio {
  constructor(canvas) {
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.items = new Map();
    this.data = null;

    // caméras
    this.view = new THREE.PerspectiveCamera(40, 1, 0.05, 100);
    this.view.layers.enable(HELP);
    this.shot = new THREE.PerspectiveCamera(20, 0.8, 0.05, 60);

    // ambiance du studio (rebonds murs/plafond) + aide de visualisation (vue de travail uniquement)
    this.ambient = new THREE.HemisphereLight('#ffffff', '#8a8a86', 0.1); this.scene.add(this.ambient);
    this.aid = new THREE.HemisphereLight('#ffffff', '#cfcfcc', 0.9); this.aid.layers.set(HELP); this.scene.add(this.aid);

    // sol du studio
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#c2c2be', roughness: 1 }));
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
    const m = this.data.model, key = m.gender + m.skin;
    if (this.modelKey !== key) {
      if (this.model) { this.scene.remove(this.model); this.model.traverse(o => o.geometry?.dispose()); }
      this.model = buildMannequin(m); this.modelKey = key;
      this.model.traverse(o => { if (o.isMesh) o.userData.pick = { kind: 'model' }; });
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

  syncItems() {
    if (!this.data) return;
    const seen = new Set();
    for (const it of this.data.items) {
      seen.add(it.id);
      let o = this.items.get(it.id);
      const sig = it.type + (it.mod || it.finish) + (it.small ? 's' : '');
      if (!o || o.sig !== sig) { if (o) this._disposeItem(o); o = this._buildItem(it); o.sig = sig; this.items.set(it.id, o); }
      this._placeItem(o, it);
    }
    for (const [id, o] of this.items) if (!seen.has(id)) { this._disposeItem(o); this.items.delete(id); }
    this.recompute();
  }
  _buildItem(it) {
    const o = { root: new THREE.Group(), head: new THREE.Group(), stand: null, spot: null, rect: null, emit: null, cone: null };
    o.root.add(o.head);
    if (it.type === 'light') {
      o.head.add(headMesh(it.mod, it.small));
      const m = MODS[it.mod];
      o.emit = new THREE.Mesh(emitterGeo(it.mod), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide }));
      o.emit.position.z = it.mod === 'umb_silver' ? 0.42 : 0.003; if (it.mod === 'umb_silver') o.emit.visible = false;
      o.head.add(o.emit);
      const spot = o.spot = new THREE.SpotLight(0xffffff, 1, 0, Math.min(85, m.angle / 2) * DEG, m.pen, 2);
      spot.castShadow = true;
      spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = .15; spot.shadow.camera.far = 20;
      spot.shadow.radius = m.soft; spot.shadow.bias = -0.0006; spot.shadow.normalBias = 0.02;
      this.scene.add(spot, spot.target);
      if (m.area) { o.rect = new THREE.RectAreaLight(0xffffff, 1, m.area[0] * (m.shape === 'round' ? .886 : 1), m.area[1] * (m.shape === 'round' ? .886 : 1)); this.scene.add(o.rect); }
      // cône d'aide
      const cg = new THREE.ConeGeometry(Math.tan(Math.min(80, m.angle / 2) * DEG) * 0.6, 0.6, 24, 1, true).rotateX(-Math.PI / 2).translate(0, 0, .3);
      o.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: .07, depthWrite: false, side: THREE.DoubleSide }));
      onLayer(o.cone, HELP); o.head.add(o.cone);
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
    o.root.traverse(x => { if (x.isMesh && x !== o.emit && x !== o.cone) { x.castShadow = it.type === 'refl'; x.receiveShadow = true; } });
    o.root.traverse(x => { x.userData.pick = { kind: 'item', id: it.id }; });
    this.scene.add(o.root);
    return o;
  }
  _placeItem(o, it) {
    const vflat = it.finish === 'vwhite' || it.finish === 'vblack';
    const y = vflat ? 1 : it.y;
    o.root.position.set(it.x, 0, it.z);
    o.head.position.set(0, y, 0);
    if (o.stand) o.root.remove(o.stand);
    if (!vflat) { o.stand = standMesh(Math.max(.2, y - .05)); o.stand.traverse(x => { x.userData.pick = { kind: 'item', id: it.id }; }); o.root.add(o.stand); }
    const target = this.aimPoint(it.aim);
    const hp = new THREE.Vector3(it.x, y, it.z);
    if (vflat) { const t = target.clone(); t.y = 1; o.head.lookAt(t); }
    else o.head.lookAt(target);
    o.target = target; o.pos = hp;
    o.dir = target.clone().sub(hp).normalize();
    if (vflat) { o.dir.y = 0; o.dir.normalize(); }
    if (o.spot) {
      o.spot.position.copy(hp).addScaledVector(o.dir, 0.02);
      o.spot.target.position.copy(target);
      o.spot.target.updateMatrixWorld();
    }
    if (o.rect) {
      const off = vflat ? -0.1 : 0.03;
      o.rect.position.copy(hp).addScaledVector(o.dir, off);
      o.rect.lookAt(o.rect.position.clone().add(o.dir));
    }
  }
  _disposeItem(o) {
    this.scene.remove(o.root); if (o.spot) { this.scene.remove(o.spot, o.spot.target); o.spot.shadow.map?.dispose(); o.spot.dispose(); }
    if (o.rect) this.scene.remove(o.rect);
    o.root.traverse(x => x.geometry?.dispose());
  }

  /* ----- photométrie ----- */
  cameraGain(kind) {
    const c = this.data.camera;
    const iso = c.iso / 100, ap = 1 / (c.f * c.f);
    return kind === 'flash' ? iso * ap : iso * ap * c.shutter;
  }
  // intensité sur l'axe en candela "Three" (avant répartition spot / surface)
  axisIntensity(it) {
    const m = MODS[it.mod];
    if (it.kind === 'flash') return Math.PI * 10.24 * it.power * m.eff * this.cameraGain('flash');
    const zoomGain = it.mod === 'fresnel' ? Math.pow(30 / (it.zoom || 30), 1.6) : 1;
    return Math.PI * 150 * it.power * m.eff * zoomGain * this.cameraGain('cont') / 250;
  }
  recompute() {
    if (!this.data) return;
    const wb = this.data.camera.wb || 5600;
    let flux = 0;
    // lumières
    for (const it of this.data.items) {
      const o = this.items.get(it.id); if (!o || it.type !== 'light') continue;
      const m = MODS[it.mod], I = this.axisIntensity(it), col = lightColor(it.kelvin || 5600, wb);
      const frac = m.area ? m.frac : 0;
      o.spot.color.copy(col); o.spot.intensity = I * (1 - frac);
      if (it.mod === 'fresnel') { o.spot.angle = (it.zoom || 30) / 2 * DEG; }
      if (o.rect) { const A = o.rect.width * o.rect.height; o.rect.color.copy(col); o.rect.intensity = I * frac / A / RECT_K; }
      // luminance visible de la surface émettrice (pour le rendu)
      const ea = m.area ? m.area[0] * m.area[1] : (it.mod === 'snoot' ? .002 : .018);
      o.emit.material.color.copy(col).multiplyScalar(Math.min(60, I / ea / 3));
      o.I = I; flux += I;
    }
    // réflecteurs : éclairement reçu → rebond diffus
    for (const it of this.data.items) {
      const o = this.items.get(it.id); if (!o || it.type !== 'refl' || !o.rect) continue;
      const n = o.dir; let E = 0; const c = new THREE.Color(0, 0, 0);
      for (const lt of this.data.items) {
        const lo = this.items.get(lt.id); if (!lo || lt.type !== 'light') continue;
        const toR = o.pos.clone().sub(lo.pos); const d2 = Math.max(.25, toR.lengthSq()); toR.normalize();
        const cosR = Math.max(0, -toR.dot(n));
        const ang = Math.acos(Math.min(1, toR.dot(lo.dir))), half = Math.min(85, MODS[lt.mod].angle / 2) * DEG;
        const cone = ang < half ? 1 : Math.max(0, 1 - (ang - half) / (20 * DEG));
        const e = lo.I * cone * cosR / d2; E += e; c.add(lo.spot.color.clone().multiplyScalar(e));
      }
      const rho = { white: .8, silver: 1.15, gold: 1.05, vwhite: .8 }[it.finish] || .8;
      const tint = it.finish === 'gold' ? new THREE.Color(1.0, .78, .45) : new THREE.Color(1, 1, 1);
      if (E > 0) c.multiplyScalar(1 / E); else c.set(1, 1, 1);
      o.rect.color.copy(c).multiply(tint);
      o.rect.intensity = E * rho / Math.PI / RECT_K;
      flux += E * 0.4;
    }
    // ambiance (rebonds sur murs / plafond / papier)
    const wall = this.data.studio.walls === 'light' ? 0.05 : 0.012;
    const paperL = this.paperMat.color.r * .3 + this.paperMat.color.g * .6 + this.paperMat.color.b * .1;
    this.ambient.intensity = flux / 9 * (wall + 0.02 * paperL);
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
  // ouverture conseillée par la cellule (incidente, au visage) pour une lumière donnée ou toutes
  meter(onlyId) {
    const c = this.data.camera, face = this.aimPoint('face');
    let E = 0;
    for (const it of this.data.items) {
      if (onlyId && it.id !== onlyId) continue;
      const o = this.items.get(it.id); if (!o) continue;
      if (it.type === 'light') {
        const v = face.clone().sub(o.pos), d2 = Math.max(.04, v.lengthSq()); v.normalize();
        const ang = Math.acos(Math.min(1, v.dot(o.dir))), half = Math.min(85, MODS[it.mod].angle / 2) * DEG;
        const cone = ang < half * (1 - MODS[it.mod].pen * .5) ? 1 : Math.max(0, 1 - (ang - half * (1 - MODS[it.mod].pen * .5)) / Math.max(.05, half * MODS[it.mod].pen));
        E += o.I * cone / d2;
      } else if (o.rect) {
        const v = face.clone().sub(o.pos), d2 = Math.max(.04, v.lengthSq());
        E += o.rect.intensity * RECT_K * o.rect.width * o.rect.height / d2;
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
  render(rect) {
    const r = this.renderer, [W, H] = this.size;
    r.setScissorTest(false); r.setViewport(0, 0, W, H);
    this.scene.background = new THREE.Color('#ffffff');
    this.camBody.visible = true;
    r.render(this.scene, this.view);
    if (rect && rect.w > 4) {
      r.setScissorTest(true);
      const y = H - rect.y - rect.h;
      r.setScissor(rect.x, y, rect.w, rect.h); r.setViewport(rect.x, y, rect.w, rect.h);
      this.scene.background = this.wallColor;
      r.render(this.scene, this.shot);
      if (this.wantHist) { this.wantHist = false; this._histogram(rect.x, y, rect.w, rect.h); }
      r.setScissorTest(false);
    }
  }
  // histogramme du rendu : lu directement dans l'image affichée (après tone mapping)
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
  // rendu haute définition dans un canvas séparé (export / vignette)
  capture(longEdge = 2400, type = 'image/jpeg', q = .92) {
    const r = this.renderer, [W, H] = this.size, pr = r.getPixelRatio();
    const a = this.shot.aspect, w = a >= 1 ? longEdge : Math.round(longEdge * a), h = a >= 1 ? Math.round(longEdge / a) : longEdge;
    r.setPixelRatio(1); r.setSize(w, h, false);
    r.setScissorTest(false); r.setViewport(0, 0, w, h);
    this.scene.background = this.wallColor;
    r.render(this.scene, this.shot);
    const url = r.domElement.toDataURL(type, q);
    r.setPixelRatio(pr); r.setSize(W, H, false);
    return url;
  }
  pickables() { const a = [this.camBody, this.targetMark]; if (this.model) a.push(this.model); for (const o of this.items.values()) a.push(o.root); return a; }
  dispose() { for (const o of this.items.values()) this._disposeItem(o); this.renderer.dispose(); }
}
