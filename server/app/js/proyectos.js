import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, badge, mountChrome, formatDateEs } from './ui.js';

if (await guard()) {
  mountChrome('proyectos', 'Todos los proyectos');
  init();
}

let clientes = [];

async function init() {
  try {
    clientes = await apiFetch('/clientes');
  } catch {
    clientes = [];
  }
  fillClienteSelects();

  document.getElementById('filter-estado').addEventListener('change', loadProjects);
  document.getElementById('filter-cliente').addEventListener('change', loadProjects);

  document.getElementById('new-project-btn').addEventListener('click', () => {
    document.getElementById('new-project-section').hidden = false;
  });
  document.getElementById('cancel-new-project').addEventListener('click', () => {
    document.getElementById('new-project-section').hidden = true;
  });
  document.getElementById('new-project-form').addEventListener('submit', onCreateProject);

  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    document.getElementById('new-project-section').hidden = false;
  }

  loadProjects();

  window.addEventListener('pageshow', () => {
    loadProjects();
  });
}

function fillClienteSelects() {
  for (const selectId of ['np-cliente', 'filter-cliente']) {
    const select = document.getElementById(selectId);
    for (const c of clientes) {
      const opt = el('option', { value: c.id, text: c.nombre });
      select.appendChild(opt);
    }
  }
}

async function onCreateProject(e) {
  e.preventDefault();
  const errorEl = document.getElementById('new-project-error');
  errorEl.hidden = true;

  const body = {
    nombre: document.getElementById('np-nombre').value,
    cliente_id: document.getElementById('np-cliente').value || null,
    tipo_servicio: document.getElementById('np-tipo').value || null,
    direccion_obra: document.getElementById('np-direccion').value || null,
    descripcion: document.getElementById('np-descripcion').value || null,
  };

  try {
    const proyecto = await apiFetch('/proyectos', { method: 'POST', body: JSON.stringify(body) });
    window.location.href = `/app/proyecto.html?id=${proyecto.id}`;
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

async function loadProjects() {
  const wrap = document.getElementById('projects-table-wrap');
  wrap.textContent = '';

  const estado = document.getElementById('filter-estado').value;
  const cliente_id = document.getElementById('filter-cliente').value;

  const query = new URLSearchParams();
  if (estado) query.set('estado', estado);
  if (cliente_id) query.set('cliente_id', cliente_id);

  let proyectos;
  try {
    proyectos = await apiFetch(`/proyectos${query.toString() ? '?' + query.toString() : ''}`);
  } catch {
    wrap.appendChild(el('div', { className: 'empty-state', text: 'No se pudieron cargar los proyectos.' }));
    return;
  }

  if (!proyectos || proyectos.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state', text: 'No hay proyectos que coincidan con el filtro.' }));
    return;
  }

  const table = el('table', { className: 'data-table' });
  const thead = el('thead', {}, el('tr', {}, [
    el('th', { text: 'Proyecto' }),
    el('th', { text: 'Cliente' }),
    el('th', { text: 'Estado' }),
    el('th', { text: 'Creado' }),
  ]));
  table.appendChild(thead);

  const tbody = el('tbody');
  for (const p of proyectos) {
    const row = el('tr', { className: 'is-clickable' }, [
      el('td', { text: p.nombre }),
      el('td', { text: p.cliente_nombre || '—' }),
      el('td', {}, badge(p.estado)),
      el('td', { text: formatDateEs(p.created_at) }),
    ]);
    row.addEventListener('click', () => { window.location.href = `/app/proyecto.html?id=${p.id}`; });
    tbody.appendChild(row);
  }
  table.appendChild(tbody);

  wrap.appendChild(table);
}
