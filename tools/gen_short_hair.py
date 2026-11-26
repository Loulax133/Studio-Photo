"""Coupes courtes générées sur la peau du buste : afro court dégradé, coupe rase.

La ligne de cheveux vient des tresses collées (elvs_braided_rows) calées sur le même buste :
les sommets de peau proches des tresses = cuir chevelu. Masque lissé + léger bruit = ligne naturelle.
Sortie : mesh « hair » (sous-couche mate) + « hairfuzz0..n » (couches de bouclettes de l'app).
Usage : python3 gen_short_hair.py <g> <skin> <style: afrocourt|afroras> <dossier braided_rows>
"""
import sys, os, glob
import numpy as np, trimesh
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.dirname(__file__))
import fit_hair as F

ss = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
STYLES = {
    # épaisseur côtés, épaisseur dessus, couches de bouclettes (fraction de l'épaisseur)
    'afrocourt': dict(side=.0035, top=.0150, front=.0100, layers=[.62, .78, .9, 1.0]),
    'afroras':   dict(side=.0012, top=.0030, front=.0025, layers=[.75, 1.0]),
}


def neighbors(mesh):
    import scipy.sparse as sp
    e = mesh.edges_unique; n = len(mesh.vertices)
    A = sp.coo_matrix((np.ones(len(e) * 2), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    deg = np.asarray(A.sum(1)).ravel(); deg[deg == 0] = 1
    return sp.diags(1 / deg) @ A


def smooth(field, A, it):
    f = field.astype(float).copy()
    for _ in range(it): f = (A @ f) * .5 + f * .5
    return f


def build(g, skin, style, braids):
    st = STYLES[style]
    skinm = F.load_skin(g, skin)
    skinm.merge_vertices()
    P, _ = F.fitted_base(g, skin)
    pos, _ = F.fit_clothes(glob.glob(f'{braids}/*.mhclo')[0], P)
    V, N = skinm.vertices, skinm.vertex_normals
    nb = neighbors(skinm)
    # ligne de cheveux dessinée : hauteur (par rapport aux yeux) selon l'angle autour de la tête
    eye_y = 1.60
    ring = V[(V[:, 1] > eye_y) & (V[:, 1] < eye_y + .06)]
    zc = (ring[:, 2].max() + ring[:, 2].min()) / 2
    th = np.degrees(np.abs(np.arctan2(V[:, 0], V[:, 2] - zc)))
    T = [0, 25, 45, 58, 66, 72, 80, 104, 116, 130, 155, 180]
    Hh = [.078, .072, .060, .040, .012, -.006, .030, .030, -.012, -.040, -.066, -.070]
    hl = eye_y + np.interp(th, T, Hh)
    m = ss(-.004, .004, V[:, 1] - hl)
    m = smooth(m, nb, 6)
    # léger bruit sur la ligne (cheveux implantés de façon irrégulière)
    rng = np.random.default_rng(3)
    noise = smooth(rng.normal(0, 1, len(V)), nb, 3)
    m = np.clip(m + noise * 0.06, 0, 1)
    # épaisseur : dessus de la tête épais, côtés et nuque dégradés, front intermédiaire
    up = smooth(N[:, 1], nb, 6)
    fwd = np.clip(N[:, 2], 0, 1)
    h = st['side'] + (st['top'] - st['side']) * ss(.15, .7, up)
    h = np.where(fwd > .5, np.minimum(h, st['front'] + (h - st['front']) * (1 - ss(.5, .9, fwd))), h)
    h = smooth(h, nb, 8) * ss(.3, .7, m)
    h = np.maximum(h, .0007)
    Ns = smooth(N, nb, 4); Ns /= np.linalg.norm(Ns, axis=1)[:, None]
    F_ = skinm.faces
    keep_base = (m[F_] > .3).all(1)
    keep_fuzz = (m[F_] > .45).all(1)
    scene = trimesh.Scene()
    white = np.full((len(V), 4), 255, np.uint8)

    def layer(frac, faces_mask, name):
        sub = trimesh.Trimesh(V + Ns * (h * frac)[:, None], F_[faces_mask], vertex_colors=white, process=False)
        sub.remove_unreferenced_vertices()
        scene.add_geometry(sub, geom_name=name, node_name=name)
        return len(sub.vertices)

    nv = layer(st['layers'][0], keep_base, 'hair')
    for i, fr in enumerate(st['layers'][1:]):
        layer(fr, keep_fuzz, f'hairfuzz{i}')
    out = f'/home/claude/repo/models/hair_{style}_{g}_{skin}.glb'
    scene.export(out)
    print(out, nv, 'sommets/couche', f'{os.path.getsize(out)/1e6:.2f} Mo')


if __name__ == '__main__':
    build(*sys.argv[1:5])
