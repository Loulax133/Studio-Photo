// Mannequin procédural : femme / homme, 3 carnations.
// Visage modelé (arcades, orbites, nez, pommettes, lèvres, menton) pour lire
// les schémas classiques : Rembrandt, papillon, split, etc. Yeux brillants pour les catchlights.
import * as THREE from 'three';
import { SKINS } from './defaults.js';

const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, sx, sy) => Math.exp(-(((x - cx) / sx) ** 2) - (((y - cy) / sy) ** 2));

function headGeometry(male) {
  const geo = new THREE.SphereGeometry(1, 160, 120);
  geo.rotateY(-Math.PI / 2); // couture à l'arrière
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    let { x, y, z } = v;
    const front = ss(-0.05, 0.55, z);
    let d = 0;
    d -= 0.11 * g2(Math.abs(x), y, 0.40, 0.11, 0.19, 0.13) * front;            // orbites
    d += (male ? 0.075 : 0.045) * g2(x, y, 0, 0.29, 0.62, 0.075) * front;     // arcades
    const nose = ss(0.24, -0.16, y) * (1 - ss(-0.2, -0.33, y));
    d += (male ? 0.33 : 0.29) * Math.exp(-((x / (0.11 + 0.06 * ss(0, -0.3, y))) ** 2)) * nose * front; // nez
    d += 0.06 * g2(Math.abs(x), y, 0.15, -0.26, 0.07, 0.06) * front;          // ailes du nez
    d += 0.065 * g2(Math.abs(x), y, 0.54, -0.06, 0.2, 0.17) * front;          // pommettes
    d += (male ? 0.05 : 0.075) * g2(x, y, 0, -0.43, 0.26, 0.045) * front;     // lèvre sup.
    d += (male ? 0.05 : 0.07) * g2(x, y, 0, -0.535, 0.24, 0.05) * front;      // lèvre inf.
    d -= 0.03 * g2(x, y, 0, -0.485, 0.25, 0.013) * front;                     // commissure
    d -= 0.03 * g2(x, y, 0, -0.64, 0.2, 0.05) * front;                        // creux sous la lèvre
    d += (male ? 0.1 : 0.07) * g2(x, y, 0, -0.8, 0.24, 0.13) * front;         // menton
    v.multiplyScalar(1 + d);
    // mâchoire et joues
    const jaw = ss(-0.05, -1, y);
    v.x *= 1 - (male ? 0.18 : 0.27) * jaw;
    v.z *= 1 - 0.1 * jaw * ss(0, -1, z);
    v.x *= 1 - 0.05 * ss(0.3, 1, y);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function hairGeometry(male) {
  const geo = new THREE.SphereGeometry(1, 96, 72);
  geo.rotateY(-Math.PI / 2);
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const line = male ? 0.5 : 0.42;
    // dégage le visage avec une transition douce (ligne des cheveux)
    const faceMask = ss(0.0, 0.3, v.z) * (1 - ss(line - 0.07, line + 0.07, v.y + 0.3 * (1 - v.z)));
    const sideMask = male ? ss(0.5, 0.7, Math.abs(v.x)) * (1 - ss(0.0, 0.25, v.y)) * ss(-0.4, -0.1, v.z) : 0;
    v.multiplyScalar(1 - 0.28 * Math.max(faceMask, sideMask));
    if (!male && v.y < 0.2 && v.z < 0.3) { const k = ss(0.3, -0.1, v.z); v.y = v.y - 0.75 * ss(0.2, -1, v.y) * k; v.x *= 1 + 0.04 * k; } // carré
    if (male && v.y < -0.2 && v.z < 0) v.y = -0.2 + (v.y + 0.2) * 0.2;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function limb(a, b, r1, r2, mat) {
  const g = new THREE.Group();
  const len = a.distanceTo(b);
  const cyl = new THREE.Mesh(new THREE.CylinderGeometry(r2, r1, len, 28, 1, true), mat);
  cyl.position.copy(a).add(b).multiplyScalar(0.5);
  cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
  g.add(cyl);
  for (const [pt, r] of [[a, r1], [b, r2]]) { const s = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); s.position.copy(pt); g.add(s); }
  return g;
}
function ellip(rx, ry, rz, mat, pos) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), mat);
  m.scale.set(rx, ry, rz); m.position.copy(pos); return m;
}
function torso(profile, depth, mat) {
  const pts = profile.map(([y, r]) => new THREE.Vector2(r, y));
  const geo = new THREE.LatheGeometry(pts, 48);
  geo.scale(1, 1, depth);
  return new THREE.Mesh(geo, mat);
}
const V = (x, y, z = 0) => new THREE.Vector3(x, y, z);

export function buildMannequin({ gender = 'f', skin = 'light' }) {
  const male = gender === 'm';
  const s = 1; // même taille pour tous les modèles
  const skinC = new THREE.Color(SKINS[skin]?.c || SKINS.light.c);
  const skinMat = new THREE.MeshPhysicalMaterial({
    color: skinC, roughness: 0.52, sheen: 0.35, sheenRoughness: 0.5,
    sheenColor: new THREE.Color(skin === 'dark' ? '#8a5a46' : '#ffb59c'), clearcoat: 0.08, clearcoatRoughness: 0.6,
  });
  const cloth = new THREE.MeshStandardMaterial({ color: '#7d7d7a', roughness: 0.92 });
  const shoe = new THREE.MeshStandardMaterial({ color: '#222222', roughness: 0.55 });
  const hair = new THREE.MeshStandardMaterial({ color: skin === 'light' && !male ? '#4a3426' : '#1d1612', roughness: 0.62 });
  const g = new THREE.Group(); g.name = 'mannequin';
  const body = new THREE.Group(); g.add(body);

  // buste
  const prof = male
    ? [[0.80, 0.0], [0.82, 0.11], [0.88, 0.165], [0.95, 0.172], [1.05, 0.158], [1.12, 0.152], [1.22, 0.168], [1.30, 0.18], [1.37, 0.19], [1.42, 0.185], [1.46, 0.12], [1.48, 0.06], [1.49, 0]]
    : [[0.80, 0.0], [0.82, 0.11], [0.88, 0.17], [0.95, 0.182], [1.03, 0.155], [1.10, 0.128], [1.19, 0.14], [1.27, 0.152], [1.35, 0.158], [1.41, 0.15], [1.45, 0.1], [1.47, 0.05], [1.48, 0]];
  body.add(torso(prof, male ? 0.62 : 0.6, cloth));
  if (!male) for (const sx of [-1, 1]) body.add(ellip(0.068, 0.062, 0.06, cloth, V(sx * 0.058, 1.255, 0.062)));
  // cou
  body.add(limb(V(0, 1.42, -0.01), V(0, 1.53, 0.0), male ? 0.058 : 0.05, male ? 0.054 : 0.046, skinMat));
  // bras
  const sh = male ? 0.205 : 0.175;
  for (const sx of [-1, 1]) {
    const S = V(sx * sh, 1.395), E = V(sx * (sh + 0.035), 1.11, -0.01), W = V(sx * (sh + 0.05), 0.86, 0.03);
    body.add(limb(S, E, male ? 0.05 : 0.043, male ? 0.041 : 0.035, skinMat));
    body.add(limb(E, W, male ? 0.04 : 0.034, male ? 0.029 : 0.025, skinMat));
    const hand = ellip(0.024, 0.085, 0.045, skinMat, V(sx * (sh + 0.055), 0.775, 0.035)); body.add(hand);
    // manche courte
    body.add(limb(V(sx * sh, 1.4), V(sx * (sh + 0.012), 1.3), male ? 0.058 : 0.05, male ? 0.054 : 0.047, cloth));
  }
  // jambes (pantalon)
  for (const sx of [-1, 1]) {
    const H = V(sx * 0.088, 0.88), K = V(sx * 0.098, 0.48, 0.01), A = V(sx * 0.1, 0.085);
    body.add(limb(H, K, male ? 0.092 : 0.09, 0.056, cloth));
    body.add(limb(K, A, 0.054, 0.036, cloth));
    body.add(ellip(0.048, 0.04, 0.125, shoe, V(sx * 0.1, 0.04, 0.055)));
  }
  // tête
  const head = new THREE.Group(); head.name = 'head';
  head.position.set(0, 1.585, 0.012);
  const hs = male ? [0.079, 0.118, 0.1] : [0.074, 0.112, 0.095];
  const face = new THREE.Mesh(headGeometry(male), skinMat); face.scale.set(...hs); head.add(face);
  const hairM = new THREE.Mesh(hairGeometry(male), hair); hairM.scale.set(hs[0] * 1.09, hs[1] * 1.07, hs[2] * 1.08); hairM.position.set(0, 0.006, -0.006); head.add(hairM);
  for (const sx of [-1, 1]) {
    const ear = ellip(0.009, 0.03, 0.018, skinMat, V(sx * hs[0] * 0.98, -0.005, -0.012)); head.add(ear);
    // œil : sclère brillante + iris
    const eye = new THREE.Group();
    eye.position.set(sx * hs[0] * 0.4, hs[1] * 0.105, hs[2] * 0.72);
    const scl = new THREE.Mesh(new THREE.SphereGeometry(0.0118, 32, 24), new THREE.MeshPhysicalMaterial({ color: '#d6cdc3', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.03 }));
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.0072, 24, 16), new THREE.MeshPhysicalMaterial({ color: '#3b2a1f', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.02 }));
    iris.position.z = 0.0084; iris.scale.z = 0.45;
    eye.add(scl, iris); head.add(eye);
  }
  body.add(head);
  body.scale.setScalar(s);
  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData = { headY: 1.585 * s, chestY: 1.25 * s, height: 1.72 * s };
  return g;
}

/* ------------------------------------------------------------------
   Personnage réaliste (MakeHuman CC0, généré par tools/build_human.py)
   - buste HD : tête + épaules subdivisées, peau peinte par sommet
   ------------------------------------------------------------------ */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const MODELS = new URL('../../models/', import.meta.url).href;
const gltfCache = {};
const loadGLB = name => gltfCache[name] ||= new GLTFLoader().loadAsync(MODELS + name + '.glb');
const loadMeta = name => fetch(MODELS + name + '.json').then(r => r.json());

// peau : diffusion sous la surface simulée (la lumière « déborde » dans l'ombre en rouge)
function skinMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: 0xffffff, roughness: 0.5, specularIntensity: 0.55,
    sheen: 0.25, sheenRoughness: 0.55, sheenColor: new THREE.Color('#ff9a85'),
    clearcoat: 0.1, clearcoatRoughness: 0.42,
  });
  m.onBeforeCompile = sh => {
    const chunk = THREE.ShaderChunk.lights_physical_pars_fragment
      .replace('vec3 irradiance = dotNL * directLight.color;',
        `vec3 irradiance = dotNL * directLight.color;
         float dNLraw = dot( geometryNormal, directLight.direction );
         vec3 sssIrr = directLight.color * max( vec3( 0.0 ), vec3( saturate( ( dNLraw + 0.32 ) / 1.32 ), saturate( ( dNLraw + 0.14 ) / 1.14 ), saturate( ( dNLraw + 0.09 ) / 1.09 ) ) - dotNL ) * 0.85;`)
      .replace('reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
        'reflectedLight.directDiffuse += ( irradiance + sssIrr ) * BRDF_Lambert( material.diffuseColor );');
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_physical_pars_fragment>', chunk);
  };
  m.customProgramCacheKey = () => 'ls-skin';
  return m;
}
// œil : une sphère brillante (vernis) dont la couleur dessine sclère, iris et pupille → reflets naturels des sources
function eyeball(r, irisColor) {
  const geo = new THREE.SphereGeometry(r, 64, 48), pos = geo.attributes.position, col = [];
  const sclera = new THREE.Color('#c9beb2'), iris = new THREE.Color(irisColor), ring = iris.clone().multiplyScalar(.45), pupil = new THREE.Color('#030303');
  const v = new THREE.Vector3(), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const a = Math.acos(THREE.MathUtils.clamp(v.z, -1, 1)) * 180 / Math.PI; // angle depuis l'axe du regard
    if (a < 9.5) c.copy(pupil);
    else if (a < 27) c.copy(iris).lerp(ring, THREE.MathUtils.smoothstep(a, 20, 27)).multiplyScalar(.75 + .5 * Math.abs(Math.sin(i * 12.9898) * .5));
    else c.copy(sclera).lerp(new THREE.Color('#b08a80'), THREE.MathUtils.smoothstep(a, 70, 110) * .5);
    col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: .35, clearcoat: 1, clearcoatRoughness: .02 }));
  const g = new THREE.Group(); g.add(m); return g;
}
const HAIR = { light: '#3a291e', medium: '#17110e', dark: '#110d0b' };
// stries fines des mèches (style sculpté) : texture de relief + variation de teinte, générées une fois
let hairTex = null;
function hairTextures() {
  if (hairTex) return hairTex;
  const W = 128, H = 512, h = new Float32Array(W * H), tint = new Float32Array(W * H);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let k = 0; k < 90; k++) {
    const c = rnd(), wd = 0.004 + rnd() * 0.012, amp = 0.4 + rnd() * 0.6, tn = rnd() * 2 - 1, f = 1 + Math.floor(rnd() * 3), ph = rnd() * 6.28, wa = rnd() * 0.012;
    for (let x = 0; x < W; x++) {
      const cc = c + wa * Math.sin(6.2832 * f * x / W + ph);
      for (let y = 0; y < H; y++) {
        let d = y / H - cc; d -= Math.round(d);
        const g = Math.exp(-(d * d) / (wd * wd));
        h[y * W + x] += amp * g; tint[y * W + x] += tn * g * 0.5;
      }
    }
  }
  const nrm = new Uint8Array(W * H * 4), col = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, dy = (h[((y + 1) % H) * W + x] - h[((y - 1 + H) % H) * W + x]) * 0.5 * 2.2;
    const l = Math.hypot(dy, 1);
    nrm.set([128, Math.round(128 - dy / l * 127), Math.round(128 + 127 / l), 255], i * 4);
    const v = Math.max(0, Math.min(255, Math.round((0.82 + 0.18 * Math.tanh(tint[i]) - 0.1 * Math.max(0, 0.6 - h[i])) * 235)));
    col.set([v, v, v, 255], i * 4);
  }
  const mk = (d, srgb) => { const t = new THREE.DataTexture(d, W, H); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  return (hairTex = { normal: mk(nrm), color: mk(col, true) });
}
// mèches sculptées : reflet anisotrope en bande, perpendiculaire aux mèches (TANGENT = sens de la mèche)
function clumpMaterial(skin, style) {
  if (style === 'twists') return new THREE.MeshPhysicalMaterial({ vertexColors: true, color: HAIR[skin], roughness: .6, anisotropy: .3, anisotropyRotation: Math.PI / 2, sheen: .4, sheenColor: new THREE.Color('#4a3a30'), sheenRoughness: .35 });
  const t = hairTextures();
  return new THREE.MeshPhysicalMaterial({
    vertexColors: true, color: HAIR[skin], map: t.color, normalMap: t.normal, normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: .52, anisotropy: .25, anisotropyRotation: Math.PI / 2, specularIntensity: .6,
    sheen: .35, sheenColor: new THREE.Color(skin === 'light' ? '#8a6a52' : '#4a3a30'), sheenRoughness: .4,
  });
}
// couches de « fourrure » de l'afro : bruit procédural, on jette les fragments entre les boucles
function fuzzMaterial(skin, level) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, color: HAIR[skin], roughness: .9, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLp;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vLp;
float h3(vec3 p){ p = fract(p * .3183099 + .1); p *= 17.; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3. - 2. * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1,0,0)), f.x), mix(h3(i + vec3(0,1,0)), h3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(h3(i + vec3(0,0,1)), h3(i + vec3(1,0,1)), f.x), mix(h3(i + vec3(0,1,1)), h3(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <alphatest_fragment>', `float nn = n3(vLp * 520.) * .6 + n3(vLp * 1400.) * .4;
if (nn < ${(0.42 + level * 0.1).toFixed(2)}) discard;`);
  };
  return m;
}
const IRIS = { light: '#5b4a35', medium: '#2b1d14', dark: '#21150f' };

export function buildRealistic({ gender = 'f', skin = 'light', hair }, onReady) {
  const g = new THREE.Group(); g.name = 'mannequin';
  const name = `hd_${gender}_${skin}`;
  // valeurs provisoires le temps du chargement
  g.userData = { headY: 1.585, chestY: 1.33, height: 1.71, loading: true };  // tous les bustes sont ramenés à la même hauteur d'yeux (1,60 m)
  Promise.all([loadGLB(name), loadMeta(name)]).then(([gltf, meta]) => {
    const hs = (meta.hairs || []).includes(hair) ? hair : meta.hair;
    return (meta.hairs ? loadGLB(`hair_${hs}_${gender}_${skin}`) : Promise.resolve(null)).then(hg => [gltf, meta, hg, hs]);
  }).then(([gltf, meta, hg, hs]) => {
    const skinMat = skinMaterial();
    const meshes = []; gltf.scene.traverse(o => o.isMesh && meshes.push(o)); hg?.scene.traverse(o => o.isMesh && meshes.push(o));
    meshes.forEach(o => {
      if (!o.isMesh) return;
      const mesh = o.clone(); mesh.geometry = o.geometry; if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();
      if (o.name.startsWith('skin')) mesh.material = skinMat;
      else if (o.name.startsWith('lashes')) mesh.material = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: .8, side: THREE.DoubleSide });
      else if (o.name.startsWith('hairclumps')) mesh.material = clumpMaterial(skin, hs);
      else if (o.name.startsWith('hairfuzz')) { mesh.material = fuzzMaterial(skin, +o.name.slice(8) || 0); mesh.castShadow = false; }
      else if (o.name.startsWith('hair') && o.geometry.attributes.uv && o.geometry.attributes.tangent) mesh.material = clumpMaterial(skin, hs);  // masse de base texturée
      else if (o.name.startsWith('hair') && meshes.some(x => x.name.startsWith('hairclumps')))  // sous-couche mate, dans l'ombre des mèches
        mesh.material = new THREE.MeshStandardMaterial({ vertexColors: true, color: HAIR[skin], roughness: .8 });
      else if (o.name.startsWith('hair')) {
        const afro = String(hs || '').startsWith('afro');
        mesh.material = afro
          ? new THREE.MeshPhysicalMaterial({ vertexColors: !!o.geometry.attributes.color, color: HAIR[skin], roughness: .88, sheen: .35, sheenColor: new THREE.Color('#3a2a22'), sheenRoughness: .6, side: THREE.DoubleSide })
          : new THREE.MeshPhysicalMaterial({ vertexColors: !!o.geometry.attributes.color, color: HAIR[skin], roughness: .45, clearcoat: .3, clearcoatRoughness: .3, sheen: .5, sheenColor: new THREE.Color('#7a5a45'), sheenRoughness: .3, side: THREE.DoubleSide });
      }
      else if (o.name.startsWith('top')) mesh.material = new THREE.MeshStandardMaterial({ color: '#3a3a3a', roughness: .9 });
      if (!o.name.startsWith('hairfuzz')) mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.pick = { kind: 'model' };
      g.add(mesh);
    });
    for (const s of ['l', 'r']) {
      const e = eyeball(meta.eyeR * .76, IRIS[skin]); e.position.fromArray(meta.eyes[s]); e.position.z -= meta.eyeR * .2;
      e.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; o.userData.pick = { kind: 'model' }; } });
      g.add(e);
    }
    const ey = meta.eyes.l[1];
    g.userData = { headY: ey - 0.015, chestY: ey - 0.27, height: meta.height, loading: false };
    onReady?.(g);
  }).catch(e => { console.error('[LS] personnage non chargé', e); });
  return g;
}
