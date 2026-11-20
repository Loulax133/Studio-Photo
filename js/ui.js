// Petits utilitaires d'interface : icônes, modales, menus, toasts
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const P = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  more: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  frame: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>',
  out: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l4-4-4-4M14 12H4"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  flash: '<path d="M13 3L5 13h6l-1 8 8-10h-6z"/>',
  softbox: '<path d="M4 6h16v12H4z"/><path d="M8 10h8v4H8z"/>',
  octa: '<path d="M9 3h6l5 5v8l-5 5H9l-5-5V8z"/>',
  strip: '<rect x="9" y="3" width="6" height="18" rx="1"/>',
  dish: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  umbrella: '<path d="M3 12a9 9 0 0 1 18 0zM12 12v7a2 2 0 0 0 4 0"/>',
  snoot: '<path d="M6 8l12-3v14L6 16z"/>',
  grid: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 10h16M4 15h16M10 4v16M15 4v16"/>',
  fresnel: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="2"/>',
  tube: '<rect x="10" y="2" width="4" height="20" rx="2"/>',
  panel: '<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>',
  reflector: '<circle cx="12" cy="12" r="8"/><path d="M8 9a5 5 0 0 1 4-2"/>',
  vflat: '<path d="M4 20V5l8 3 8-3v15l-8-3z"/>',
  flag: '<path d="M5 21V4M5 4h13v9H5"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  person: '<circle cx="12" cy="6" r="3"/><path d="M8 21v-7l-2-1 1-4h10l1 4-2 1v7"/>',
  bg: '<path d="M4 4h16v10c0 4-4 6-8 6H4z"/>',
  top: '<rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  min: '<path d="M6 12h12"/>',
  max: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  move: '<path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/>',
  rotate: '<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M4 16V6a2 2 0 0 1 2-2h10"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  window: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M12 3v18M4 12h16"/>',
  share: '<circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4"/>',
  gridt: '<rect x="3" y="3" width="18" height="18" rx="1.5"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/>',
  ab: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M12 2v20"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  star: '<path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6L3.4 9.3l6-.7z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
};
export const icon = (n, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${P[n] || ''}</svg>`;

export function toast(msg, ms = 2200) {
  const t = document.getElementById('toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, ms);
}

export function modal({ title, text = '', input = null, ok = 'OK', cancel = 'Annuler', danger = false }) {
  return new Promise(res => {
    const root = document.getElementById('modal-root');
    root.innerHTML = `<div class="modal-bg"><form class="modal">
      <h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}
      ${input !== null ? `<input class="field" name="v" value="${esc(input)}" autocomplete="off">` : ''}
      <div class="row"><button type="button" class="btn" data-x>${esc(cancel)}</button>
      <button class="btn primary" ${danger ? 'style="background:#c62828;border-color:#c62828"' : ''}>${esc(ok)}</button></div>
    </form></div>`;
    const f = root.querySelector('form'), inp = f.querySelector('input');
    if (inp) { inp.focus(); inp.select(); }
    const close = v => { root.innerHTML = ''; res(v); };
    f.onsubmit = e => { e.preventDefault(); close(inp ? inp.value.trim() || null : true); };
    f.querySelector('[data-x]').onclick = () => close(null);
    root.querySelector('.modal-bg').onclick = e => { if (e.target.classList.contains('modal-bg')) close(null); };
  });
}

export function popMenu(anchor, items) {
  document.querySelectorAll('.menu').forEach(m => m.remove());
  const m = document.createElement('div'); m.className = 'menu';
  m.innerHTML = items.map((it, i) => `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}${esc(it.label)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = Math.min(r.bottom + 4, innerHeight - m.offsetHeight - 8) + 'px';
  m.style.left = Math.max(8, Math.min(r.right - m.offsetWidth, innerWidth - m.offsetWidth - 8)) + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b) return; m.remove(); items[+b.dataset.i].run(); };
  setTimeout(() => addEventListener('pointerdown', function h(e) { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', h); } }), 0);
}

export function timeAgo(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) return `il y a ${Math.floor(s / 86400)} j`;
  return new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}
