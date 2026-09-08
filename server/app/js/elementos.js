import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, mountChrome } from './ui.js';

if (await guard()) {
  mountChrome('elementos', 'Catálogo de elementos');
  init();
}

let elementos = [];

async function init() {
  document.getElementById('new-element-btn').addEventListener('click', () => {
    document.getElementById('new-element-section').hidden = false;
  });
  document.getElementById('cancel-new-element').addEventListener('click', () => {
    document.getElementById('new-element-section').hidden = true;
  });
  document.getElementById('new-element-form').addEventListener('submit', onCreateElement);
  document.getElementById('search').addEventListener('input', render);

  await loadElements();
}

async function loadElements() {
  try {
    elementos = await apiFetch('/elementos');
  } catch {
    elementos = [];
  }
  render();
}

async function onCreateElement(e) {
  e.preventDefault();
  const errorEl = document.getElementById('new-element-error');
  errorEl.hidden = true;

  const body = {
    nombre: document.getElementById('ne-nombre').value,
    unidad: document.getElementById('ne-unidad').value,
    precio_unitario: parseFloat(document.getElementById('ne-precio').value) || 0,
    descripcion: document.getElementById('ne-descripcion').value || null,
  };

  try {
    await apiFetch('/elementos', { method: 'POST', body: JSON.stringify(body) });
    document.getElementById('new-element-form').reset();
    document.getElementById('new-element-section').hidden = true;
    await loadElements();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
  }
}

function render() {
  const wrap = document.getElementById('elements-table-wrap');
  wrap.textContent = '';

  const query = document.getElementById('search').value.trim().toLowerCase();
  const filtered = elementos.filter((el) => {
    if (!query) return true;
    return [el.nombre, el.descripcion].filter(Boolean).some((f) => f.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    wrap.appendChild(el('div', { className: 'empty-state', text: 'No hay elementos que coincidan.' }));
    return;
  }

  const table = el('table', { className: 'data-table' });
  table.appendChild(el('thead', {}, el('tr', {}, [
    el('th', { text: 'Nombre' }),
    el('th', { text: 'Precio' }),
    el('th', { text: 'Unidad' }),
    el('th', { text: 'Activo' }),
    el('th', { text: '' }),
  ])));

  const tbody = el('tbody');
  for (const item of filtered) {
    tbody.appendChild(buildRow(item));
  }
  table.appendChild(tbody);
  wrap.appendChild(table);
}

function buildRow(item) {
  const nameInput = el('input', { type: 'text', value: item.nombre, style: 'width:100%; border:1px solid transparent; padding:4px; border-radius:4px;' });
  nameInput.value = item.nombre;

  const priceInput = el('input', { type: 'number', step: '0.01', style: 'width:90px; border:1px solid transparent; padding:4px; border-radius:4px;' });
  priceInput.value = item.precio_unitario;

  const unidadSelect = el('select', { style: 'padding:4px; border-radius:4px;' },
    ['ud', 'm2', 'ml', 'hora', 'kg', 'global'].map((u) => {
      const opt = el('option', { value: u, text: u });
      if (u === item.unidad) opt.selected = true;
      return opt;
    })
  );

  const activeToggle = el('input', { type: 'checkbox' });
  activeToggle.checked = !!item.activo;

  const saveRow = async () => {
    await apiFetch(`/elementos/${item.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: nameInput.value,
        precio_unitario: parseFloat(priceInput.value) || 0,
        unidad: unidadSelect.value,
        activo: activeToggle.checked,
      }),
    });
  };

  nameInput.addEventListener('change', saveRow);
  priceInput.addEventListener('change', saveRow);
  unidadSelect.addEventListener('change', saveRow);
  activeToggle.addEventListener('change', saveRow);

  const deleteBtn = el('button', { className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', async () => {
    if (!confirm(`¿Eliminar "${item.nombre}" del catálogo?`)) return;
    await apiFetch(`/elementos/${item.id}`, { method: 'DELETE' });
    await loadElements();
  });

  return el('tr', {}, [
    el('td', {}, nameInput),
    el('td', {}, [priceInput, ' €']),
    el('td', {}, unidadSelect),
    el('td', {}, activeToggle),
    el('td', {}, deleteBtn),
  ]);
}
