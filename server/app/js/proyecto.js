import { apiFetch, downloadPDF, getToken } from './api.js';
import { guard } from './auth.js';
import { el, badge, mountChrome, formatMoney, formatDateEs, todayIso, ESTADO_LABELS, buildTipoServicioField } from './ui.js';

const params = new URLSearchParams(window.location.search);
const proyectoId = params.get('id');

if (!proyectoId) {
  window.location.href = '/app/proyectos.html';
}

let proyecto = null;
let clientes = [];
let elementosCatalogo = [];
let queueFiles = [];

// Inline edit / confirm state for document lists — only one row across all
// document sections can be in edit or confirm mode at a time.
let editingDoc = null; // { type: 'presupuesto'|'factura'|'encargo', id }
let confirmingDoc = null; // { type, id, action: 'delete'|'anular' }
let showRectificativaForm = false;
let archivosCache = [];
let confirmingItem = null; // { type: 'concepto'|'hora'|'gasto', id } — inline delete confirm

// Reassigned on every renderConceptos() call to point at whichever catalog
// dropdown is currently mounted; a single listener below delegates to it.
let closeActiveCatalogDropdown = () => {};
document.addEventListener('click', (e) => closeActiveCatalogDropdown(e));

if (await guard()) {
  mountChrome('proyectos', 'Proyecto');
  init();
}

async function init() {
  document.getElementById('h-fecha').value = todayIso();
  document.getElementById('i-fecha').value = todayIso();
  document.getElementById('g-fecha').value = todayIso();

  document.getElementById('horas-form').addEventListener('submit', onAddHora);
  document.getElementById('ingresos-form').addEventListener('submit', onAddIngreso);
  document.getElementById('gastos-form').addEventListener('submit', onAddGasto);

  document.getElementById('btn-add-fotos').addEventListener('click', () => {
    document.getElementById('input-galeria').click();
  });

  document.getElementById('input-galeria').addEventListener('change', (e) => onFilesSelected(e.target.files));
  document.getElementById('btn-upload-confirm').addEventListener('click', onUploadConfirm);
  document.getElementById('btn-upload-cancel').addEventListener('click', onUploadCancel);

  document.getElementById('toggle-anulados-pres').addEventListener('change', renderPresupuestos);
  document.getElementById('toggle-anulados-fact').addEventListener('change', renderFacturas);
  document.getElementById('toggle-anulados-enc').addEventListener('change', renderContratos);
  document.getElementById('toggle-anulados-recibos').addEventListener('change', renderIngresos);

  document.getElementById('btn-toggle-danger').addEventListener('click', () => {
    const content = document.getElementById('danger-zone-content');
    const isVisible = content.style.display !== 'none';
    content.style.display = isVisible ? 'none' : '';
  });
  document.getElementById('btn-delete-proyecto').addEventListener('click', () => {
    document.getElementById('btn-delete-proyecto').style.display = 'none';
    document.getElementById('delete-proyecto-confirm').style.display = '';
  });
  document.getElementById('btn-delete-confirm-yes').addEventListener('click', onDeleteProject);
  document.getElementById('btn-delete-confirm-no').addEventListener('click', () => {
    document.getElementById('delete-proyecto-confirm').style.display = 'none';
    document.getElementById('btn-delete-proyecto').style.display = '';
  });

  try {
    [clientes, elementosCatalogo] = await Promise.all([
      apiFetch('/clientes'),
      apiFetch('/elementos'),
    ]);
  } catch {
    clientes = [];
    elementosCatalogo = [];
  }

  await loadProject();

  const action = params.get('action');
  if (action === 'horas') document.getElementById('h-horas').focus();
  if (action === 'gasto') document.getElementById('g-concepto').focus();
}

async function loadProject() {
  try {
    proyecto = await apiFetch(`/proyectos/${proyectoId}`);
  } catch {
    document.getElementById('loading').textContent = 'No se pudo cargar el proyecto.';
    return;
  }

  document.getElementById('loading').hidden = true;
  document.getElementById('project-root').hidden = false;

  renderHeader();
  renderStats();
  renderConceptos();
  renderHoras();
  renderPresupuestos();
  renderFacturas();
  renderContratos();
  renderIngresos();
  renderGastos();
  await loadArchivos();
}

// ── 1. HEADER ────────────────────────────────────────────────────────

function renderHeader() {
  const container = document.getElementById('project-header');
  container.textContent = '';
  document.querySelector('.topbar__title').textContent = proyecto.nombre;

  const top = el('div', { className: 'project-card__top' }, [
    el('div', {}, [
      el('h1', { text: proyecto.nombre, style: 'font-family:var(--heading); font-size:20px; margin-bottom:4px;' }),
      el('div', { className: 'text-muted' }, [
        proyecto.cliente_id
          ? el('a', { href: '/app/clientes.html', text: proyecto.cliente_nombre, style: 'text-decoration:underline;' })
          : el('span', { text: 'Sin cliente' }),
        proyecto.tipo_servicio ? el('span', { text: ' · ' + proyecto.tipo_servicio }) : null,
      ]),
      proyecto.direccion_obra ? el('div', { className: 'text-muted', text: proyecto.direccion_obra }) : null,
    ]),
  ]);
  container.appendChild(top);

  const controls = el('div', { style: 'display:flex; gap:10px; align-items:center; margin-top:12px; flex-wrap:wrap;' });

  const select = el('select', {}, Object.entries({
    creado: ESTADO_LABELS.creado,
    presupuestado: ESTADO_LABELS.presupuestado,
    en_curso: ESTADO_LABELS.en_curso,
    pendiente_cobro: ESTADO_LABELS.pendiente_cobro,
    cobrado: ESTADO_LABELS.cobrado,
    finalizado: ESTADO_LABELS.finalizado,
  }).map(([value, label]) => {
    const opt = el('option', { value, text: label });
    if (value === proyecto.estado) opt.selected = true;
    return opt;
  }));
  select.addEventListener('change', async () => {
    proyecto = await apiFetch(`/proyectos/${proyectoId}/estado`, { method: 'PATCH', body: JSON.stringify({ estado: select.value }) });
    await loadProject();
  });
  controls.appendChild(select);
  controls.appendChild(badge(proyecto.estado));

  const editBtn = el('button', { className: 'btn btn-secondary btn-sm', text: 'Editar datos' });
  editBtn.addEventListener('click', () => toggleEditForm(container));
  controls.appendChild(editBtn);

  container.appendChild(controls);
}

function toggleEditForm(container) {
  const existing = document.getElementById('project-edit-form');
  if (existing) { existing.remove(); return; }

  const form = el('form', { id: 'project-edit-form', className: 'grid grid-2 mt-16' });

  const nombreField = labeledInput('Nombre', 'text', proyecto.nombre);
  const clienteField = el('div', { className: 'field' }, [
    el('label', { text: 'Cliente' }),
    el('select', {}, [el('option', { value: '', text: 'Sin cliente' })].concat(
      clientes.map((c) => {
        const opt = el('option', { value: c.id, text: c.nombre });
        if (c.id === proyecto.cliente_id) opt.selected = true;
        return opt;
      })
    )),
  ]);
  const tipoField = buildTipoServicioField(proyecto.tipo_servicio);
  const direccionField = labeledInput('Dirección de obra', 'text', proyecto.direccion_obra);

  form.appendChild(nombreField);
  form.appendChild(clienteField);
  form.appendChild(tipoField.wrapper);
  form.appendChild(direccionField);

  const descField = el('div', { className: 'field', style: 'grid-column: 1 / -1;' }, [
    el('label', { text: 'Descripción' }),
  ]);
  const descArea = el('textarea');
  descArea.value = proyecto.descripcion || '';
  descField.appendChild(descArea);
  form.appendChild(descField);

  const actions = el('div', { style: 'grid-column: 1 / -1; display:flex; gap:10px;' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Guardar' });
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch(`/proyectos/${proyectoId}`, {
      method: 'PUT',
      body: JSON.stringify({
        nombre: nombreField.querySelector('input').value,
        cliente_id: clienteField.querySelector('select').value || null,
        tipo_servicio: tipoField.input.value.trim() || null,
        direccion_obra: direccionField.querySelector('input').value,
        descripcion: descArea.value,
      }),
    });
    await loadProject();
  });

  container.appendChild(form);
}

function labeledInput(label, type, value) {
  const wrapper = el('div', { className: 'field' });
  wrapper.appendChild(el('label', { text: label }));
  const input = el('input', { type });
  input.value = value || '';
  wrapper.appendChild(input);
  return wrapper;
}

// ── 2. STATS ─────────────────────────────────────────────────────────

function renderStats() {
  const container = document.getElementById('project-stats');
  container.textContent = '';
  const c = proyecto.counts;
  const items = [
    ['Conceptos', c.conceptos, '#section-conceptos'],
    ['Horas', c.horas, '#section-horas'],
    ['Presupuestos', c.presupuestos, '#section-presupuestos'],
    ['Facturas', c.facturas, '#section-facturas'],
    ['Encargos', c.contratos, '#section-encargos'],
    ['Ingresos', c.ingresos, '#section-ingresos'],
  ];
  for (const [label, value, href] of items) {
    container.appendChild(el('a', { className: 'stat-pill', href }, [
      el('strong', { text: String(value) }),
      ' ' + label,
    ]));
  }
}

// ── 3. CONCEPTOS ─────────────────────────────────────────────────────

const UNIDAD_OPTIONS = [
  ['ud', 'Unidades (ud)'],
  ['hora', 'Horas (h)'],
  ['m2', 'Metros cuadrados (m²)'],
  ['ml', 'Metros lineales (ml)'],
  ['kg', 'Kilogramos (kg)'],
  ['global', 'Global'],
];

function buildUnidadSelect(initialValue) {
  return el('select', {}, UNIDAD_OPTIONS.map(([value, label]) => {
    const opt = el('option', { value, text: label });
    if (value === (initialValue || 'ud')) opt.selected = true;
    return opt;
  }));
}

function precioLabelText(unidad) {
  return unidad === 'hora' ? 'Precio por hora (€)' : 'Precio (€)';
}

function renderConceptos() {
  const addContainer = document.getElementById('conceptos-add');
  addContainer.textContent = '';

  const form = el('form', { className: 'inline-form concept-form', style: 'flex-direction:column; align-items:stretch;' });

  const cantidadInput = el('input', { type: 'number', step: '0.01', value: '1' });
  const precioInput = el('input', { type: 'number', step: '0.01', value: '0' });
  const unidadSelect = buildUnidadSelect('ud');
  const priceLabel = el('label', { text: precioLabelText('ud') });
  const priceError = el('p', { className: 'error-text', hidden: '' });

  unidadSelect.addEventListener('change', () => {
    priceLabel.textContent = precioLabelText(unidadSelect.value);
  });

  let selectedElementoId = null;

  const searchInput = el('input', { type: 'text', placeholder: 'Buscar en catálogo...' });
  const dropdown = el('div', { className: 'catalog-dropdown', hidden: '' });
  const searchWrap = el('div', { className: 'field catalog-search' }, [
    el('label', { text: 'Concepto (buscar en catálogo)' }),
    searchInput,
    dropdown,
  ]);

  function closeDropdown() {
    dropdown.hidden = true;
    dropdown.textContent = '';
  }

  function applyElemento(item) {
    selectedElementoId = item.id;
    precioInput.value = item.precio_unitario;
    unidadSelect.value = item.unidad;
    priceLabel.textContent = precioLabelText(item.unidad);
    searchInput.value = item.nombre;
    closeDropdown();
  }

  function showResults(rawQuery, items) {
    dropdown.textContent = '';
    if (items.length > 0) {
      for (const item of items) {
        const row = el('div', {
          className: 'catalog-dropdown-item',
          text: `${item.nombre} — ${formatMoney(item.precio_unitario)}/${item.unidad}`,
        });
        row.addEventListener('click', () => applyElemento(item));
        dropdown.appendChild(row);
      }
    } else if (rawQuery.length >= 2) {
      const createRow = el('div', {
        className: 'catalog-dropdown-item',
        style: 'color: var(--accent); font-weight: 600;',
        text: `+ Crear elemento nuevo: "${rawQuery}"`,
      });
      createRow.addEventListener('click', async () => {
        let nuevo;
        try {
          nuevo = await apiFetch('/elementos', {
            method: 'POST',
            body: JSON.stringify({ nombre: rawQuery, precio_unitario: 0, unidad: 'ud' }),
          });
        } catch {
          return;
        }
        elementosCatalogo.push(nuevo);
        applyElemento(nuevo);
        precioInput.focus();
      });
      dropdown.appendChild(createRow);
    } else {
      dropdown.appendChild(el('div', { className: 'catalog-dropdown-empty', text: 'Sin resultados' }));
    }
    dropdown.hidden = false;
  }

  searchInput.addEventListener('input', async () => {
    selectedElementoId = null;
    const rawQuery = searchInput.value.trim();
    const query = rawQuery.toLowerCase();
    if (!query) {
      closeDropdown();
      precioInput.value = '0';
      unidadSelect.value = 'ud';
      priceLabel.textContent = precioLabelText('ud');
      return;
    }
    // Elementos are already loaded at page init; only hit the API if that
    // load hasn't happened yet, rather than re-fetching on every keystroke.
    if (elementosCatalogo.length === 0) {
      try { elementosCatalogo = await apiFetch('/elementos'); } catch { elementosCatalogo = []; }
    }
    const matches = elementosCatalogo.filter((e) => e.activo && e.nombre.toLowerCase().includes(query));
    showResults(rawQuery, matches);
  });

  // A single document-level listener (registered once in init()) delegates
  // to whichever dropdown is currently open, so re-rendering this form on
  // every reload never accumulates extra document listeners.
  closeActiveCatalogDropdown = (e) => {
    if (!searchWrap.contains(e.target)) closeDropdown();
  };

  const precioFieldWrap = el('div', { className: 'field' }, [priceLabel, precioInput, priceError]);

  const row1 = el('div', { className: 'form-row' }, [searchWrap]);
  const row2 = el('div', { className: 'form-row' }, [
    fieldWrap('Cant.', cantidadInput),
    fieldWrap('Ud.', unidadSelect),
    precioFieldWrap,
  ]);

  form.appendChild(row1);
  form.appendChild(row2);

  const addBtn = el('button', {
    type: 'submit',
    className: 'btn btn-primary btn-sm',
    style: 'align-self:flex-start;',
    text: 'Añadir concepto',
  });
  form.appendChild(addBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    priceError.hidden = true;

    const nombre = searchInput.value.trim();
    if (!nombre) return;

    const precio = parseFloat(precioInput.value);
    if (!precio || precio <= 0) {
      priceError.textContent = 'El precio no puede ser 0. Define un precio estimado.';
      priceError.hidden = false;
      return;
    }

    await apiFetch(`/proyectos/${proyectoId}/conceptos`, {
      method: 'POST',
      body: JSON.stringify({
        elemento_id: selectedElementoId,
        nombre,
        cantidad: parseFloat(cantidadInput.value) || 1,
        precio_unitario: precio,
        unidad: unidadSelect.value,
      }),
    });
    await loadProject();
  });

  addContainer.appendChild(form);

  const listEl = document.getElementById('conceptos-list');
  listEl.textContent = '';

  if (proyecto.conceptos.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted mt-16', text: 'Sin conceptos todavía.' }));
  }

  let subtotal = 0;
  for (const c of proyecto.conceptos) {
    subtotal += (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0);
    listEl.appendChild(buildConceptoRow(c));
  }

  const iva = subtotal * 0.21;
  const total = subtotal + iva;
  const totalsEl = document.getElementById('conceptos-totals');
  totalsEl.textContent = '';
  totalsEl.appendChild(totalItem('Subtotal', formatMoney(subtotal)));
  totalsEl.appendChild(totalItem('IVA (21%)', formatMoney(iva)));
  totalsEl.appendChild(totalItem('TOTAL', formatMoney(total), true));
}

function fieldWrap(label, inputEl) {
  const wrapper = el('div', { className: 'field' });
  wrapper.appendChild(el('label', { text: label }));
  wrapper.appendChild(inputEl);
  return wrapper;
}

function totalItem(label, value, isTotal) {
  return el('div', { className: 'totals-row__item' }, [
    el('div', { className: 'totals-row__label', text: label }),
    el('div', { className: 'totals-row__value' + (isTotal ? ' totals-row__value--total' : ''), text: value }),
  ]);
}

function formatConceptoLine(c) {
  const lineTotal = (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0);
  const precioStr = formatMoney(c.precio_unitario);
  const totalStr = formatMoney(lineTotal);
  if (c.unidad === 'hora') {
    return `${c.cantidad} h × ${precioStr}/h = ${totalStr}`;
  }
  return `${c.cantidad} ${c.unidad} × ${precioStr} = ${totalStr}`;
}

// Shared inline delete-confirm for the plain list sections below (conceptos,
// horas, gastos) — same "Sí / No" pattern used everywhere else in the app,
// never a browser confirm().
const SIMPLE_API_PATH = { concepto: '/conceptos', hora: '/horas', gasto: '/gastos' };

function rerenderSimpleSection(type) {
  if (type === 'concepto') renderConceptos();
  else if (type === 'hora') renderHoras();
  else if (type === 'gasto') renderGastos();
}

function buildSimpleDeleteConfirm(type, id) {
  return buildConfirmInline('¿Eliminar? Esta acción no se puede deshacer.', async () => {
    await apiFetch(`${SIMPLE_API_PATH[type]}/${id}`, { method: 'DELETE' });
    confirmingItem = null;
    await loadProject();
  }, () => {
    confirmingItem = null;
    rerenderSimpleSection(type);
  });
}

function buildConceptoRow(c) {
  const checkbox = el('input', { type: 'checkbox' });
  checkbox.checked = !!c.completado;
  checkbox.addEventListener('change', async () => {
    await apiFetch(`/conceptos/${c.id}/completado`, { method: 'PATCH', body: JSON.stringify({ completado: checkbox.checked }) });
    await loadProject();
  });

  const priceInput = el('input', { type: 'number', step: '0.01', style: 'width:90px;', title: precioLabelText(c.unidad) });
  priceInput.value = c.precio_unitario;
  priceInput.addEventListener('change', async () => {
    await apiFetch(`/conceptos/${c.id}`, { method: 'PUT', body: JSON.stringify({ precio_unitario: parseFloat(priceInput.value) || 0 }) });
    await loadProject();
  });

  const deleteBtn = el('button', { type: 'button', className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', () => {
    confirmingItem = { type: 'concepto', id: c.id };
    renderConceptos();
  });

  const mainRow = el('div', { className: 'list-row' }, [
    checkbox,
    el('div', { className: 'list-row__main' }, [
      el('div', { text: c.nombre, style: c.completado ? 'text-decoration:line-through; color:var(--text-muted);' : '' }),
      el('div', { className: 'list-row__meta', text: formatConceptoLine(c) }),
    ]),
    priceInput,
    deleteBtn,
  ]);

  const isConfirmingDelete = confirmingItem && confirmingItem.type === 'concepto' && confirmingItem.id === c.id;
  const isHora = c.unidad === 'hora';

  if (!isConfirmingDelete && !isHora) {
    return mainRow;
  }

  const wrapper = el('div', {});
  wrapper.appendChild(mainRow);

  if (isConfirmingDelete) {
    wrapper.appendChild(buildSimpleDeleteConfirm('concepto', c.id));
  }

  if (isHora) {
    const actionArea = el('div', { className: 'mt-8', style: 'padding-left:26px;' });
    renderUseHoursAction(c, actionArea);
    wrapper.appendChild(actionArea);
  }

  return wrapper;
}

function renderUseHoursAction(c, container) {
  container.textContent = '';
  const btn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm' }, [
    el('i', { className: 'ti ti-clock' }),
    ' Usar horas reales',
  ]);
  btn.addEventListener('click', async () => {
    let horasList;
    try {
      horasList = await apiFetch(`/horas?proyecto_id=${proyectoId}`);
    } catch {
      horasList = [];
    }
    const totalHoras = (horasList || []).reduce((sum, h) => sum + (Number(h.horas) || 0), 0);

    container.textContent = '';

    if (totalHoras === 0) {
      const msg = el('div', { className: 'confirm-inline' }, [
        el('span', { className: 'text-muted', text: 'No hay horas registradas' }),
      ]);
      const closeBtn = el('button', { type: 'button', className: 'confirm-no', text: 'Cerrar' });
      closeBtn.addEventListener('click', () => renderUseHoursAction(c, container));
      msg.appendChild(closeBtn);
      container.appendChild(msg);
      return;
    }

    const nuevoTotal = totalHoras * (Number(c.precio_unitario) || 0);
    const confirmWrap = el('div', { className: 'confirm-inline' }, [
      el('span', {
        text: `Actualizar cantidad a ${totalHoras}h — el total pasará a ${formatMoney(nuevoTotal)}. ¿Confirmar?`,
      }),
    ]);
    const yes = el('button', { type: 'button', className: 'confirm-yes', text: 'Sí' });
    yes.addEventListener('click', async () => {
      await apiFetch(`/conceptos/${c.id}`, { method: 'PATCH', body: JSON.stringify({ cantidad: totalHoras }) });
      await loadProject();
    });
    const no = el('button', { type: 'button', className: 'confirm-no', text: 'No' });
    no.addEventListener('click', () => renderUseHoursAction(c, container));
    confirmWrap.appendChild(yes);
    confirmWrap.appendChild(no);
    container.appendChild(confirmWrap);
  });
  container.appendChild(btn);
}

// ── 4. HORAS ─────────────────────────────────────────────────────────

function renderHoras() {
  const listEl = document.getElementById('horas-list');
  listEl.textContent = '';

  if (proyecto.horas.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin horas registradas.' }));
    return;
  }

  for (const h of proyecto.horas) {
    listEl.appendChild(buildHoraRow(h));
  }
}

function buildHoraRow(h) {
  const deleteBtn = el('button', { type: 'button', className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', () => {
    confirmingItem = { type: 'hora', id: h.id };
    renderHoras();
  });

  const mainRow = el('div', { className: 'list-row' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { text: `${formatDateEs(h.fecha)} · ${h.horas} h` }),
      h.descripcion ? el('div', { className: 'list-row__meta', text: h.descripcion }) : null,
    ]),
    deleteBtn,
  ]);

  const isConfirmingDelete = confirmingItem && confirmingItem.type === 'hora' && confirmingItem.id === h.id;
  if (!isConfirmingDelete) return mainRow;

  const wrapper = el('div', {});
  wrapper.appendChild(mainRow);
  wrapper.appendChild(buildSimpleDeleteConfirm('hora', h.id));
  return wrapper;
}

async function onAddHora(e) {
  e.preventDefault();
  const fecha = document.getElementById('h-fecha').value;
  const horas = parseFloat(document.getElementById('h-horas').value);
  const descripcion = document.getElementById('h-descripcion').value;
  if (!fecha || !horas) return;

  await apiFetch('/horas', { method: 'POST', body: JSON.stringify({ proyecto_id: proyectoId, fecha, horas, descripcion }) });
  document.getElementById('horas-form').reset();
  document.getElementById('h-fecha').value = todayIso();
  await loadProject();
}

// ── 5. DOCUMENTOS ────────────────────────────────────────────────────

const API_PATH_BY_DOC_TYPE = {
  presupuesto: '/presupuestos',
  factura: '/facturas',
  encargo: '/contratos',
  recibo: '/recibos',
};

function rerenderDocSection(type) {
  if (type === 'presupuesto') renderPresupuestos();
  else if (type === 'factura') renderFacturas();
  else if (type === 'encargo') renderContratos();
  else if (type === 'recibo') renderIngresos();
}

function buildConfirmInline(message, onYes, onNo) {
  const yes = el('button', { type: 'button', className: 'confirm-yes', text: 'Sí' });
  const no = el('button', { type: 'button', className: 'confirm-no', text: 'No' });
  yes.addEventListener('click', onYes);
  no.addEventListener('click', onNo);
  const actions = el('div', { className: 'confirm-inline-actions' }, [yes, no]);
  return el('div', { className: 'confirm-inline' }, [el('span', { text: message }), actions]);
}

function buildDocConfirmRow(type, id, action) {
  const apiPath = API_PATH_BY_DOC_TYPE[type];
  const message = action === 'delete'
    ? '¿Eliminar? Esta acción no se puede deshacer.'
    : '¿Anular este documento?';

  return buildConfirmInline(message, async () => {
    if (action === 'delete') {
      await apiFetch(`${apiPath}/${id}`, { method: 'DELETE' });
    } else {
      await apiFetch(`${apiPath}/${id}/anular`, { method: 'PATCH' });
    }
    confirmingDoc = null;
    await loadProject();
  }, () => {
    confirmingDoc = null;
    rerenderDocSection(type);
  });
}

function docActionButtons({ type, id, deletable, anulable, onEdit }) {
  const wrap = el('div', { style: 'display:flex; gap:8px; align-items:center; flex-wrap:wrap;' });

  if (onEdit) {
    const editBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm' }, el('i', { className: 'ti ti-edit' }));
    editBtn.addEventListener('click', onEdit);
    wrap.appendChild(editBtn);
  }

  if (deletable) {
    const delBtn = el('button', { type: 'button', className: 'btn btn-danger btn-sm' }, el('i', { className: 'ti ti-trash' }));
    delBtn.addEventListener('click', () => {
      confirmingDoc = { type, id, action: 'delete' };
      rerenderDocSection(type);
    });
    wrap.appendChild(delBtn);
  }

  if (anulable) {
    const anularBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Anular' });
    anularBtn.addEventListener('click', () => {
      confirmingDoc = { type, id, action: 'anular' };
      rerenderDocSection(type);
    });
    wrap.appendChild(anularBtn);
  }

  return wrap;
}

// ── Presupuestos ─────────────────────────────────────────────────────

function buildPresupuestoEditForm(p) {
  const form = el('form', { className: 'mt-8' });

  const estadoField = el('div', { className: 'field' }, [el('label', { text: 'Estado' })]);
  const estadoSelect = el('select', {}, ['borrador', 'enviado', 'aceptado', 'rechazado'].map((v) => {
    const opt = el('option', { value: v, text: ESTADO_LABELS[v] || v });
    if (v === p.estado) opt.selected = true;
    return opt;
  }));
  estadoField.appendChild(estadoSelect);

  const porcentajeField = el('div', { className: 'field' }, [el('label', { text: '% a solicitar' })]);
  const porcentajeSelect = el('select', {}, [100, 50, 40, 30].map((v) => {
    const opt = el('option', { value: v, text: `${v}%` });
    if (v === p.porcentaje_cobro) opt.selected = true;
    return opt;
  }));
  porcentajeField.appendChild(porcentajeSelect);

  const notasField = el('div', { className: 'field' }, [el('label', { text: 'Notas' })]);
  const notasArea = el('textarea');
  notasArea.value = p.notas || '';
  notasField.appendChild(notasArea);

  form.appendChild(el('div', { className: 'grid grid-2' }, [estadoField, porcentajeField]));
  form.appendChild(notasField);

  const actions = el('div', { style: 'display:flex; gap:10px;' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Guardar' });
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancelar' });
  cancelBtn.addEventListener('click', () => { editingDoc = null; renderPresupuestos(); });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch(`/presupuestos/${p.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        estado: estadoSelect.value,
        porcentaje_cobro: parseInt(porcentajeSelect.value, 10),
        notas: notasArea.value,
      }),
    });
    editingDoc = null;
    await loadProject();
  });

  return form;
}

function buildPresupuestoRow(p) {
  const isAnulado = p.estado === 'anulado';
  const isBorrador = p.estado === 'borrador';
  const isConfirming = confirmingDoc && confirmingDoc.type === 'presupuesto' && confirmingDoc.id === p.id;

  const pdfBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'PDF' });
  pdfBtn.addEventListener('click', () => downloadPDF(`/api/presupuestos/${p.id}/pdf`, `${p.numero}.pdf`));

  const mainRow = el('div', { className: 'doc-row__main' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { className: 'doc-numero', text: p.numero }),
      el('div', { className: 'list-row__meta', text: formatDateEs(p.created_at) }),
    ]),
    badge(p.estado),
    pdfBtn,
  ]);

  const row = el('div', { className: 'doc-row' + (isAnulado ? ' doc-anulado' : '') }, [mainRow]);

  if (isConfirming) {
    row.appendChild(buildDocConfirmRow('presupuesto', p.id, confirmingDoc.action));
  } else if (!isAnulado) {
    row.appendChild(docActionButtons({
      type: 'presupuesto',
      id: p.id,
      deletable: isBorrador,
      anulable: !isBorrador,
      onEdit: isBorrador ? () => {
        editingDoc = editingDoc && editingDoc.type === 'presupuesto' && editingDoc.id === p.id ? null : { type: 'presupuesto', id: p.id };
        renderPresupuestos();
      } : null,
    }));
  }

  if (editingDoc && editingDoc.type === 'presupuesto' && editingDoc.id === p.id) {
    row.appendChild(buildPresupuestoEditForm(p));
  }

  return row;
}

function renderPresupuestos() {
  const listEl = document.getElementById('presupuestos-list');
  listEl.textContent = '';

  const showAnulados = document.getElementById('toggle-anulados-pres').checked;
  const items = proyecto.presupuestos.filter((p) => showAnulados || p.estado !== 'anulado');

  if (items.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin presupuestos generados.' }));
  }
  for (const p of items) {
    listEl.appendChild(buildPresupuestoRow(p));
  }

  const formWrap = document.getElementById('presupuestos-form-wrap');
  formWrap.textContent = '';
  const form = el('form', { className: 'inline-form' });
  const porcentaje = el('select', {}, [100, 50, 40, 30].map((v) => el('option', { value: v, text: `${v}%` })));
  form.appendChild(fieldWrap('% a solicitar', porcentaje));

  const anexoCheckPres = el('input', { type: 'checkbox', id: 'check-anexo-pres' });
  form.appendChild(el('div', { className: 'anexo-check-row', style: 'display:none; width:100%;' },
    el('label', {}, [anexoCheckPres, ' Incluir anexo de fotos de obra'])
  ));

  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Nuevo presupuesto' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/presupuestos', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: proyectoId,
        porcentaje_cobro: parseInt(porcentaje.value, 10),
        incluirFotos: anexoCheckPres.checked,
      }),
    });
    await loadProject();
  });
  formWrap.appendChild(form);
  updateAnexoCheckVisibility(archivosCache);
}

// ── Facturas (+ rectificativas) ──────────────────────────────────────

function buildFacturaEditForm(f) {
  const form = el('form', { className: 'mt-8' });

  const estadoField = el('div', { className: 'field' }, [el('label', { text: 'Estado' })]);
  const estadoSelect = el('select', {}, ['borrador', 'emitida'].map((v) => {
    const opt = el('option', { value: v, text: ESTADO_LABELS[v] || v });
    if (v === f.estado) opt.selected = true;
    return opt;
  }));
  estadoField.appendChild(estadoSelect);

  const vencField = el('div', { className: 'field' }, [el('label', { text: 'Fecha de vencimiento' })]);
  const vencInput = el('input', { type: 'date' });
  vencInput.value = f.fecha_vencimiento || '';
  vencField.appendChild(vencInput);

  const notasField = el('div', { className: 'field' }, [el('label', { text: 'Notas' })]);
  const notasArea = el('textarea');
  notasArea.value = f.notas || '';
  notasField.appendChild(notasArea);

  form.appendChild(el('div', { className: 'grid grid-2' }, [estadoField, vencField]));
  form.appendChild(notasField);

  const actions = el('div', { style: 'display:flex; gap:10px;' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Guardar' });
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancelar' });
  cancelBtn.addEventListener('click', () => { editingDoc = null; renderFacturas(); });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch(`/facturas/${f.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        estado: estadoSelect.value,
        fecha_vencimiento: vencInput.value || null,
        notas: notasArea.value,
      }),
    });
    editingDoc = null;
    await loadProject();
  });

  return form;
}

function buildFacturaRow(f) {
  const isAnulado = f.estado === 'anulada';
  const isBorrador = f.estado === 'borrador';
  const isRect = !!f.es_rectificativa;
  const isConfirming = confirmingDoc && confirmingDoc.type === 'factura' && confirmingDoc.id === f.id;

  const pdfBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'PDF' });
  pdfBtn.addEventListener('click', () => downloadPDF(`/api/facturas/${f.id}/pdf`, `${f.numero}.pdf`));

  const statusBadge = isRect
    ? el('span', { className: 'badge', 'data-estado': 'rect', text: 'RECT' })
    : badge(f.estado);

  const mainRow = el('div', { className: 'doc-row__main' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { className: 'doc-numero', text: f.numero }),
      el('div', { className: 'list-row__meta', text: formatDateEs(f.created_at) }),
    ]),
    statusBadge,
    pdfBtn,
  ]);

  const row = el('div', { className: 'doc-row' + (isAnulado ? ' doc-anulado' : '') }, [mainRow]);

  if (isRect && f.factura_original_id) {
    const original = proyecto.facturas.find((x) => x.id === f.factura_original_id);
    row.appendChild(el('div', { className: 'doc-row__ref', text: `Rectifica: ${original ? original.numero : 'FACT-' + f.factura_original_id}` }));
  }

  if (isConfirming) {
    row.appendChild(buildDocConfirmRow('factura', f.id, confirmingDoc.action));
  } else if (!isAnulado && f.estado !== 'cobrada') {
    row.appendChild(docActionButtons({
      type: 'factura',
      id: f.id,
      deletable: isBorrador,
      anulable: f.estado === 'emitida' || f.estado === 'vencida',
      onEdit: isBorrador ? () => {
        editingDoc = editingDoc && editingDoc.type === 'factura' && editingDoc.id === f.id ? null : { type: 'factura', id: f.id };
        renderFacturas();
      } : null,
    }));
  }

  if (editingDoc && editingDoc.type === 'factura' && editingDoc.id === f.id) {
    row.appendChild(buildFacturaEditForm(f));
  }

  return row;
}

function renderRectificativaForm() {
  const wrap = document.getElementById('rectificativa-form-wrap');
  wrap.textContent = '';
  if (!showRectificativaForm) return;

  const facturasRectificables = proyecto.facturas.filter((f) => f.estado !== 'borrador' && !f.es_rectificativa);
  if (facturasRectificables.length === 0) {
    wrap.appendChild(el('p', { className: 'text-muted mt-8', text: 'No hay facturas emitidas que rectificar.' }));
    return;
  }

  const form = el('form', { className: 'inline-form mt-8', style: 'flex-direction:column; align-items:stretch;' });
  const select = el('select', {}, facturasRectificables.map((f) => el('option', { value: f.id, text: `${f.numero} — ${formatDateEs(f.created_at)}` })));
  const notasArea = el('textarea', { placeholder: 'Motivo de la rectificación' });

  form.appendChild(fieldWrap('Factura a rectificar', select));
  form.appendChild(fieldWrap('Notas', notasArea));

  const actions = el('div', { style: 'display:flex; gap:10px;' });
  actions.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Crear rectificativa' }));
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancelar' });
  cancelBtn.addEventListener('click', () => { showRectificativaForm = false; renderRectificativaForm(); });
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/facturas', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: proyectoId,
        es_rectificativa: true,
        factura_original_id: parseInt(select.value, 10),
        notas: notasArea.value,
      }),
    });
    showRectificativaForm = false;
    await loadProject();
  });

  wrap.appendChild(form);
}

function renderFacturas() {
  const listEl = document.getElementById('facturas-list');
  listEl.textContent = '';

  const showAnulados = document.getElementById('toggle-anulados-fact').checked;
  const items = proyecto.facturas.filter((f) => showAnulados || (f.estado !== 'anulada' && !f.es_rectificativa));

  if (items.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin facturas generadas.' }));
  }
  for (const f of items) {
    listEl.appendChild(buildFacturaRow(f));
  }

  const formWrap = document.getElementById('facturas-form-wrap');
  formWrap.textContent = '';
  const form = el('form', { className: 'inline-form' });
  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Nueva factura' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/facturas', { method: 'POST', body: JSON.stringify({ proyecto_id: proyectoId }) });
    await loadProject();
  });
  formWrap.appendChild(form);

  const rectBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm mt-8', text: 'Nueva rectificativa' });
  rectBtn.addEventListener('click', () => {
    showRectificativaForm = !showRectificativaForm;
    renderRectificativaForm();
  });
  formWrap.appendChild(rectBtn);

  renderRectificativaForm();
}

// ── Encargos (hojas de encargo) ──────────────────────────────────────

function buildContratoEditForm(c) {
  const form = el('form', { className: 'mt-8' });
  const metodoField = labeledInput('Método de pago', 'text', c.metodo_pago);
  const plazosField = labeledInput('Plazos de pago', 'text', c.plazos_pago);
  const terminosField = el('div', { className: 'field' }, [el('label', { text: 'Términos' })]);
  const terminosArea = el('textarea');
  terminosArea.value = c.terminos || '';
  terminosField.appendChild(terminosArea);

  form.appendChild(metodoField);
  form.appendChild(plazosField);
  form.appendChild(terminosField);

  const actions = el('div', { style: 'display:flex; gap:10px;' });
  const saveBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Guardar' });
  const cancelBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Cancelar' });
  cancelBtn.addEventListener('click', () => { editingDoc = null; renderContratos(); });
  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);
  form.appendChild(actions);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch(`/contratos/${c.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        metodo_pago: metodoField.querySelector('input').value,
        plazos_pago: plazosField.querySelector('input').value,
        terminos: terminosArea.value,
      }),
    });
    editingDoc = null;
    await loadProject();
  });

  return form;
}

function buildContratoRow(c) {
  const isAnulado = c.estado === 'anulado';
  const isBorrador = c.estado === 'borrador';
  const isConfirming = confirmingDoc && confirmingDoc.type === 'encargo' && confirmingDoc.id === c.id;

  const mainRow = el('div', { className: 'doc-row__main' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { className: 'doc-numero', text: `Encargo ${c.numero || '#' + c.id}` }),
      el('div', { className: 'list-row__meta', text: formatDateEs(c.created_at) }),
    ]),
    badge(c.estado),
  ]);

  if (c.estado === 'firmado') {
    const pdfBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'PDF' });
    pdfBtn.addEventListener('click', () => downloadPDF(`/api/contratos/${c.id}/pdf`, `${c.numero || 'ENC-' + c.id}.pdf`));
    mainRow.appendChild(pdfBtn);
  } else if (!isAnulado) {
    const copyBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Copiar enlace' });
    copyBtn.addEventListener('click', async () => {
      const url = `${window.location.origin}/firmar/${c.token}`;
      navigator.clipboard.writeText(url).catch(() => {});
      copyBtn.textContent = 'Copiado';
      setTimeout(() => { copyBtn.textContent = 'Copiar enlace'; }, 1500);
      if (c.estado === 'borrador') {
        await apiFetch(`/contratos/${c.id}/enviar`, { method: 'PATCH' });
        await loadProject();
      }
    });
    mainRow.appendChild(copyBtn);
  }

  const row = el('div', { className: 'doc-row' + (isAnulado ? ' doc-anulado' : '') }, [mainRow]);

  if (isConfirming) {
    row.appendChild(buildDocConfirmRow('encargo', c.id, confirmingDoc.action));
  } else if (!isAnulado && c.estado !== 'firmado') {
    row.appendChild(docActionButtons({
      type: 'encargo',
      id: c.id,
      deletable: isBorrador,
      anulable: c.estado === 'enviado',
      onEdit: isBorrador ? () => {
        editingDoc = editingDoc && editingDoc.type === 'encargo' && editingDoc.id === c.id ? null : { type: 'encargo', id: c.id };
        renderContratos();
      } : null,
    }));
  }

  if (editingDoc && editingDoc.type === 'encargo' && editingDoc.id === c.id) {
    row.appendChild(buildContratoEditForm(c));
  }

  return row;
}

function renderContratos() {
  const listEl = document.getElementById('contratos-list');
  listEl.textContent = '';

  const showAnulados = document.getElementById('toggle-anulados-enc').checked;
  const items = proyecto.contratos.filter((c) => showAnulados || c.estado !== 'anulado');

  if (items.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin encargos generados.' }));
  }
  for (const c of items) {
    listEl.appendChild(buildContratoRow(c));
  }

  const formWrap = document.getElementById('contratos-form-wrap');
  formWrap.textContent = '';
  const form = el('form', { className: 'inline-form', style: 'flex-direction:column; align-items:stretch;' });
  const metodo = el('input', { type: 'text', placeholder: 'Transferencia + Bizum' });
  const plazos = el('input', { type: 'text', placeholder: '50% al inicio, 50% al finalizar' });
  const terminos = el('textarea', { placeholder: 'Términos y condiciones (opcional)' });

  form.appendChild(fieldWrap('Método de pago', metodo));
  form.appendChild(fieldWrap('Plazos de pago', plazos));
  form.appendChild(fieldWrap('Términos', terminos));

  const anexoCheckEnc = el('input', { type: 'checkbox', id: 'check-anexo-enc' });
  form.appendChild(el('div', { className: 'anexo-check-row', style: 'display:none;' },
    el('label', {}, [anexoCheckEnc, ' Incluir anexo de fotos de obra'])
  ));

  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Nuevo encargo', style: 'align-self:flex-start;' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/contratos', {
      method: 'POST',
      body: JSON.stringify({
        proyecto_id: proyectoId,
        metodo_pago: metodo.value,
        plazos_pago: plazos.value,
        terminos: terminos.value,
        incluirFotos: anexoCheckEnc.checked,
      }),
    });
    await loadProject();
  });
  formWrap.appendChild(form);
  updateAnexoCheckVisibility(archivosCache);
}

// ── 6. INGRESOS (+ recibos) ──────────────────────────────────────────

function buildIngresoRow(i) {
  const hasRecibo = !!i.recibo_id;
  const isAnulado = i.recibo_estado === 'anulado';
  const isConfirming = confirmingDoc && confirmingDoc.type === 'recibo' && confirmingDoc.id === i.recibo_id;

  const metaText = `${formatMoney(i.importe)} · ${i.metodo || '—'}` + (hasRecibo ? ` · ${i.recibo_numero}` : '');
  const mainRow = el('div', { className: 'doc-row__main' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { text: `${formatDateEs(i.fecha)} · ${i.concepto}` }),
      el('div', { className: 'list-row__meta', text: metaText }),
    ]),
  ]);

  if (hasRecibo) mainRow.appendChild(badge(i.recibo_estado));

  const reciboBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: hasRecibo ? 'Recibo' : 'Generar recibo' });
  reciboBtn.addEventListener('click', async () => {
    if (hasRecibo) {
      downloadPDF(`/api/ingresos/${i.id}/recibo/pdf`, `${i.recibo_numero}.pdf`);
    } else {
      await apiFetch(`/ingresos/${i.id}/recibo`, { method: 'POST' });
      await loadProject();
      downloadPDF(`/api/ingresos/${i.id}/recibo/pdf`, `recibo-${i.id}.pdf`);
    }
  });
  mainRow.appendChild(reciboBtn);

  const row = el('div', { className: 'doc-row' + (isAnulado ? ' doc-anulado' : '') }, [mainRow]);

  if (isConfirming) {
    row.appendChild(buildDocConfirmRow('recibo', i.recibo_id, confirmingDoc.action));
  } else if (hasRecibo && !isAnulado) {
    row.appendChild(docActionButtons({
      type: 'recibo',
      id: i.recibo_id,
      deletable: true,
      anulable: true,
      onEdit: null,
    }));
  }

  return row;
}

function renderIngresos() {
  const listEl = document.getElementById('ingresos-list');
  listEl.textContent = '';

  const showAnulados = document.getElementById('toggle-anulados-recibos').checked;
  const items = proyecto.ingresos.filter((i) => showAnulados || i.recibo_estado !== 'anulado');

  if (items.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin ingresos registrados.' }));
  }
  for (const i of items) {
    listEl.appendChild(buildIngresoRow(i));
  }
}

async function onAddIngreso(e) {
  e.preventDefault();
  const fecha = document.getElementById('i-fecha').value;
  const concepto = document.getElementById('i-concepto').value;
  const importe = parseFloat(document.getElementById('i-importe').value);
  const metodo = document.getElementById('i-metodo').value;
  if (!fecha || !concepto || !importe) return;

  await apiFetch('/ingresos', { method: 'POST', body: JSON.stringify({ proyecto_id: proyectoId, fecha, concepto, importe, metodo }) });
  document.getElementById('ingresos-form').reset();
  document.getElementById('i-fecha').value = todayIso();
  await loadProject();
}

// ── 7. GASTOS ────────────────────────────────────────────────────────

function renderGastos() {
  const listEl = document.getElementById('gastos-list');
  listEl.textContent = '';

  if (proyecto.gastos.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin gastos registrados.' }));
  }
  for (const g of proyecto.gastos) {
    listEl.appendChild(buildGastoRow(g));
  }
}

function buildGastoRow(g) {
  const deleteBtn = el('button', { type: 'button', className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', () => {
    confirmingItem = { type: 'gasto', id: g.id };
    renderGastos();
  });

  const mainRow = el('div', { className: 'list-row' }, [
    el('div', { className: 'list-row__main' }, [
      el('div', { text: `${formatDateEs(g.fecha)} · ${g.concepto}` }),
      el('div', { className: 'list-row__meta', text: `${formatMoney(g.importe)} · ${g.categoria || '—'}` }),
    ]),
    deleteBtn,
  ]);

  const isConfirmingDelete = confirmingItem && confirmingItem.type === 'gasto' && confirmingItem.id === g.id;
  if (!isConfirmingDelete) return mainRow;

  const wrapper = el('div', {});
  wrapper.appendChild(mainRow);
  wrapper.appendChild(buildSimpleDeleteConfirm('gasto', g.id));
  return wrapper;
}

async function onAddGasto(e) {
  e.preventDefault();
  const fecha = document.getElementById('g-fecha').value;
  const concepto = document.getElementById('g-concepto').value;
  const importe = parseFloat(document.getElementById('g-importe').value);
  const categoria = document.getElementById('g-categoria').value;
  if (!fecha || !concepto || !importe) return;

  await apiFetch('/gastos', { method: 'POST', body: JSON.stringify({ proyecto_id: proyectoId, fecha, concepto, importe, categoria }) });
  document.getElementById('gastos-form').reset();
  document.getElementById('g-fecha').value = todayIso();
  await loadProject();
}

// ── 8. ARCHIVOS MULTIMEDIA ───────────────────────────────────────────

async function loadArchivos() {
  let archivos;
  try {
    archivos = await apiFetch(`/archivos?proyecto_id=${proyectoId}`);
  } catch {
    archivos = [];
  }
  archivosCache = archivos || [];
  renderArchivosStrip(archivosCache);
  updateAnexoCheckVisibility(archivosCache);
}

function updateAnexoCheckVisibility(archivos) {
  const hasFotos = (archivos || []).some((a) => a.tipo === 'foto');
  const checkPres = document.getElementById('check-anexo-pres');
  const checkEnc = document.getElementById('check-anexo-enc');
  if (checkPres) checkPres.closest('.anexo-check-row').style.display = hasFotos ? '' : 'none';
  if (checkEnc) checkEnc.closest('.anexo-check-row').style.display = hasFotos ? '' : 'none';
}

function renderArchivosStrip(archivos) {
  const strip = document.getElementById('archivos-strip');
  const empty = document.getElementById('archivos-empty');
  strip.textContent = '';

  if (!archivos || archivos.length === 0) {
    empty.style.display = '';
    strip.style.display = 'none';
    return;
  }

  empty.style.display = 'none';
  strip.style.display = 'flex';
  for (const a of archivos) {
    strip.appendChild(buildArchivoThumb(a));
  }
}

function buildArchivoThumb(a) {
  const isVideo = a.tipo === 'video';
  const src = `/storage/proyectos/${proyectoId}/${a.filename}`;

  const media = el(isVideo ? 'video' : 'img', { src });
  if (isVideo) {
    media.setAttribute('preload', 'metadata');
    media.muted = true;
  }
  media.addEventListener('click', () => openLightbox(a));

  const thumb = el('div', { className: 'archivo-thumb' });

  if (isVideo) {
    const overlay = el('div', { className: 'thumb-overlay' }, el('span', { className: 'play-icon', text: '▶' }));
    overlay.addEventListener('click', () => openLightbox(a));
    thumb.appendChild(overlay);
  }

  const delBtn = el('button', { type: 'button', className: 'btn-delete-archivo', text: '×' });
  delBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmDeleteArchivo(a.id, thumb);
  });

  thumb.appendChild(media);
  thumb.appendChild(delBtn);

  if (a.descripcion) {
    thumb.appendChild(el('div', { className: 'archivo-descripcion', text: a.descripcion }));
  }

  return thumb;
}

function confirmDeleteArchivo(id, thumbEl) {
  const deleteBtn = thumbEl.querySelector('.btn-delete-archivo');
  if (deleteBtn) deleteBtn.style.display = 'none';

  const yes = el('button', { type: 'button', className: 'confirm-yes', text: 'Sí' });
  const no = el('button', { type: 'button', className: 'confirm-no', text: 'No' });
  const confirmEl = el('div', { className: 'archivo-confirm' }, [yes, no]);

  yes.addEventListener('click', async (e) => {
    e.stopPropagation();
    await apiFetch(`/archivos/${id}`, { method: 'DELETE' });
    await loadArchivos();
  });
  no.addEventListener('click', (e) => {
    e.stopPropagation();
    confirmEl.remove();
    if (deleteBtn) deleteBtn.style.display = '';
  });

  thumbEl.appendChild(confirmEl);
}

function openLightbox(archivo) {
  const isVideo = archivo.tipo === 'video';
  const src = `/storage/proyectos/${proyectoId}/${archivo.filename}`;

  const media = el(isVideo ? 'video' : 'img', {
    src,
    style: 'max-width:95vw; max-height:90vh; border-radius:8px;',
  });
  if (isVideo) {
    media.controls = true;
    media.autoplay = true;
  }

  const closeBtn = el('button', {
    type: 'button',
    text: '×',
    style: 'position:absolute; top:16px; right:20px; background:none; border:none; color:white; font-size:36px; cursor:pointer; line-height:1;',
  });
  closeBtn.addEventListener('click', () => overlay.remove());

  const overlay = el('div', {
    style: 'position:fixed; inset:0; background:rgba(0,0,0,0.92); z-index:9999; display:flex; align-items:center; justify-content:center;',
  }, [media, closeBtn]);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);
}

// ── Upload queue ─────────────────────────────────────────────────────

function onFilesSelected(fileList) {
  for (const file of fileList) {
    queueFiles.push(file);
  }
  document.getElementById('upload-error').hidden = true;
  renderUploadQueue();
  document.getElementById('input-galeria').value = '';
}

function renderUploadQueue() {
  const queueDiv = document.getElementById('upload-queue');
  const previews = document.getElementById('queue-previews');
  previews.textContent = '';

  if (queueFiles.length === 0) {
    queueDiv.style.display = 'none';
    return;
  }

  queueDiv.style.display = '';
  queueFiles.forEach((file, index) => {
    const isVideo = file.type.startsWith('video/');
    const media = el(isVideo ? 'video' : 'img', { src: URL.createObjectURL(file) });
    if (isVideo) media.muted = true;

    const removeBtn = el('button', { type: 'button', className: 'btn-remove-queue', text: '×' });
    removeBtn.addEventListener('click', () => {
      queueFiles.splice(index, 1);
      renderUploadQueue();
    });

    previews.appendChild(el('div', { className: 'queue-thumb' }, [media, removeBtn]));
  });
}

async function onUploadConfirm() {
  if (queueFiles.length === 0) return;

  const formData = new FormData();
  formData.append('proyecto_id', proyectoId);
  for (const file of queueFiles) {
    formData.append('files', file);
  }

  const confirmBtn = document.getElementById('btn-upload-confirm');
  const errorEl = document.getElementById('upload-error');
  errorEl.hidden = true;
  confirmBtn.disabled = true;
  confirmBtn.textContent = 'Subiendo...';

  try {
    // Raw fetch (not apiFetch): a FormData body needs the browser to set its
    // own multipart Content-Type with boundary, which apiFetch would override.
    const res = await fetch('/api/archivos/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${getToken()}` },
      body: formData,
    });
    if (res.ok) {
      queueFiles = [];
      renderUploadQueue();
      await loadArchivos();
    } else {
      errorEl.textContent = `No se pudo subir (error ${res.status}). Inténtalo de nuevo.`;
      errorEl.hidden = false;
    }
  } catch {
    errorEl.textContent = 'No se pudo conectar con el servidor. Comprueba tu conexión e inténtalo de nuevo.';
    errorEl.hidden = false;
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Subir archivos';
  }
}

function onUploadCancel() {
  queueFiles = [];
  document.getElementById('upload-error').hidden = true;
  renderUploadQueue();
}

// ── 9. DANGER ZONE ───────────────────────────────────────────────────
// Confirmation is the inline Sí/No UI wired in init() — estado=finalizado
// is set exclusively via the estado selector in the header, never here.

async function onDeleteProject() {
  await apiFetch(`/proyectos/${proyectoId}`, { method: 'DELETE' });
  window.location.href = '/app/proyectos.html';
}
