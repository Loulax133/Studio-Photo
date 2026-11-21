// Auth + stockage. Deux backends avec la même interface :
//  - Firebase (Auth persistante + Firestore) si firebase-config.js est rempli
//  - Local (localStorage) sinon
import { firebaseConfig } from './firebase-config.js';
import { migrateScene } from './editor/defaults.js';

const FB = 'https://www.gstatic.com/firebasejs/13.3.0/';
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ------------------------------------------------------------------ */
/* Backend local                                                       */
/* ------------------------------------------------------------------ */
function safeGet(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } }
function safeSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }

const memory = {}; // secours si localStorage indisponible
class LocalBackend {
  constructor() { this.mode = 'local'; this.user = null; this._cb = null; }
  async init() { this.user = safeGet('ls_user', null); }
  onAuth(cb) { this._cb = cb; cb(this.user); }
  async signInLocal(name) {
    this.user = { uid: 'local', name: name || 'Moi', email: '', photo: '' };
    safeSet('ls_user', this.user); this._cb?.(this.user);
  }
  async signOut() { try { localStorage.removeItem('ls_user'); } catch {} this.user = null; this._cb?.(null); }
  _db() { return safeGet('ls_db', null) || memory.db || { folders: {}, sets: {} }; }
  _save(db) { if (!safeSet('ls_db', db)) memory.db = db; }
  async listFolders(source) { if (source === 'cache') return null; return Object.values(this._db().folders).sort((a, b) => b.updatedAt - a.updatedAt); }
  async createFolder(name) { const db = this._db(); const f = { id: uid(), name, createdAt: Date.now(), updatedAt: Date.now() }; db.folders[f.id] = f; this._save(db); return f; }
  async updateFolder(id, patch) { const db = this._db(); Object.assign(db.folders[id], patch, { updatedAt: Date.now() }); this._save(db); }
  async deleteFolder(id) { const db = this._db(); delete db.folders[id]; for (const s of Object.values(db.sets)) if (s.folderId === id) delete db.sets[s.id]; this._save(db); }
  async listSets(folderId, source) { if (source === 'cache') return null; return Object.values(this._db().sets).filter(s => !folderId || s.folderId === folderId).sort((a, b) => b.updatedAt - a.updatedAt); }
  async getSet(id) { return this._db().sets[id] || null; }
  async createSet(folderId, name, scene) { const db = this._db(); const s = { id: uid(), folderId, name, scene, thumb: '', createdAt: Date.now(), updatedAt: Date.now() }; db.sets[s.id] = s; if (db.folders[folderId]) db.folders[folderId].updatedAt = Date.now(); this._save(db); return s; }
  async updateSet(id, patch) { const db = this._db(); if (!db.sets[id]) return; Object.assign(db.sets[id], patch, { updatedAt: Date.now() }); this._save(db); }
  async deleteSet(id) { const db = this._db(); delete db.sets[id]; this._save(db); }
  async listPresets() { return Object.values(this._db().presets || {}).sort((a, b) => a.createdAt - b.createdAt); }
  async createPreset(p) { const db = this._db(); db.presets ||= {}; const r = { id: uid(), ...p, createdAt: Date.now() }; db.presets[r.id] = r; this._save(db); return r; }
  async deletePreset(id) { const db = this._db(); delete db.presets?.[id]; this._save(db); }
  get canShare() { return false; }
  async saveRender(id, r) { const db = this._db(); db.renders ||= {}; db.renders[id] = r; this._save(db); }
  async getRender(id) { return this._db().renders?.[id] || null; }
}

/* ------------------------------------------------------------------ */
/* Backend Firebase                                                    */
/* ------------------------------------------------------------------ */
class FirebaseBackend {
  constructor(cfg) { this.mode = 'firebase'; this.cfg = cfg; this.user = null; }
  async init() {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
    this.A = A; this.F = F;
    const app = initializeApp(this.cfg);
    this.auth = A.getAuth(app);
    // Connexion mémorisée : reste connecté même après fermeture du navigateur
    await A.setPersistence(this.auth, A.browserLocalPersistence);
    try {
      this.db = F.initializeFirestore(app, {
        localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
        experimentalAutoDetectLongPolling: true,
      });
    } catch (e) { console.warn('[LS] cache Firestore indisponible', e); this.db = F.getFirestore(app); }
    await new Promise(res => { const off = A.onAuthStateChanged(this.auth, u => { this._setUser(u); off(); res(); }); });
    console.info('[LS] Firebase prêt en', Math.round(performance.now()), 'ms');
  }
  _setUser(u) { this.user = u ? { uid: u.uid, name: u.displayName || (u.email || '').split('@')[0], email: u.email, photo: u.photoURL || '' } : null; }
  onAuth(cb) { this.A.onAuthStateChanged(this.auth, u => { this._setUser(u); cb(this.user); }); }
  async signInGoogle() { await this.A.signInWithPopup(this.auth, new this.A.GoogleAuthProvider()); }
  async signInEmail(email, pw) { await this.A.signInWithEmailAndPassword(this.auth, email, pw); }
  async signUpEmail(email, pw) { await this.A.createUserWithEmailAndPassword(this.auth, email, pw); }
  async resetPassword(email) { await this.A.sendPasswordResetEmail(this.auth, email); }
  async signOut() { await this.A.signOut(this.auth); }
  _col(name) { return this.F.collection(this.db, 'users', this.user.uid, name); }
  _doc(name, id) { return this.F.doc(this.db, 'users', this.user.uid, name, id); }
  // source 'cache' : lecture instantanée du cache local (peut être vide) ; sinon serveur
  async _list(name, where, source) {
    const F = this.F; let q = this._col(name);
    if (where) q = F.query(q, F.where(where[0], '==', where[1]));
    const t0 = performance.now();
    let snap;
    if (source === 'cache') { try { snap = await F.getDocsFromCache(q); } catch { return null; } }
    else snap = await F.getDocs(q);
    console.info(`[LS] ${name} (${source || 'serveur'}) : ${snap.size} en ${Math.round(performance.now() - t0)} ms`);
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => b.updatedAt - a.updatedAt);
  }
  async listFolders(source) { return this._list('folders', null, source); }
  async createFolder(name) { const id = uid(); const f = { name, createdAt: Date.now(), updatedAt: Date.now() }; await this.F.setDoc(this._doc('folders', id), f); return { id, ...f }; }
  async updateFolder(id, patch) { await this.F.updateDoc(this._doc('folders', id), { ...patch, updatedAt: Date.now() }); }
  async deleteFolder(id) {
    const sets = await this.listSets(id);
    await Promise.all(sets.map(s => this.F.deleteDoc(this._doc('sets', s.id))));
    await this.F.deleteDoc(this._doc('folders', id));
  }
  async listSets(folderId, source) { return this._list('sets', folderId ? ['folderId', folderId] : null, source); }
  async getSet(id) {
    // cache local d'abord (ouverture instantanée), serveur sinon
    try { const c = await this.F.getDocFromCache(this._doc('sets', id)); if (c.exists()) return { id: c.id, ...c.data() }; } catch {}
    const d = await this.F.getDoc(this._doc('sets', id)); return d.exists() ? { id: d.id, ...d.data() } : null;
  }
  async createSet(folderId, name, scene) {
    const id = uid(); const s = { folderId, name, scene: JSON.stringify(scene), thumb: '', createdAt: Date.now(), updatedAt: Date.now() };
    await this.F.setDoc(this._doc('sets', id), s);
    this.updateFolder(folderId, {}).catch(() => {});
    return { id, ...s, scene };
  }
  async updateSet(id, patch) {
    const p = { ...patch, updatedAt: Date.now() };
    if (p.scene) p.scene = JSON.stringify(p.scene); // les tableaux imbriqués passent mieux en texte
    await this.F.updateDoc(this._doc('sets', id), p);
  }
  async deleteSet(id) { await this.F.deleteDoc(this._doc('sets', id)); }
  async listPresets() { return (await this._list('presets')).map(p => ({ ...p, items: typeof p.items === 'string' ? JSON.parse(p.items) : p.items })).sort((a, b) => a.createdAt - b.createdAt); }
  async createPreset(p) { const id = uid(); const r = { ...p, items: JSON.stringify(p.items), createdAt: Date.now(), updatedAt: Date.now() }; await this.F.setDoc(this._doc('presets', id), r); return { id, ...p }; }
  async deletePreset(id) { await this.F.deleteDoc(this._doc('presets', id)); }
  // rendu calculé sur l'ordi, pour la vue fiche du téléphone (document séparé pour garder l'accueil léger)
  async saveRender(id, r) { await this.F.setDoc(this._doc('renders', id), { ...r, info: JSON.stringify(r.info || null), updatedAt: Date.now() }); }
  async getRender(id) {
    const ref = this._doc('renders', id); let d = null;
    try { d = await this.F.getDocFromCache(ref); } catch {}
    if (!d?.exists()) d = await this.F.getDoc(ref);
    if (!d.exists()) return null; const v = d.data(); return { ...v, info: v.info ? JSON.parse(v.info) : null };
  }
  // partage en lecture seule : copie publique du set dans /shared/{id}
  get canShare() { return true; }
  async publishShare(shareId, set, scene, thumb, render) {
    const id = shareId || uid() + uid();
    const doc = { owner: this.user.uid, ownerName: this.user.name || '', name: set.name, scene: JSON.stringify(scene), thumb: thumb || '', updatedAt: Date.now() };
    if (render) { doc.render = render.img || ''; doc.info = JSON.stringify(render.info || null); }
    await this.F.setDoc(this.F.doc(this.db, 'shared', id), doc, { merge: true });
    return id;
  }
  async unshare(shareId) { await this.F.deleteDoc(this.F.doc(this.db, 'shared', shareId)); }
  async getShared(id) { const d = await this.F.getDoc(this.F.doc(this.db, 'shared', id)); return d.exists() ? { id: d.id, ...d.data() } : null; }
}

// Firestore stocke la scène en texte : on la relit en objet
export function parseScene(s) { if (!s) return null; return migrateScene(typeof s === 'string' ? JSON.parse(s) : s); }

export async function createStore() {
  if (firebaseConfig && firebaseConfig.apiKey) {
    try { const b = new FirebaseBackend(firebaseConfig); await b.init(); return b; }
    catch (e) { console.error('Firebase indisponible, passage en mode local', e); }
  }
  const b = new LocalBackend(); await b.init(); return b;
}
