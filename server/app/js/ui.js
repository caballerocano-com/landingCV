import { logout } from './auth.js';

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

export { el, formatMoney, formatDateEs, todayIso, badge, mountChrome, ESTADO_LABELS };
