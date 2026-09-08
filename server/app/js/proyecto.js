import { apiFetch } from './api.js';
import { guard } from './auth.js';
import { el, badge, mountChrome, formatMoney, formatDateEs, todayIso, ESTADO_LABELS } from './ui.js';

const params = new URLSearchParams(window.location.search);
const proyectoId = params.get('id');

if (!proyectoId) {
  window.location.href = '/app/proyectos.html';
}

let proyecto = null;
let clientes = [];
let elementosCatalogo = [];

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
  document.getElementById('finalize-btn').addEventListener('click', onFinalize);
  document.getElementById('delete-project-btn').addEventListener('click', onDeleteProject);

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
  const tipoField = labeledInput('Tipo de servicio', 'text', proyecto.tipo_servicio);
  const direccionField = labeledInput('Dirección de obra', 'text', proyecto.direccion_obra);

  form.appendChild(nombreField);
  form.appendChild(clienteField);
  form.appendChild(tipoField);
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
        tipo_servicio: tipoField.querySelector('input').value,
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
    ['Conceptos', c.conceptos],
    ['Horas', c.horas],
    ['Presupuestos', c.presupuestos],
    ['Facturas', c.facturas],
    ['Contratos', c.contratos],
    ['Ingresos', c.ingresos],
  ];
  for (const [label, value] of items) {
    container.appendChild(el('div', { className: 'stat-pill' }, [
      el('strong', { text: String(value) }),
      ' ' + label,
    ]));
  }
}

// ── 3. CONCEPTOS ─────────────────────────────────────────────────────

function renderConceptos() {
  const addContainer = document.getElementById('conceptos-add');
  addContainer.textContent = '';

  const form = el('form', { className: 'inline-form' });

  const catalogSelect = el('select', { style: 'min-width:220px;' }, [el('option', { value: '', text: 'Elemento del catálogo (opcional)' })].concat(
    elementosCatalogo.filter((e) => e.activo).map((e) => el('option', { value: e.id, text: `${e.nombre} — ${formatMoney(e.precio_unitario)}/${e.unidad}` }))
  ));

  const nombreInput = el('input', { type: 'text', placeholder: 'Nombre del concepto' });
  const cantidadInput = el('input', { type: 'number', step: '0.01', value: '1', style: 'width:90px;' });
  const precioInput = el('input', { type: 'number', step: '0.01', value: '0', style: 'width:100px;' });
  const unidadInput = el('input', { type: 'text', value: 'ud', style: 'width:70px;' });

  catalogSelect.addEventListener('change', () => {
    const item = elementosCatalogo.find((e) => String(e.id) === catalogSelect.value);
    if (item) {
      nombreInput.value = item.nombre;
      precioInput.value = item.precio_unitario;
      unidadInput.value = item.unidad;
    }
  });

  form.appendChild(fieldWrap('Catálogo', catalogSelect));
  form.appendChild(fieldWrap('Nombre', nombreInput));
  form.appendChild(fieldWrap('Cant.', cantidadInput));
  form.appendChild(fieldWrap('Ud.', unidadInput));
  form.appendChild(fieldWrap('Precio (€)', precioInput));

  const addBtn = el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Añadir concepto' });
  form.appendChild(addBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!nombreInput.value.trim()) return;
    await apiFetch(`/proyectos/${proyectoId}/conceptos`, {
      method: 'POST',
      body: JSON.stringify({
        elemento_id: catalogSelect.value || null,
        nombre: nombreInput.value,
        cantidad: parseFloat(cantidadInput.value) || 1,
        precio_unitario: parseFloat(precioInput.value) || 0,
        unidad: unidadInput.value || 'ud',
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

function buildConceptoRow(c) {
  const checkbox = el('input', { type: 'checkbox' });
  checkbox.checked = !!c.completado;
  checkbox.addEventListener('change', async () => {
    await apiFetch(`/conceptos/${c.id}/completado`, { method: 'PATCH', body: JSON.stringify({ completado: checkbox.checked }) });
    await loadProject();
  });

  const priceInput = el('input', { type: 'number', step: '0.01', style: 'width:90px;' });
  priceInput.value = c.precio_unitario;
  priceInput.addEventListener('change', async () => {
    await apiFetch(`/conceptos/${c.id}`, { method: 'PUT', body: JSON.stringify({ precio_unitario: parseFloat(priceInput.value) || 0 }) });
    await loadProject();
  });

  const lineTotal = (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0);

  const deleteBtn = el('button', { className: 'btn-ghost', text: '🗑' });
  deleteBtn.addEventListener('click', async () => {
    await apiFetch(`/conceptos/${c.id}`, { method: 'DELETE' });
    await loadProject();
  });

  return el('div', { className: 'list-row' }, [
    checkbox,
    el('div', { className: 'list-row__main' }, [
      el('div', { text: c.nombre, style: c.completado ? 'text-decoration:line-through; color:var(--text-muted);' : '' }),
      el('div', { className: 'list-row__meta', text: `${c.cantidad} ${c.unidad} · ${formatMoney(lineTotal)}` }),
    ]),
    priceInput,
    deleteBtn,
  ]);
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
    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: p.numero }),
        el('div', { className: 'list-row__meta', text: formatDateEs(p.created_at) }),
      ]),
      badge(p.estado),
      el('a', { href: `/api/presupuestos/${p.id}/pdf`, target: '_blank', className: 'btn btn-secondary btn-sm', text: 'PDF' }),
    ]));
  }

  const formWrap = document.getElementById('presupuestos-form-wrap');
  formWrap.textContent = '';
  const form = el('form', { className: 'inline-form' });
  const porcentaje = el('select', {}, [100, 50, 40, 30].map((v) => el('option', { value: v, text: `${v}%` })));
  form.appendChild(fieldWrap('% a solicitar', porcentaje));
  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Nuevo presupuesto' }));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/presupuestos', { method: 'POST', body: JSON.stringify({ proyecto_id: proyectoId, porcentaje_cobro: parseInt(porcentaje.value, 10) }) });
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
    listEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: f.numero }),
        el('div', { className: 'list-row__meta', text: formatDateEs(f.created_at) }),
      ]),
      badge(f.estado),
      el('a', { href: `/api/facturas/${f.id}/pdf`, target: '_blank', className: 'btn btn-secondary btn-sm', text: 'PDF' }),
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
        el('div', { text: `Contrato #${c.id}` }),
        el('div', { className: 'list-row__meta', text: formatDateEs(c.created_at) }),
      ]),
      badge(c.estado),
    ]);

    if (c.estado === 'firmado') {
      row.appendChild(el('a', { href: `/api/contratos/${c.id}/pdf`, target: '_blank', className: 'btn btn-secondary btn-sm', text: 'PDF' }));
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
  form.appendChild(el('button', { type: 'submit', className: 'btn btn-primary btn-sm', text: 'Nuevo contrato', style: 'align-self:flex-start;' }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await apiFetch('/contratos', {
      method: 'POST',
      body: JSON.stringify({ proyecto_id: proyectoId, metodo_pago: metodo.value, plazos_pago: plazos.value, terminos: terminos.value }),
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
    const reciboBtn = i.recibo_pdf_path
      ? el('a', { href: `/api/ingresos/${i.id}/recibo/pdf`, target: '_blank', className: 'btn btn-secondary btn-sm', text: 'Recibo' })
      : el('button', { className: 'btn btn-secondary btn-sm', text: 'Generar recibo' });

    if (!i.recibo_pdf_path) {
      reciboBtn.addEventListener('click', async () => {
        await apiFetch(`/ingresos/${i.id}/recibo`, { method: 'POST' });
        await loadProject();
      });
    }

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

// ── 8. DANGER ZONE ───────────────────────────────────────────────────

async function onFinalize() {
  if (!confirm('¿Marcar este proyecto como finalizado? Dejará de aparecer en el panel de proyectos activos.')) return;
  await apiFetch(`/proyectos/${proyectoId}/estado`, { method: 'PATCH', body: JSON.stringify({ estado: 'finalizado' }) });
  await loadProject();
}

async function onDeleteProject() {
  if (!confirm('¿Eliminar este proyecto de forma permanente? Esta acción no se puede deshacer.')) return;
  await apiFetch(`/proyectos/${proyectoId}`, { method: 'DELETE' });
  window.location.href = '/app/proyectos.html';
}
