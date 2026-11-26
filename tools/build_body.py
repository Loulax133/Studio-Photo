"""Reconstruit le corps en pied (hd_<g>_<skin>_body.glb) et re-pose le buste (hd_<g>_<skin>.glb).

- maillage de base hm08 calé sur le buste (fit_hair.fitted_base) ;
- retouches de silhouette (cibles MakeHuman) appliquées au corps ET au buste ;
- squelette + pondérations MPFB2 (rig.default) : pose naturelle (bras le long du corps,
  coudes légèrement fléchis, doigts détendus), appliquée au corps et au buste ;
- tenue : surface décalée de la peau (haut gris / bas noir, ourlet net), mains en peau,
  chaussures d'origine conservées (les jambes ne bougent pas).
Usage : python3 build_body.py <g> <skin> [--preview]
"""
import sys, os, json, gzip
import numpy as np, trimesh, pygltflib
import scipy.sparse as sp
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
import fit_hair as F

MH = F.MH
MODELS = '/home/claude/repo/models'
ORIG = '/home/claude/orig_models'   # copies d'origine (avant toute retouche)
RIG = json.load(open(f'{MH}/rigs/standard/rig.default.json'))
WTS = json.load(open(f'{MH}/rigs/standard/weights.default.json'))['weights']
BONES = list(RIG)
BI = {b: i for i, b in enumerate(BONES)}
PRON = float(os.environ.get('PRON', -8))

# silhouette : cibles (dossier/nom, poids) par genre
SHAPE = {
    'f': [('buttocks/buttocks-volume-decr', .9), ('hip/hip-scale-depth-decr', .4),
          ('breast/breast-point-decr', .9), ('breast/female-young-averagemuscle-averageweight-averagecup-minfirmness', .35),
          ('breast/breast-trans-down', .15)],
    'm': [],
}


def read_groups():
    groups, cur = {}, None
    for line in open(f'{MH}/3dobjs/base.obj'):
        if line.startswith('g '): cur = line.split()[1]; groups.setdefault(cur, [])
        elif line.startswith('f '):
            groups[cur].append([int(t.split('/')[0]) - 1 for t in line.split()[1:]])
    return groups


def target_delta(name):
    d = {}
    with gzip.open(f'{MH}/targets/{name}.target.gz', 'rt') as f:
        for line in f:
            p = line.split()
            if len(p) == 4 and not line.startswith('#'): d[int(p[0])] = [float(x) for x in p[1:]]
    out = np.zeros((19158, 3))
    if d: out[list(d)] = list(d.values())
    return out


def joint(spec, P, gverts):
    s = spec['strategy']
    if s == 'CUBE': return P[gverts[spec['cube_name']]].mean(0)
    if s == 'VERTEX': return P[spec['vertex_index']]
    return P[spec['vertex_indices']].mean(0)


def rot(axis, ang):
    axis = np.asarray(axis, float); axis /= np.linalg.norm(axis)
    return trimesh.transformations.rotation_matrix(np.radians(ang), axis)[:3, :3]


def align(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    ax = np.cross(a, b); s = np.linalg.norm(ax)
    if s < 1e-9: return np.eye(3)
    return rot(ax, np.degrees(np.arctan2(s, a @ b)))


def weight_matrix(n=19158):
    rows, cols, vals = [], [], []
    for b, lst in WTS.items():
        if b not in BI: continue
        for i, w in lst: rows.append(i); cols.append(BI[b]); vals.append(w)
    W = sp.coo_matrix((vals, (rows, cols)), shape=(n, len(BONES))).tocsr()
    s = np.asarray(W.sum(1)).ravel(); s[s == 0] = 1
    return sp.diags(1 / s) @ W


def pose_rotations(P, H, T, gender):
    """Rotations locales (repère de repos) par os. H/T = têtes/queues des os au repos."""
    R = {}
    down = np.array([0, -1, 0.])
    for side, sx in (('L', 1), ('R', -1)):
        # épaules : un peu de la descente sur l'épaule, le reste sur le bras
        up = H[f'upperarm01.{side}']; el = H[f'lowerarm01.{side}']; d = el - up
        tgt = np.array([sx * np.sin(np.radians(9)), -np.cos(np.radians(9)), -0.02])
        full = align(d, tgt)
        ang = np.degrees(np.arccos(np.clip((d / np.linalg.norm(d)) @ (tgt / np.linalg.norm(tgt)), -1, 1)))
        ax = np.cross(d, tgt)
        R[f'shoulder01.{side}'] = rot(ax, ang * .12)
        R[f'upperarm01.{side}'] = rot(ax, ang * .88)
        # coude légèrement fléchi vers l'avant, avant-bras tourné paume vers la cuisse
        fa = T[f'lowerarm02.{side}'] - el
        fa_posed = full @ fa
        # avant-bras : quasi dans l'axe du bras, un peu vers l'avant (coude détendu)
        tgt_fa = np.array([sx * np.sin(np.radians(5)), -np.cos(np.radians(16)), np.sin(np.radians(16))])
        R[f'lowerarm01.{side}'] = full.T @ align(fa_posed, tgt_fa) @ full     # exprimé dans le repère de repos
        R[f'lowerarm02.{side}'] = rot(fa, sx * PRON)                        # rotation de l'avant-bras (paume vers la cuisse)
        R[f'wrist.{side}'] = rot(np.cross(T[f'wrist.{side}'] - H[f'wrist.{side}'], [0, 0, 1]), 6)
        # doigts : flexion douce vers la paume
        hand_n = palm_normal(P, side)
        for f in range(2, 6):
            for k, a in ((1, 8), (2, 12), (3, 9)):
                b = f'finger{f}-{k}.{side}'
                dd = T[b] - H[b]
                R[b] = rot(np.cross(dd, -hand_n), a + (f - 2) * 2)
        for k, a in ((2, 10), (3, 10)):
            b = f'finger1-{k}.{side}'
            dd = T[b] - H[b]
            R[b] = rot(np.cross(dd, -hand_n), a)
    return R


_W = None
def palm_normal(P, side):
    """Normale du dos de la main au repos (vers l'extérieur du dos)."""
    W = weight_matrix_cached()
    idx = [BI[b] for b in BONES if b.startswith('metacarpal') and b.endswith('.' + side)]
    m = np.asarray(W[:, idx].sum(1)).ravel() > .5
    pts = P[m]
    c = pts.mean(0); u, s, vt = np.linalg.svd(pts - c)
    n = vt[2]
    # le dos de la main est du côté opposé au pouce (finger1) par rapport au plan de la paume... on prend
    # la convention : le dos regarde vers le haut / l'extérieur au repos (bras en A, paumes vers le sol)
    if n[1] < 0: n = -n
    return n


def weight_matrix_cached():
    global _W
    if _W is None: _W = weight_matrix()
    return _W


def global_transforms(H, R):
    G = {}
    def g(b):
        if b in G: return G[b]
        par = RIG[b]['parent']
        M = np.eye(4)
        if b in R:
            M[:3, :3] = R[b]; M[:3, 3] = H[b] - R[b] @ H[b]
        G[b] = (g(par) if par else np.eye(4)) @ M
        return G[b]
    for b in BONES: g(b)
    return G


def skin(points, W, G):
    """LBS : points (n,3), W (n, bones)."""
    out = np.zeros_like(points)
    Wd = W.toarray() if sp.issparse(W) else W
    for j, b in enumerate(BONES):
        w = Wd[:, j]
        nz = w > 0
        if not nz.any(): continue
        M = G[b]
        out[nz] += w[nz, None] * (points[nz] @ M[:3, :3].T + M[:3, 3])
    return out


def read_glb(path):
    g = pygltflib.GLTF2().load(path)
    blob = g.binary_blob()
    def acc(i):
        a = g.accessors[i]; bv = g.bufferViews[a.bufferView]
        comp = {5126: np.float32, 5123: np.uint16, 5125: np.uint32, 5121: np.uint8}[a.componentType]
        n = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}[a.type]
        arr = np.frombuffer(blob, comp, a.count * n, (bv.byteOffset or 0) + (a.byteOffset or 0))
        if a.normalized and comp != np.float32: arr = arr / np.iinfo(comp).max
        return arr.reshape(a.count, n) if n > 1 else arr
    meshes = {}
    for node in g.nodes:
        if node.mesh is None: continue
        m = g.meshes[node.mesh]; p = m.primitives[0]
        d = {'pos': acc(p.attributes.POSITION).astype(np.float64), 'idx': acc(p.indices).reshape(-1, 3).astype(np.int64)}
        if p.attributes.COLOR_0 is not None: d['col'] = acc(p.attributes.COLOR_0)
        if p.attributes.NORMAL is not None: d['nrm'] = acc(p.attributes.NORMAL)
        if p.attributes.TEXCOORD_0 is not None: d['uv'] = acc(p.attributes.TEXCOORD_0)
        meshes[node.name or m.name] = d
    return meshes


def write_glb(path, meshes):
    """meshes : liste (nom, positions, faces, couleurs RGBA float|None)."""
    scene = trimesh.Scene()
    for name, pos, faces, col in meshes:
        kw = {}
        if col is not None: kw['vertex_colors'] = (np.clip(col, 0, 1) * 255).astype(np.uint8)
        m = trimesh.Trimesh(pos, faces, process=False, **kw)
        scene.add_geometry(m, geom_name=name, node_name=name)
    scene.export(path)


def adjacency(pos, faces):
    m = trimesh.Trimesh(pos, faces, process=False)
    e = m.edges_unique; n = len(pos)
    A = sp.coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
    return sp.diags(1 / deg) @ A


def masked_smooth(pos, faces, mask, it, lam=.5, mu=-.53):
    """Lissage de Taubin pondéré par mask (0..1) : peu de rétrécissement."""
    A = adjacency(pos, faces); x = pos.copy(); k = mask[:, None]
    for _ in range(it):
        x = x + lam * k * (A @ x - x)
        x = x + mu * k * (A @ x - x)
    return x


def neckline_fn(top_pos, top_idx):
    tm = trimesh.Trimesh(top_pos, top_idx, process=False)
    be = tm.edges[trimesh.grouping.group_rows(tm.edges_sorted, require_count=1)]
    loops = trimesh.graph.connected_components(be)
    neck = max(loops, key=lambda l: top_pos[l, 1].mean())
    nv = top_pos[neck]; zc = nv[:, 2].mean()
    th = np.arctan2(nv[:, 0], nv[:, 2] - zc); o = np.argsort(th)
    th, ny = th[o], nv[o, 1]
    th = np.r_[th - 2 * np.pi, th, th + 2 * np.pi]; ny = np.r_[ny, ny, ny]
    return lambda p: np.interp(np.arctan2(p[:, 0], p[:, 2] - zc), th, ny)


def clip_mesh(V, F, f, A):
    """Garde la partie f > 0 du maillage, en coupant les triangles le long de f = 0 (attributs A interpolés)."""
    V = list(V); A = list(A); cache = {}
    def cut(i, j):
        k = (min(i, j), max(i, j))
        if k not in cache:
            t = f[i] / (f[i] - f[j])
            V.append(V[i] + (V[j] - V[i]) * t); A.append(A[i] + (A[j] - A[i]) * t)
            cache[k] = len(V) - 1
        return cache[k]
    out = []
    for tri in F:
        inside = [f[v] > 0 for v in tri]
        if all(inside): out.append(tri); continue
        if not any(inside): continue
        poly = []
        for a in range(3):
            i, j = tri[a], tri[(a + 1) % 3]
            if f[i] > 0: poly.append(i)
            if (f[i] > 0) != (f[j] > 0): poly.append(cut(i, j))
        for a in range(1, len(poly) - 1): out.append((poly[0], poly[a], poly[a + 1]))
    V = np.array(V); A = np.array(A); out = np.array(out)
    used = np.unique(out); remap = -np.ones(len(V), int); remap[used] = np.arange(len(used))
    return V[used], remap[out], A[used]


def idw_weights(src, dst, W, k=6):
    d, nn = cKDTree(src).query(dst, k=k)
    w = 1 / (d + 1e-4) ** 2; w /= w.sum(1)[:, None]
    Ws = sp.csr_matrix(W)
    out = None
    for j in range(k):
        part = sp.diags(w[:, j]) @ Ws[nn[:, j]]
        out = part if out is None else out + part
    return out.toarray().astype(np.float32), (d, nn, w)


def build(g, skin_name, preview=False):
    os.makedirs(ORIG, exist_ok=True)
    for suf in ('', '_body'):
        src = f'{MODELS}/hd_{g}_{skin_name}{suf}.glb'; dst = f'{ORIG}/hd_{g}_{skin_name}{suf}.glb'
        if not os.path.exists(dst): os.system(f'cp {src} {dst}')
    groups = read_groups()
    gverts = {k: np.unique(np.concatenate([np.array(f) for f in v])) if v else np.array([], int) for k, v in groups.items()}
    P0, mat = F.fitted_base(g, skin_name)
    L = mat[:3, :3]
    # silhouette
    D = np.zeros_like(P0)
    for name, w in SHAPE[g]: D += w * target_delta(name) @ L.T
    P = P0 + D
    W = weight_matrix_cached()
    H = {b: joint(RIG[b]['head'], P, gverts) for b in BONES}
    T = {b: joint(RIG[b]['tail'], P, gverts) for b in BONES}
    R = pose_rotations(P, H, T, g)
    G = global_transforms(H, R)
    Pp = skin(P, W, G)

    # ---- buste : même retouche + même pose (pondérations transférées depuis la base) ----
    bust = read_glb(f'{ORIG}/hd_{g}_{skin_name}.glb')
    body_old = read_glb(f'{ORIG}/hd_{g}_{skin_name}_body.glb')
    out_bust, out_full = [], []
    for name, m in bust.items():
        Wb, (d, nn, w) = idw_weights(P0[:13380], m['pos'], W[:13380], k=6)
        disp = np.einsum('nk,nkc->nc', w, D[:13380][nn])
        rest = m['pos'] + disp
        bw = Wb[:, [BI['breast.L'], BI['breast.R']]].sum(1)
        if name == 'top':
            top_rest_smooth = (rest.copy(), m['idx'].copy())
        if name == 'top' and g == 'f':
            # seins : le tissu ne colle pas à la pointe -> lissage gaussien 3D (indépendant du maillage) autour de chaque pointe
            k = np.zeros(len(rest))
            for sx in (1, -1):
                c = (rest[:, 1] > 1.15) & (rest[:, 1] < 1.38) & (rest[:, 0] * sx > .03)
                apex = rest[c][np.argmax(rest[c][:, 2])]
                dd = np.linalg.norm(rest - apex, axis=1)
                k = np.maximum(k, np.clip((.11 - dd) / .06, 0, 1))
            k = k * k * (3 - 2 * k)
            idx = np.where(k > 0)[0]
            tree = cKDTree(rest)
            sm = rest.copy()
            for i in idx:
                nb = tree.query_ball_point(rest[i], .045)
                w = np.exp(-np.sum((rest[nb] - rest[i]) ** 2, 1) / (2 * .016 ** 2))
                sm[i] = (rest[nb] * w[:, None]).sum(0) / w.sum()
            breast_disp = (sm - rest) * k[:, None]
            rest = rest + breast_disp
            top_rest_smooth = (rest.copy(), m['idx'].copy())
            # la peau suit (elle est dessous)
            for j, (nm, pp, ff, cc) in enumerate(out_bust):
                if nm == 'skin':
                    d_, nn_ = cKDTree(rest - breast_disp).query(pp, k=4)
                    w_ = 1 / (d_ + 1e-4) ** 2; w_ /= w_.sum(1)[:, None]
                    out_bust[j] = (nm, pp + np.einsum('nk,nkc->nc', w_, breast_disp[nn_]), ff, cc)
        # buste seul (portraits) : pas de pose, coupe de sculpture d'origine
        out_bust.append((name, rest, m['idx'], m.get('col')))
        # buste du mode en pied : posé comme le corps, moignons des bras retirés (la tenue prend le relais)
        pos = skin(rest, sp.csr_matrix(Wb), G)
        ua = Wb[:, [BI[b] for b in BONES if b.startswith(('upperarm01', 'shoulder01'))]].sum(1)
        k = np.clip(1 - np.abs(ua - .5) * 2, 0, 1) * (rest[:, 1] < 1.45)
        if name in ('top', 'skin'): pos = masked_smooth(pos, m['idx'], k, 12)
        if name == 'skin': skin_rest = rest
        if name != 'top': out_full.append((name, pos, m['idx'], m.get('col')))

    # peau du buste cachée sous la tenue (mode en pied) : retirée, elle ressortait aux aisselles
    nfn = neckline_fn(bust['top']['pos'], bust['top']['idx'])
    for i, (name, pos_, faces_, col_) in enumerate(out_full):
        if name == 'skin':
            hidden = skin_rest[:, 1] < nfn(skin_rest) - .02
            out_full[i] = (name, pos_, faces_[~hidden[faces_].all(1)], col_)

    # ---- corps : tenue + mains depuis la base posée ----
    body_faces = np.array([f for f in groups['body']], dtype=object)
    quads = [f for f in groups['body']]
    tris = []
    for f in quads:
        for i in range(1, len(f) - 1): tris.append((f[0], f[i], f[i + 1]))
    tris = np.array(tris)
    Wd = W.toarray()
    def wsum(pred): return Wd[:, [BI[b] for b in BONES if pred(b)]].sum(1)
    hand = wsum(lambda b: b.startswith(('wrist', 'metacarpal', 'finger')))
    foot = wsum(lambda b: b.startswith(('foot', 'toe')))
    arm = wsum(lambda b: b.startswith(('upperarm', 'lowerarm'))) + hand
    restY = P[:, 1]
    # mains : sommets majoritairement « main » ; tenue : ni tête/cou (sous le buste), ni main, ni pied
    is_hand_v = hand > .5
    neck_cut = 1.405
    tri_hand = is_hand_v[tris].all(1)
    # tenue construite au repos puis posée : couvre tout sauf tête, peau visible du buste, mains et pieds
    top0 = bust['top']['pos']; dtop, _ = cKDTree(top0).query(P0)
    keep_v = (restY < 1.50) & (wsum(lambda b: b in ('head', 'jaw') or b.startswith(('eye', 'levator', 'oris', 'orbicularis', 'temporalis', 'tongue', 'special'))) < .3)
    tri_outfit = (~is_hand_v[tris].all(1)) & (foot[tris].max(1) < .5) & keep_v[tris].all(1)
    oc = body_old['outfit']['col'][:, :3]; op = body_old['outfit']['pos']
    top_col = np.median(oc[op[:, 1] > 1.1], 0); bot_col = np.median(oc[op[:, 1] < .7], 0)
    hem = 1.2
    for y in np.arange(1.2, .6, -.005):
        sel = (op[:, 1] > y - .005) & (op[:, 1] < y + .005) & (np.abs(op[:, 0]) < .12)
        if sel.sum() > 5 and np.abs(np.median(oc[sel], 0) - top_col).sum() > np.abs(bot_col - top_col).sum() / 2: hem = y + .0025; break
    skin_col = np.median(body_old['bodyskin']['col'], 0) if 'col' in body_old['bodyskin'] else np.array([1, 1, 1, 1.])

    def submesh(tri_mask, pts):
        f = tris[tri_mask]
        used = np.unique(f); remap = -np.ones(len(pts), int); remap[used] = np.arange(len(used))
        return used, remap[f]

    used, f = submesh(tri_outfit, P)
    m = trimesh.Trimesh(P[used], f, process=False).subdivide_loop(1)
    _aux = trimesh.Trimesh(np.c_[arm[used], hand[used], np.zeros(len(used))], f, process=False).subdivide_loop(1).vertices
    armw, handw = _aux[:, 0], _aux[:, 1]
    rest_y = m.vertices[:, 1].copy()
    trimesh.smoothing.filter_taubin(m, lamb=.5, nu=-.53, iterations=6)
    off_base = .0035 if g == 'f' else .004
    pos = m.vertices + m.vertex_normals * off_base
    # sous l'ancien haut : la tenue épouse exactement sa forme (seins arrondis, même encolure)
    tr, tf = top_rest_smooth
    _tm = trimesh.Trimesh(tr, tf, process=False)
    cp = pos.copy(); dist = np.full(len(pos), 1.0)
    q = np.where(rest_y > 1.14)[0]                   # seulement la zone du haut (sinon calcul énorme)
    cpq, dq, tri_id = trimesh.proximity.closest_point(_tm, pos[q])
    cp[q] = cpq + _tm.face_normals[tri_id] * .0015    # léger jeu au-dessus de la peau (pas d'interpénétration)
    dist[q] = dq
    w = np.clip((rest_y - 1.16) / .06, 0, 1) * np.clip((.022 - dist) / .008, 0, 1)
    w = w * w * (3 - 2 * w)
    pos = pos * (1 - w[:, None]) + cp * w[:, None]
    # encolure : on découpe la tenue le long du bord de la peau visible du buste
    neck_y = neckline_fn(top0, bust['top']['idx'])(pos)
    dvis = np.where(rest_y > 1.2, neck_y - pos[:, 1], 1.0)
    dvis = np.minimum(dvis, .2 - handw)              # poignets : coupe nette le long des pondérations de la main
    t = np.clip((rest_y - hem) / .006 + .5, 0, 1); t = np.maximum(t, np.clip(armw * 2 - .5, 0, 1))
    fh = np.maximum(rest_y - hem, (armw - .5) * .1)   # > 0 : haut, < 0 : bas
    pos, faces, attr = clip_mesh(pos, m.faces, dvis - .005, fh[:, None])
    fh = attr[:, 0]
    # ourlet net : on coupe la tenue en deux le long de la ligne (haut gris / bas noir)
    p1, f1, _ = clip_mesh(pos, faces, fh, fh[:, None])
    p2, f2, _ = clip_mesh(pos, faces, -fh, fh[:, None])
    pos = np.r_[p1, p2]; faces = np.r_[f1, f2 + len(p1)]
    t = np.r_[np.ones(len(p1)), np.zeros(len(p2))]
    # pondérations : transférées depuis la base au repos, puis pose
    Wo, _ = idw_weights(P[:13380], pos, W[:13380], k=6)
    pos = skin(pos, sp.csr_matrix(Wo), G)
    col = np.c_[bot_col + (top_col - bot_col) * t[:, None], np.ones(len(t))]
    outfit = ('outfit', pos, faces, col)
    # mains
    used, f = submesh((hand[tris].max(1) > .12) & (foot[tris].max(1) < .5), Pp)
    mh = trimesh.Trimesh(Pp[used], f, process=False).subdivide_loop(1)
    trimesh.smoothing.filter_taubin(mh, lamb=.5, nu=-.53, iterations=2)
    hands = ('bodyskin', mh.vertices, mh.faces, np.tile(skin_col, (len(mh.vertices), 1)))
    shoes = body_old['shoes']
    out_body = [hands, outfit, ('shoes', shoes['pos'], shoes['idx'], shoes.get('col'))]

    sfx = '_preview' if preview else ''
    write_glb(f'{MODELS}/hd_{g}_{skin_name}{sfx}.glb', out_bust)
    write_glb(f'{MODELS}/hd_{g}_{skin_name}_full{sfx}.glb', out_full)
    write_glb(f'{MODELS}/hd_{g}_{skin_name}_body{sfx}.glb', out_body)
    print(f'[body] {g}_{skin_name}: ourlet {hem:.3f} m, tenue {len(pos)} sommets, mains {len(mh.vertices)}, '
          f'tailles {os.path.getsize(f"{MODELS}/hd_{g}_{skin_name}{sfx}.glb")/1e6:.1f} + {os.path.getsize(f"{MODELS}/hd_{g}_{skin_name}_body{sfx}.glb")/1e6:.1f} Mo')


if __name__ == '__main__':
    build(sys.argv[1], sys.argv[2], '--preview' in sys.argv)
