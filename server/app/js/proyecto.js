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
  document.getElementById('btn-add-video').addEventListener('click', () => {
    document.getElementById('input-camara').click();
  });
  document.getElementById('input-galeria').addEventListener('change', (e) => onFilesSelected(e.target.files));
  document.getElementById('input-camara').addEventListener('change', (e) => onFilesSelected(e.target.files));
  document.getElementById('btn-upload-confirm').addEventListener('click', onUploadConfirm);
  document.getElementById('btn-upload-cancel').addEventListener('click', onUploadCancel);

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

  const deleteBtn = el('button', { className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', async () => {
    await apiFetch(`/conceptos/${c.id}`, { method: 'DELETE' });
    await loadProject();
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

  if (c.unidad !== 'hora') {
    return mainRow;
  }

  const wrapper = el('div', {});
  wrapper.appendChild(mainRow);
  const actionArea = el('div', { className: 'mt-8', style: 'padding-left:26px;' });
  renderUseHoursAction(c, actionArea);
  wrapper.appendChild(actionArea);
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
    const deleteBtn = el('button', { className: 'btn-ghost', text: '🗑' });
    deleteBtn.addEventListener('click', async () => {
      await apiFetch(`/horas/${h.id}`, { method: 'DELETE' });
      await loadProject();
    });

    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: `${formatDateEs(h.fecha)} · ${h.horas} h` }),
        h.descripcion ? el('div', { className: 'list-row__meta', text: h.descripcion }) : null,
      ]),
      deleteBtn,
    ]));
  }
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

function renderPresupuestos() {
  const listEl = document.getElementById('presupuestos-list');
  listEl.textContent = '';

  if (proyecto.presupuestos.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin presupuestos generados.' }));
  }
  for (const p of proyecto.presupuestos) {
    const pdfBtn = el('button', { className: 'btn btn-secondary btn-sm', text: 'PDF' });
    pdfBtn.addEventListener('click', () => downloadPDF(`/api/presupuestos/${p.id}/pdf`, `${p.numero}.pdf`));

    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: p.numero }),
        el('div', { className: 'list-row__meta', text: formatDateEs(p.created_at) }),
      ]),
      badge(p.estado),
      pdfBtn,
    ]));
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
}

function renderFacturas() {
  const listEl = document.getElementById('facturas-list');
  listEl.textContent = '';

  if (proyecto.facturas.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin facturas generadas.' }));
  }
  for (const f of proyecto.facturas) {
    const pdfBtn = el('button', { className: 'btn btn-secondary btn-sm', text: 'PDF' });
    pdfBtn.addEventListener('click', () => downloadPDF(`/api/facturas/${f.id}/pdf`, `${f.numero}.pdf`));

    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: f.numero }),
        el('div', { className: 'list-row__meta', text: formatDateEs(f.created_at) }),
      ]),
      badge(f.estado),
      pdfBtn,
    ]));
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
}

function renderContratos() {
  const listEl = document.getElementById('contratos-list');
  listEl.textContent = '';

  if (proyecto.contratos.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin contratos generados.' }));
  }
  for (const c of proyecto.contratos) {
    const row = el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: c.numero ? `Encargo ${c.numero}` : `Encargo #${c.id}` }),
        el('div', { className: 'list-row__meta', text: formatDateEs(c.created_at) }),
      ]),
      badge(c.estado),
    ]);

    if (c.estado === 'firmado') {
      const pdfBtn = el('button', { className: 'btn btn-secondary btn-sm', text: 'PDF' });
      pdfBtn.addEventListener('click', () => downloadPDF(`/api/contratos/${c.id}/pdf`, `${c.numero || 'ENC-' + c.id}.pdf`));
      row.appendChild(pdfBtn);
    } else {
      const copyBtn = el('button', { className: 'btn btn-secondary btn-sm', text: 'Copiar enlace' });
      copyBtn.addEventListener('click', () => {
        const url = `${window.location.origin}/firmar/${c.token}`;
        navigator.clipboard.writeText(url).catch(() => {});
        copyBtn.textContent = 'Copiado';
        setTimeout(() => { copyBtn.textContent = 'Copiar enlace'; }, 1500);
      });
      row.appendChild(copyBtn);
    }

    listEl.appendChild(row);
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
}

// ── 6. INGRESOS ──────────────────────────────────────────────────────

function renderIngresos() {
  const listEl = document.getElementById('ingresos-list');
  listEl.textContent = '';

  if (proyecto.ingresos.length === 0) {
    listEl.appendChild(el('p', { className: 'text-muted', text: 'Sin ingresos registrados.' }));
  }
  for (const i of proyecto.ingresos) {
    const reciboBtn = el('button', { className: 'btn btn-secondary btn-sm', text: i.recibo_pdf_path ? 'Recibo' : 'Generar recibo' });

    reciboBtn.addEventListener('click', async () => {
      if (i.recibo_pdf_path) {
        downloadPDF(`/api/ingresos/${i.id}/recibo/pdf`, `recibo-${i.id}.pdf`);
      } else {
        await apiFetch(`/ingresos/${i.id}/recibo`, { method: 'POST' });
        await loadProject();
      }
    });

    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: `${formatDateEs(i.fecha)} · ${i.concepto}` }),
        el('div', { className: 'list-row__meta', text: `${formatMoney(i.importe)} · ${i.metodo || '—'}` }),
      ]),
      reciboBtn,
    ]));
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
    const deleteBtn = el('button', { className: 'btn-ghost', text: '🗑' });
    deleteBtn.addEventListener('click', async () => {
      await apiFetch(`/gastos/${g.id}`, { method: 'DELETE' });
      await loadProject();
    });

    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: `${formatDateEs(g.fecha)} · ${g.concepto}` }),
        el('div', { className: 'list-row__meta', text: `${formatMoney(g.importe)} · ${g.categoria || '—'}` }),
      ]),
      deleteBtn,
    ]));
  }
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
  renderArchivosStrip(archivos);
  updateAnexoCheckVisibility(archivos);
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
  renderUploadQueue();
  // Reset both inputs so picking the same file again later still fires 'change'.
  document.getElementById('input-galeria').value = '';
  document.getElementById('input-camara').value = '';
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
    }
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Subir archivos';
  }
}

function onUploadCancel() {
  queueFiles = [];
  renderUploadQueue();
}

// ── 9. DANGER ZONE ───────────────────────────────────────────────────
// Confirmation is the inline Sí/No UI wired in init() — estado=finalizado
// is set exclusively via the estado selector in the header, never here.

async function onDeleteProject() {
  await apiFetch(`/proyectos/${proyectoId}`, { method: 'DELETE' });
  window.location.href = '/app/proyectos.html';
}
