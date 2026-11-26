"""Cale une coiffure MakeHuman (.mhclo + .obj) sur un buste Light Studio (hd_*.glb).

Étapes :
1. maillage de base hm08 + cibles macro (genre / ethnie, jeune, muscle et poids moyens) ;
2. alignement (échelle + translation, ICP) de la tête sur la peau du buste ;
3. correction fine : chaque sommet de la tête est collé à la surface du buste,
   et ce champ de correction est propagé (pondération inverse distance) aux autres sommets ;
4. calage MakeHuman classique (3 sommets de référence + poids + décalage mis à l'échelle).
"""
import gzip, sys, json
import numpy as np, trimesh
from scipy.spatial import cKDTree

MH = '/home/claude/mh/mpfb2/src/mpfb/data'
ETH = {'light': 'caucasian', 'medium': 'asian', 'dark': 'african'}
GEN = {'f': 'female', 'm': 'male'}


def read_obj(path):
    v, vt, faces = [], [], []
    for line in open(path, errors='ignore'):
        p = line.split()
        if not p: continue
        if p[0] == 'v': v.append([float(x) for x in p[1:4]])
        elif p[0] == 'vt': vt.append([float(x) for x in p[1:3]])
        elif p[0] == 'f':
            f = []
            for t in p[1:]:
                s = t.split('/')
                f.append((int(s[0]) - 1, int(s[1]) - 1 if len(s) > 1 and s[1] else -1))
            faces.append(f)
    return np.array(v), np.array(vt) if vt else None, faces


_base = None
def base_mesh():
    global _base
    if _base is None: _base = read_obj(f'{MH}/3dobjs/base.obj')
    return _base


def target(name):
    d = {}
    with gzip.open(f'{MH}/targets/macrodetails/{name}.target.gz', 'rt') as f:
        for line in f:
            p = line.split()
            if len(p) == 4 and not line.startswith('#'): d[int(p[0])] = [float(x) for x in p[1:]]
    idx = np.array(list(d.keys()), dtype=int); off = np.array(list(d.values())).reshape(-1, 3)
    return idx, off


def body_coords(gender, skin):
    v = base_mesh()[0].copy()
    for t in (f'universal-{GEN[gender]}-young-averagemuscle-averageweight', f'{ETH[skin]}-{GEN[gender]}-young'):
        i, o = target(t); v[i] += o
    return v


def load_skin(gender, skin):
    s = trimesh.load(f'/home/claude/repo/models/hd_{gender}_{skin}.glb')
    return s.geometry['skin']


_cache = {}
def fitted_base(gender, skin):
    """Coordonnées des 19158 sommets hm08 dans l'espace du buste (mètres)."""
    key = (gender, skin)
    if key in _cache: return _cache[key]
    v = body_coords(gender, skin)
    skinm = load_skin(gender, skin)
    meta = json.load(open(f'/home/claude/repo/models/hd_{gender}_{skin}.json'))
    body = v[:13380]
    # zone tête : au-dessus du cou de la base
    top = body[:, 1].max()
    head = np.where(body[:, 1] > top - 2.6)[0]   # ~26 cm sous le sommet du crâne (unités = dm)
    # init : échelle 0.1, sommet du crâne aligné
    s = 0.1
    src = body[head] * s
    skin_top = skinm.vertices[:, 1].max()
    t0 = np.array([0, skin_top - src[:, 1].max(), 0])
    src = src + t0
    # z : centre de la tête
    sk_head = skinm.vertices[skinm.vertices[:, 1] > skin_top - 0.26]
    t0b = np.array([0, 0, np.median(sk_head[:, 2]) - np.median(src[:, 2])])
    init = np.eye(4); init[:3, :3] *= s; init[:3, 3] = t0 + t0b
    mat, _, cost = trimesh.registration.icp(body[head], skinm, initial=init, threshold=1e-7, max_iterations=60, reflection=False, translation=True, scale=True)
    P = trimesh.transform_points(v, mat)
    # correction : on colle la tête à la surface du buste
    cp, dist, _ = trimesh.proximity.closest_point(skinm, P[head])
    disp = cp - P[head]
    ok = dist < 0.012
    tree = cKDTree(P[head][ok])
    d, nn = tree.query(P, k=12)
    w = 1.0 / (d + 0.004) ** 2
    corr = (disp[ok][nn] * w[..., None]).sum(1) / w.sum(1)[:, None]
    # on atténue loin de la tête
    far = np.clip((d[:, 0] - 0.02) / 0.05, 0, 1)
    P = P + corr * (1 - far)[:, None]
    print(f'[fit] {gender}_{skin}: icp cost {cost:.2e}, scale {np.cbrt(np.linalg.det(mat[:3,:3])):.4f}, corr médiane {np.median(dist)*1000:.1f} mm, max {dist.max()*1000:.1f} mm', file=sys.stderr)
    _cache[key] = (P, mat)
    return _cache[key]


def read_mhclo(path):
    scales, refs = {}, []
    in_verts = False
    meta = {}
    for line in open(path, errors='ignore'):
        p = line.split()
        if not p or p[0].startswith('#'): continue
        if p[0] in ('x_scale', 'y_scale', 'z_scale'):
            scales[p[0][0]] = (int(p[1]), int(p[2]), float(p[3]))
        elif p[0] in ('l_shear_x', 'l_shear_y', 'l_shear_z'):   # format MakeClothes 2 : coordonnées d'origine des 2 sommets
            scales.setdefault(p[0][-1], (int(p[1]), int(p[2]), abs(float(p[3]) - float(p[4]))))
        elif p[0] == 'verts': in_verts = True; continue
        elif p[0] in ('delete_verts', 'weights'): in_verts = False
        elif in_verts:
            if len(p) == 9:
                refs.append((int(p[0]), int(p[1]), int(p[2]), float(p[3]), float(p[4]), float(p[5]), float(p[6]), float(p[7]), float(p[8])))
            elif len(p) == 1:
                i = int(p[0]); refs.append((i, i, i, 1, 0, 0, 0, 0, 0))
            else:
                in_verts = False
        elif len(p) >= 2:
            meta[p[0]] = p[1]
    return scales, np.array(refs), meta


def fit_clothes(mhclo, P):
    scales, R, meta = read_mhclo(mhclo)
    sc = np.array([abs(P[scales[a][0], i] - P[scales[a][1], i]) / scales[a][2] for i, a in enumerate('xyz')])
    i1, i2, i3 = R[:, 0].astype(int), R[:, 1].astype(int), R[:, 2].astype(int)
    w = R[:, 3:6]; off = R[:, 6:9]
    pos = P[i1] * w[:, :1] + P[i2] * w[:, 1:2] + P[i3] * w[:, 2:3] + off * sc
    return pos, meta
