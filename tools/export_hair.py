"""Exporte une coiffure MakeHuman calée sur un buste vers app/models/hair_<id>_<g>_<skin>.glb.

Usage : python3 export_hair.py <dossier_coiffure> <id> <g> <skin> [--keep-color]
La texture de couleur est passée en niveaux de gris (la teinte vient de l'app, comme les autres cheveux),
l'alpha est conservé (cartes de mèches), la normal map aussi. Tout est embarqué dans le .glb.
"""
import sys, glob, os, io
import numpy as np, trimesh
from PIL import Image, PngImagePlugin, ImageFile
PngImagePlugin.MAX_TEXT_CHUNK = 10**9; PngImagePlugin.MAX_TEXT_MEMORY = 10**10; ImageFile.LOAD_TRUNCATED_IMAGES = True
sys.path.insert(0, os.path.dirname(__file__))
import fit_hair as F

OUT = '/home/claude/repo/models'
TEX = 1024


def mhmat(folder):
    m = {}
    for line in open(glob.glob(f'{folder}/*.mhmat')[0], errors='ignore'):
        p = line.split()
        if len(p) >= 2: m[p[0]] = p[1]
    return m


def gray_tex(path, target=0.72):
    im = Image.open(path); im.load(); im = im.convert('RGBA')
    if im.size[0] > TEX: im = im.resize((TEX, TEX), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32) / 255
    lum = a[..., 0] * .3 + a[..., 1] * .59 + a[..., 2] * .11
    mask = a[..., 3] > .5
    ref = np.median(lum[mask]) if mask.any() else lum.mean()
    g = np.clip(lum / max(ref, 1e-3) * target, 0, 1)
    out = np.dstack([g, g, g, a[..., 3]])
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA'), float(1 - mask.mean())


def norm_tex(path):
    im = Image.open(path); im.load(); im = im.convert('RGB')
    if im.size[0] > TEX: im = im.resize((TEX, TEX), Image.LANCZOS)
    return im


def export(folder, hid, g, skin, drop_below=None):
    mhclo = glob.glob(f'{folder}/*.mhclo')[0]
    P, _ = F.fitted_base(g, skin)
    pos, meta = F.fit_clothes(mhclo, P)
    v, vt, faces = F.read_obj(f'{folder}/{meta["obj_file"]}')
    assert len(v) == len(pos), (len(v), len(pos))
    # dé-soudure position/uv + triangulation
    key, verts, uvs, tris = {}, [], [], []
    for f in faces:
        ids = []
        for (pi, ti) in f:
            k = (pi, ti)
            if k not in key:
                key[k] = len(verts); verts.append(pi); uvs.append(vt[ti] if ti >= 0 else (0, 0))
            ids.append(key[k])
        for i in range(1, len(ids) - 1): tris.append((ids[0], ids[i], ids[i + 1]))
    verts = np.array(verts); uvs = np.array(uvs, dtype=np.float64); tris = np.array(tris)
    # normales lissées sur les positions soudées
    welded = trimesh.Trimesh(pos, np.array(verts)[tris], process=False)
    vn = welded.vertex_normals[verts]
    m = mhmat(folder)
    col, holes = gray_tex(f'{folder}/{m["diffuseTexture"]}')
    nrm = norm_tex(f'{folder}/{m["normalmapTexture"]}') if 'normalmapTexture' in m else None
    mat = trimesh.visual.material.PBRMaterial(name='haircards', baseColorTexture=col, normalTexture=nrm,
                                              alphaMode='MASK' if holes > .02 else 'OPAQUE', alphaCutoff=.5,
                                              doubleSided=True, roughnessFactor=.5, metallicFactor=0)
    uvs2 = uvs.copy()
    mesh = trimesh.Trimesh(pos[verts], tris, vertex_normals=vn, process=False,
                           visual=trimesh.visual.TextureVisuals(uv=uvs2, material=mat))
    scene = trimesh.Scene(); scene.add_geometry(mesh, geom_name='haircards', node_name='haircards')
    out = f'{OUT}/hair_{hid}_{g}_{skin}.glb'
    scene.export(out)
    print(f'{out}: {len(verts)} sommets, {len(tris)} triangles, trous alpha {holes:.0%}, {os.path.getsize(out)/1e6:.2f} Mo')
    return out


if __name__ == '__main__':
    export(*sys.argv[1:5])
