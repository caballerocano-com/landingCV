import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, mountChrome, formatMoney } from './ui.js';

if (await guard()) {
  mountChrome('elementos', 'Catálogo de elementos');
  init();
}

let elementos = [];
let editingId = null; // 'new', an element id, or null — only one form open at a time
let confirmingDeleteId = null;

async function init() {
  document.getElementById('new-element-btn').addEventListener('click', () => {
    editingId = editingId === 'new' ? null : 'new';
    confirmingDeleteId = null;
    render();
  });
  document.getElementById('search').addEventListener('input', renderGrid);

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

function render() {
  renderNewPanel();
  renderGrid();
}

function renderNewPanel() {
  const section = document.getElementById('new-element-section');
  section.textContent = '';
  section.hidden = editingId !== 'new';
  if (editingId !== 'new') return;

  section.appendChild(el('h2', { text: 'Nuevo elemento' }));
  section.appendChild(buildForm(null, async (data) => {
    await apiFetch('/elementos', { method: 'POST', body: JSON.stringify(data) });
    editingId = null;
    await loadElements();
  }, () => {
    editingId = null;
    render();
  }));
}

function renderGrid() {
  const grid = document.getElementById('elements-grid');
  grid.textContent = '';

  const query = document.getElementById('search').value.trim().toLowerCase();
  const filtered = elementos.filter((item) => {
    if (!query) return true;
    return [item.nombre, item.descripcion].filter(Boolean).some((f) => f.toLowerCase().includes(query));
  });

  if (filtered.length === 0) {
    grid.appendChild(el('div', { className: 'empty-state', text: 'No hay elementos que coincidan.' }));
    return;
  }

  for (const item of filtered) {
    grid.appendChild(buildCard(item));
  }
}

function buildCard(item) {
  const card = el('div', { className: 'card element-card' });

  const editBtn = el('button', { className: 'icon-btn', type: 'button', 'aria-label': 'Editar' },
    el('i', { className: 'ti ti-edit' })
  );
  editBtn.addEventListener('click', () => {
    editingId = editingId === item.id ? null : item.id;
    confirmingDeleteId = null;
    render();
  });

  const deleteBtn = el('button', { className: 'icon-btn icon-btn--danger', type: 'button', 'aria-label': 'Eliminar' },
    el('i', { className: 'ti ti-trash' })
  );
  deleteBtn.addEventListener('click', () => {
    confirmingDeleteId = item.id;
    renderGrid();
  });

  const actionsOrConfirm = confirmingDeleteId === item.id
    ? buildDeleteConfirm(item)
    : el('div', { className: 'element-card__actions' }, [editBtn, deleteBtn]);

  const top = el('div', { className: 'element-card__top' }, [
    el('div', {}, [
      el('div', { className: 'element-card__name', text: item.nombre }),
      el('div', {
        className: 'element-card__meta',
        text: `${formatMoney(item.precio_unitario)} / ${item.unidad}${item.activo ? '' : ' · inactivo'}`,
      }),
    ]),
    actionsOrConfirm,
  ]);
  card.appendChild(top);

  if (item.descripcion) {
    card.appendChild(el('div', { className: 'text-muted', text: item.descripcion }));
  }

  if (editingId === item.id) {
    card.appendChild(buildForm(item, async (data) => {
      await apiFetch(`/elementos/${item.id}`, { method: 'PUT', body: JSON.stringify(data) });
      editingId = null;
      await loadElements();
    }, () => {
      editingId = null;
      render();
    }));
  }

  return card;
}

function buildDeleteConfirm(item) {
  const wrap = el('div', { className: 'confirm-inline' }, [el('span', { text: '¿Eliminar?' })]);

  const yes = el('button', { type: 'button', className: 'confirm-yes', text: 'Sí' });
  yes.addEventListener('click', async () => {
    await apiFetch(`/elementos/${item.id}`, { method: 'DELETE' });
    confirmingDeleteId = null;
    await loadElements();
  });

  const no = el('button', { type: 'button', className: 'confirm-no', text: 'No' });
  no.addEventListener('click', () => {
    confirmingDeleteId = null;
    renderGrid();
  });

  wrap.appendChild(yes);
  wrap.appendChild(no);
  return wrap;
}

function buildForm(item, onSave, onCancel) {
  const form = el('form', { className: 'mt-16' });

  const nombreField = labeledInput('Nombre', 'text', item?.nombre);
  nombreField.querySelector('input').required = true;

  const precioField = labeledInput('Precio unitario (€)', 'number', item?.precio_unitario ?? 0);
  const precioInput = precioField.querySelector('input');
  precioInput.step = '0.01';
  precioInput.min = '0';

  const unidadField = el('div', { className: 'field' }, [el('label', { text: 'Unidad' })]);
  const unidadSelect = el('select', {}, ['ud', 'm2', 'ml', 'hora', 'kg', 'global'].map((u) => {
    const opt = el('option', { value: u, text: u });
    if (item ? u === item.unidad : u === 'ud') opt.selected = true;
    return opt;
  }));
  unidadField.appendChild(unidadSelect);

  const activoInputId = `form-activo-${item ? item.id : 'new'}`;
  const activoField = el('div', { className: 'field checkbox-row' });
  const activoCheckbox = el('input', { type: 'checkbox', id: activoInputId });
  activoCheckbox.checked = item ? !!item.activo : true;
  activoField.appendChild(activoCheckbox);
  activoField.appendChild(el('label', { for: activoInputId, text: 'Activo' }));

  const descField = el('div', { className: 'field' }, [el('label', { text: 'Descripción' })]);
  const descArea = el('textarea');
  descArea.value = item?.descripcion || '';
  descField.appendChild(descArea);

  form.appendChild(el('div', { className: 'grid grid-2' }, [nombreField, precioField, unidadField, activoField]));
  form.appendChild(descField);

  const actions = el('div', { style: 'display:flex; gap:10px;' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Guardar' });
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancelar' });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  cancelBtn.addEventListener('click', onCancel);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await onSave({
      nombre: nombreField.querySelector('input').value,
      descripcion: descArea.value,
      precio_unitario: parseFloat(precioInput.value) || 0,
      unidad: unidadSelect.value,
      activo: activoCheckbox.checked,
    });
  });

  return form;
}

function labeledInput(label, type, value) {
  const wrapper = el('div', { className: 'field' });
  wrapper.appendChild(el('label', { text: label }));
  const input = el('input', { type });
  input.value = value ?? '';
  wrapper.appendChild(input);
  return wrapper;
}
