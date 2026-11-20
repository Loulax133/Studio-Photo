import { esc } from './ui.js';

const ERR = {
  'auth/invalid-credential': 'Email ou mot de passe incorrect.',
  'auth/wrong-password': 'Mot de passe incorrect.',
  'auth/user-not-found': 'Aucun compte avec cet email.',
  'auth/email-already-in-use': 'Un compte existe déjà avec cet email.',
  'auth/weak-password': 'Mot de passe trop court (6 caractères minimum).',
  'auth/invalid-email': 'Email invalide.',
  'auth/popup-closed-by-user': 'Fenêtre de connexion fermée.',
  'auth/unauthorized-domain': "Ce domaine n'est pas autorisé dans Firebase (Authentication → Paramètres → Domaines autorisés).",
};

export function renderAuth(root, store) {
  const fb = store.mode === 'firebase';
  let signup = false;
  const draw = () => {
    root.innerHTML = `<div class="auth"><div class="auth-card">
      <div class="brand"><span class="brand-mark"></span>Light Studio</div>
      <h1>${signup ? 'Créer un compte' : 'Bon retour'}</h1>
      <p class="sub">Prépare tes schémas lumière, retrouve-les partout.</p>
      ${fb ? `
        <button class="btn" id="g"><svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>Continuer avec Google</button>
        <div class="sep">ou</div>
        <form id="f">
          <input class="field" name="email" type="email" placeholder="Email" autocomplete="email" required>
          <input class="field" name="pw" type="password" placeholder="Mot de passe" autocomplete="${signup ? 'new-password' : 'current-password'}" required minlength="6">
          <div class="err" id="err"></div>
          <button class="btn primary">${signup ? 'Créer mon compte' : 'Se connecter'}</button>
        </form>
        <div class="switch">${signup ? 'Déjà un compte ?' : 'Pas encore de compte ?'} <button id="sw">${signup ? 'Se connecter' : 'Créer un compte'}</button>
        ${signup ? '' : ' · <button id="rs">Mot de passe oublié</button>'}</div>
      ` : `
        <form id="fl">
          <input class="field" name="name" placeholder="Ton prénom" autocomplete="given-name">
          <button class="btn primary">Entrer dans le studio</button>
        </form>
        <div class="note">Mode local : tes sets sont enregistrés dans ce navigateur uniquement. Une fois Firebase branché, tu te connectes avec ton compte et tout est synchronisé entre ordi et téléphone.</div>
      `}
    </div></div>`;
    const err = m => { const e = root.querySelector('#err'); if (e) e.textContent = m; };
    const fail = e => err(ERR[e.code] || e.message || 'Erreur de connexion.');
    if (fb) {
      root.querySelector('#g').onclick = () => store.signInGoogle().catch(fail);
      root.querySelector('#f').onsubmit = e => {
        e.preventDefault(); const d = new FormData(e.target); err('');
        (signup ? store.signUpEmail : store.signInEmail).call(store, d.get('email'), d.get('pw')).catch(fail);
      };
      root.querySelector('#sw').onclick = () => { signup = !signup; draw(); };
      const rs = root.querySelector('#rs');
      if (rs) rs.onclick = () => {
        const em = root.querySelector('[name=email]').value;
        if (!em) return err("Entre ton email d'abord.");
        store.resetPassword(em).then(() => err('Email de réinitialisation envoyé.')).catch(fail);
      };
    } else {
      root.querySelector('#fl').onsubmit = e => { e.preventDefault(); store.signInLocal(new FormData(e.target).get('name')); };
    }
  };
  draw();
  return {};
}
