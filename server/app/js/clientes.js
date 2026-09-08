import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, mountChrome, badge, formatDateEs } from './ui.js';

if (await guard()) {
  mountChrome('clientes', 'Clientes');
  init();
}

let clientes = [];
let expandedId = null;

async function init() {
  document.getElementById('new-client-btn').addEventListener('click', () => {
    document.getElementById('new-client-section').hidden = false;
  });
  document.getElementById('cancel-new-client').addEventListener('click', () => {
    document.getElementById('new-client-section').hidden = true;
  });
  document.getElementById('new-client-form').addEventListener('submit', onCreateClient);
  document.getElementById('search').addEventListener('input', render);

  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    document.getElementById('new-client-section').hidden = false;
    document.getElementById('nc-nombre').focus();
  }

  await loadClients();
}

async function loadClients() {
  try {
    clientes = await apiFetch('/clientes');
  } catch {
    clientes = [];
  }
  render();
}

async function onCreateClient(e) {
  e.preventDefault();
  const errorEl = document.getElementById('new-client-error');
  errorEl.hidden = true;

  const body = {
    nombre: document.getElementById('nc-nombre').value,
    nif: document.getElementById('nc-nif').value || null,
    telefono: document.getElementById('nc-telefono').value || null,
    email: document.getElementById('nc-email').value || null,
    direccion_fiscal: document.getElementById('nc-direccion').value || null,
    notas: document.getElementById('nc-notas').value || null,
  };

  try {
    await apiFetch('/clientes', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('new-client-form').reset();
    document.getElementById('new-client-section').hidden = true;
    await loadClients();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

function render() {
  const listEl = document.getElementById('clients-list');
  listEl.textContent = '';

  const query = document.getElementById('search').value.trim().toLowerCase();
  const filtered = clientes.filter((c) => {
    if (!query) return true;
    return [c.nombre, c.nif, c.email, c.telefono].filter(Boolean).some((f) => f.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    listEl.appendChild(el('div', { className: 'empty-state', text: 'No hay clientes que coincidan.' }));
    return;
  }

  for (const c of filtered) {
    listEl.appendChild(buildClientCard(c));
  }
}

function buildClientCard(c) {
  const card = el('div', { className: 'card' });
  const isExpanded = expandedId === c.id;

  const top = el('div', { className: 'project-card__top', style: 'cursor:pointer;' }, [
    el('div', {}, [
      el('div', { className: 'project-card__name', text: c.nombre }),
      el('div', { className: 'project-card__client', text: [c.nif, c.telefono, c.email].filter(Boolean).join(' · ') || 'Sin datos adicionales' }),
    ]),
  ]);
  top.addEventListener('click', async () => {
    expandedId = isExpanded ? null : c.id;
    render();
  });
  card.appendChild(top);

  if (isExpanded) {
    card.appendChild(buildDetail(c));
  }

  return card;
}

function buildDetail(c) {
  const wrap = el('div', { className: 'mt-16' });

  const form = el('form', { className: 'grid grid-2' });
  form.appendChild(field('Nombre', 'text', c.nombre, 'd-nombre'));
  form.appendChild(field('NIF', 'text', c.nif, 'd-nif'));
  form.appendChild(field('Teléfono', 'text', c.telefono, 'd-telefono'));
  form.appendChild(field('Email', 'email', c.email, 'd-email'));
  wrap.appendChild(form);

  const direccion = field('Dirección fiscal', 'text', c.direccion_fiscal, 'd-direccion');
  wrap.appendChild(direccion);

  const notas = document.createElement('div');
  notas.className = 'field';
  const notasLabel = el('label', { text: 'Notas' });
  const notasArea = el('textarea', { id: 'd-notas' });
  notasArea.value = c.notas || '';
  notas.appendChild(notasLabel);
  notas.appendChild(notasArea);
  wrap.appendChild(notas);

  const actions = el('div', { style: 'display:flex; gap:10px; margin-bottom: 16px;' });
  const saveBtn = el('button', { className: 'btn btn-primary btn-sm', text: 'Guardar cambios' });
  const deleteBtn = el('button', { className: 'btn btn-danger btn-sm', text: 'Eliminar cliente' });
  actions.appendChild(saveBtn);
  actions.appendChild(deleteBtn);
  wrap.appendChild(actions);

  saveBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const body = {
      nombre: document.getElementById('d-nombre').value,
      nif: document.getElementById('d-nif').value,
      telefono: document.getElementById('d-telefono').value,
      email: document.getElementById('d-email').value,
      direccion_fiscal: document.getElementById('d-direccion').value,
      notas: document.getElementById('d-notas').value,
    };
    await apiFetch(`/clientes/${c.id}`, { method: 'PUT', body: JSON.stringify(body) });
    await loadClients();
  });

  deleteBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!confirm(`¿Eliminar al cliente "${c.nombre}"? Esta acción no se puede deshacer.`)) return;
    await apiFetch(`/clientes/${c.id}`, { method: 'DELETE' });
    expandedId = null;
    await loadClients();
  });

  wrap.appendChild(el('h2', { text: 'Proyectos', className: 'mt-16' }));
  const proyectosList = el('div');
  loadClientProjects(c.id, proyectosList);
  wrap.appendChild(proyectosList);

  return wrap;
}

function field(label, type, value, id) {
  const wrapper = el('div', { className: 'field' });
  wrapper.appendChild(el('label', { text: label }));
  const input = el('input', { type, id });
  input.value = value || '';
  wrapper.appendChild(input);
  return wrapper;
}

async function loadClientProjects(clienteId, container) {
  let data;
  try {
    data = await apiFetch(`/clientes/${clienteId}`);
  } catch {
    return;
  }
  const proyectos = data.proyectos || [];
  container.textContent = '';

  if (proyectos.length === 0) {
    container.appendChild(el('p', { className: 'text-muted', text: 'Este cliente no tiene proyectos.' }));
    return;
  }

  for (const p of proyectos) {
    const row = el('div', { className: 'list-row', style: 'cursor:pointer;' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: p.nombre }),
        el('div', { className: 'list-row__meta', text: formatDateEs(p.created_at) }),
      ]),
      badge(p.estado),
    ]);
    row.addEventListener('click', () => { window.location.href = `/app/proyecto.html?id=${p.id}`; });
    container.appendChild(row);
  }
}
