import { logout } from './auth.js';
import { apiFetch } from './api.js';

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === 'className') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value !== undefined && value !== null) {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}

function formatDateEs(isoOrDate) {
  if (!isoOrDate) return '';
  const d = new Date(isoOrDate);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function todayIso() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const ESTADO_LABELS = {
  creado: 'Creado',
  presupuestado: 'Presupuestado',
  en_curso: 'En curso',
  pendiente_cobro: 'Pendiente de cobro',
  cobrado: 'Cobrado',
  finalizado: 'Finalizado',
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
  emitida: 'Emitida',
  cobrada: 'Cobrada',
  vencida: 'Vencida',
  pendiente: 'Pendiente',
  firmado: 'Firmado',
  expirado: 'Expirado',
};

function badge(estado) {
  return el('span', { className: 'badge', 'data-estado': estado, text: ESTADO_LABELS[estado] || estado });
}

// Generic "click outside closes this" registry, backed by a single
// document-level listener. Widgets register their container + close callback
// and are pruned lazily once their container leaves the document, so
// repeatedly opening/closing a form (each time building a fresh widget)
// never accumulates listeners.
const outsideClickRegistry = [];
document.addEventListener('click', (e) => {
  for (let i = outsideClickRegistry.length - 1; i >= 0; i--) {
    const { containerEl, onOutside } = outsideClickRegistry[i];
    if (!document.contains(containerEl)) {
      outsideClickRegistry.splice(i, 1);
      continue;
    }
    if (!containerEl.contains(e.target)) onOutside();
  }
});

function registerOutsideClick(containerEl, onOutside) {
  outsideClickRegistry.push({ containerEl, onOutside });
}

// Tag-style autocomplete for "tipo de servicio": suggests previously used
// values from /api/tipos-servicio and, on blur/Enter, saves a typed value
// that isn't in the list yet so it shows up in future searches.
function buildTipoServicioField(initialValue) {
  const input = el('input', { type: 'text', placeholder: 'Tipo de servicio...' });
  input.value = initialValue || '';

  const dropdown = el('div', { className: 'catalog-dropdown', hidden: '' });
  const wrapper = el('div', { className: 'field catalog-search' }, [
    el('label', { text: 'Tipo de servicio' }),
    input,
    dropdown,
  ]);

  let tiposCache = null;
  const knownValues = new Set();

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.textContent = '';
  }

  function showResults(items) {
    dropdown.textContent = '';
    if (items.length === 0) {
      dropdown.appendChild(el('div', { className: 'catalog-dropdown-empty', text: 'Sin coincidencias' }));
    } else {
      for (const item of items) {
        const row = el('div', { className: 'catalog-dropdown-item', text: item.nombre });
        row.addEventListener('mousedown', (e) => {
          // mousedown (not click) fires before the input's blur handler,
          // so the selection wins over the "save new value" blur logic.
          e.preventDefault();
          input.value = item.nombre;
          closeDropdown();
        });
        dropdown.appendChild(row);
      }
    }
    dropdown.hidden = false;
  }

  async function ensureTiposLoaded() {
    if (tiposCache) return tiposCache;
    try {
      tiposCache = await apiFetch('/tipos-servicio');
    } catch {
      tiposCache = [];
    }
    for (const t of tiposCache) knownValues.add(t.nombre.toLowerCase());
    return tiposCache;
  }

  input.addEventListener('input', async () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      closeDropdown();
      return;
    }
    const tipos = await ensureTiposLoaded();
    showResults(tipos.filter((t) => t.nombre.toLowerCase().includes(query)));
  });

  async function saveIfNew() {
    const value = input.value.trim();
    if (!value) return;
    await ensureTiposLoaded();
    if (knownValues.has(value.toLowerCase())) return;
    knownValues.add(value.toLowerCase());
    try {
      await apiFetch('/tipos-servicio', { method: 'POST', body: JSON.stringify({ nombre: value }) });
    } catch {
      // Non-critical: the project itself still saves with this tipo_servicio
      // text even if it doesn't make it into future autocomplete lists.
    }
  }

  input.addEventListener('blur', () => {
    closeDropdown();
    saveIfNew();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      closeDropdown();
      saveIfNew();
    }
  });

  registerOutsideClick(wrapper, closeDropdown);

  return { wrapper, input };
}

const NAV_LINKS = [
  { href: '/app/dashboard.html', label: 'Panel', key: 'dashboard' },
  { href: '/app/proyectos.html', label: 'Proyectos', key: 'proyectos' },
  { href: '/app/clientes.html', label: 'Clientes', key: 'clientes' },
  { href: '/app/elementos.html', label: 'Catálogo', key: 'elementos' },
];

function mountChrome(activeKey, title) {
  const root = document.getElementById('topbar-root');
  if (!root) return;

  const overlay = el('div', { className: 'nav-overlay', id: 'nav-overlay', hidden: '' });
  const closeBtn = el('button', { className: 'nav-overlay__close', text: '✕', 'aria-label': 'Cerrar menú' });
  const links = el('div', { className: 'nav-overlay__links' },
    NAV_LINKS.map((l) => el('a', { href: l.href, className: l.key === activeKey ? 'is-active' : '', text: l.label }))
  );
  const overlayLogout = el('button', { className: 'nav-overlay__logout', text: 'Salir' });
  overlayLogout.addEventListener('click', () => logout());

  overlay.appendChild(closeBtn);
  overlay.appendChild(links);
  overlay.appendChild(overlayLogout);

  const hamburger = el('button', { className: 'topbar__hamburger', 'aria-label': 'Abrir menú' }, '☰');
  hamburger.addEventListener('click', () => { overlay.hidden = false; });
  closeBtn.addEventListener('click', () => { overlay.hidden = true; });

  const homeBtn = el('a', { href: '/app/dashboard.html', className: 'topbar__home', 'aria-label': 'Panel' },
    el('i', { className: 'ti ti-home' })
  );

  const desktopNav = el('nav', { className: 'topbar__nav' },
    NAV_LINKS.map((l) => el('a', { href: l.href, className: 'topbar__link' + (l.key === activeKey ? ' is-active' : ''), text: l.label }))
  );

  const topbar = el('header', { className: 'topbar' }, [
    homeBtn,
    el('span', { className: 'topbar__brand', text: 'Caballero Cano · Gestión' }),
    el('span', { className: 'topbar__title', text: title || '' }),
    el('span', { className: 'topbar__spacer' }),
    desktopNav,
    hamburger,
  ]);

  root.appendChild(topbar);
  root.appendChild(overlay);
}

export { el, formatMoney, formatDateEs, todayIso, badge, mountChrome, ESTADO_LABELS, registerOutsideClick, buildTipoServicioField };
