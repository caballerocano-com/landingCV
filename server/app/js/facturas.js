import { apiFetch, getToken, downloadPDF } from './api.js';
import { guard } from './auth.js';
import { el, mountChrome, badge, formatMoney, formatDateEs } from './ui.js';

if (await guard()) {
  mountChrome('facturas', 'Facturas');
  init();
}

let facturas = [];
let expandedId = null;
const selected = new Set();

async function init() {
  try {
    const clientes = await apiFetch('/clientes');
    const select = document.getElementById('f-cliente');
    for (const c of clientes) {
      select.appendChild(el('option', { value: c.id, text: c.nombre }));
    }
  } catch { /* select stays with just "Todos" */ }

  for (const id of ['f-desde', 'f-hasta', 'f-cliente', 'f-serie', 'f-anio', 'f-estado', 'f-q']) {
    document.getElementById(id).addEventListener('input', () => { selected.clear(); load(); });
  }

  document.getElementById('select-all').addEventListener('change', (e) => {
    selected.clear();
    if (e.target.checked) facturas.forEach((f) => selected.add(f.id));
    render();
  });
  document.getElementById('download-selected').addEventListener('click', () => downloadZip({ ids: [...selected] }));
  document.getElementById('download-all').addEventListener('click', () => downloadZip(currentFilters()));
  document.getElementById('delete-selected').addEventListener('click', onDeleteSelected);

  await load();
}

function currentFilters() {
  const val = (id) => document.getElementById(id).value.trim() || undefined;
  return {
    desde: val('f-desde'),
    hasta: val('f-hasta'),
    cliente_id: val('f-cliente'),
    serie: val('f-serie'),
    anio: val('f-anio'),
    estado: val('f-estado'),
    q: val('f-q'),
  };
}

async function load() {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(currentFilters())) {
    if (v) params.set(k, v);
  }
  try {
    facturas = await apiFetch(`/facturas?${params.toString()}`);
  } catch {
    facturas = [];
  }
  render();
}

async function downloadZip(body) {
  const res = await fetch('/api/facturas/zip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${getToken()}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    alert('No se pudo generar la descarga.');
    return;
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'facturas.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function onDeleteSelected() {
  const count = selected.size;
  if (count === 0) {
    alert('No has seleccionado ninguna factura.');
    return;
  }

  const palabra = prompt(
    `Atención, vas a eliminar ${count} factura(s). Esto no se puede deshacer. ¿Estás seguro?\n\nEscribe "Borrar" para confirmar.`
  );
  if (palabra !== 'Borrar') return;

  let result;
  try {
    result = await apiFetch('/facturas/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids: [...selected] }),
    });
  } catch (err) {
    alert(err.data?.error || err.message);
    return;
  }

  selected.clear();
  await load();

  if (result.omitidas > 0) {
    alert(`Se eliminaron ${result.eliminadas} factura(s). ${result.omitidas} no se eliminaron porque no son borradores ni anuladas.`);
  }
}

function render() {
  const listEl = document.getElementById('facturas-list');
  listEl.textContent = '';
  document.getElementById('facturas-count').textContent = `${facturas.length} factura(s)`;
  document.getElementById('select-all').checked = facturas.length > 0 && facturas.every((f) => selected.has(f.id));

  if (facturas.length === 0) {
    listEl.appendChild(el('div', { className: 'empty-state', text: 'No hay facturas que coincidan con el filtro.' }));
    return;
  }

  for (const f of facturas) {
    listEl.appendChild(buildRow(f));
  }
}

function buildRow(f) {
  const row = el('div', { className: 'doc-row' + (f.estado === 'anulada' ? ' doc-anulado' : '') });

  const checkbox = el('input', { type: 'checkbox' });
  checkbox.checked = selected.has(f.id);
  checkbox.addEventListener('change', () => {
    if (checkbox.checked) selected.add(f.id); else selected.delete(f.id);
    document.getElementById('select-all').checked = facturas.every((x) => selected.has(x.id));
  });

  const statusBadge = f.es_rectificativa
    ? el('span', { className: 'badge', 'data-estado': 'rect', text: 'RECT' })
    : badge(f.estado);

  const pdfBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'PDF' });
  pdfBtn.addEventListener('click', () => downloadPDF(`/api/facturas/${f.id}/pdf`, `${f.numero || 'borrador-' + f.id}.pdf`));

  const editBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: expandedId === f.id ? 'Cerrar' : 'Abrir' });
  editBtn.addEventListener('click', () => { expandedId = expandedId === f.id ? null : f.id; render(); });

  const proyectoLink = f.proyecto_id
    ? el('a', { href: `/app/proyecto.html?id=${f.proyecto_id}`, className: 'btn btn-secondary btn-sm', text: 'Ir al proyecto' })
    : null;

  const mainRow = el('div', { className: 'doc-row__main' }, [
    checkbox,
    el('div', { className: 'list-row__main' }, [
      el('div', { className: 'doc-numero', text: f.numero || 'Sin número (borrador)' }),
      el('div', { className: 'list-row__meta', text: `${f.cliente_nombre || 'Sin cliente'} · ${f.proyecto_nombre || ''} · ${formatDateEs(f.created_at)}` }),
    ]),
    statusBadge,
    pdfBtn,
    proyectoLink,
    editBtn,
  ]);
  row.appendChild(mainRow);

  if (expandedId === f.id) {
    row.appendChild(buildDetail(f));
  }

  return row;
}

function buildDetail(f) {
  const wrap = el('div', { className: 'mt-16' });
  const isBorrador = f.estado === 'borrador';
  const isAnulada = f.estado === 'anulada';
  const editable = isBorrador || isAnulada;
  const errorText = el('p', { className: 'error-text', hidden: '' });

  const numeroField = el('div', { className: 'field' }, [el('label', { text: 'Número' })]);
  const numeroInput = el('input', { type: 'text' });
  numeroInput.value = f.numero || '';
  numeroInput.disabled = !editable;
  numeroField.appendChild(numeroInput);

  const actions = el('div', { style: 'display:flex; gap:10px; margin: 10px 0; flex-wrap:wrap;' });

  if (editable) {
    const saveBtn = el('button', { type: 'button', className: 'btn btn-primary btn-sm', text: 'Guardar número' });
    saveBtn.addEventListener('click', async () => {
      errorText.hidden = true;
      try {
        await apiFetch(`/facturas/${f.id}`, { method: 'PUT', body: JSON.stringify({ numero: numeroInput.value.trim() || null }) });
        await load();
      } catch (err) {
        errorText.textContent = err.data?.error || err.message;
        errorText.hidden = false;
      }
    });
    actions.appendChild(saveBtn);
  }

  if (isBorrador) {
    const emitirBtn = el('button', { type: 'button', className: 'btn btn-primary btn-sm', text: 'Emitir (asignar número definitivo)' });
    emitirBtn.addEventListener('click', async () => {
      if (!confirm('¿Emitir esta factura? Se le asignará un número definitivo e inmutable.')) return;
      errorText.hidden = true;
      try {
        await apiFetch(`/facturas/${f.id}`, { method: 'PUT', body: JSON.stringify({ estado: 'emitida' }) });
        await load();
      } catch (err) {
        errorText.textContent = err.data?.error || err.message;
        errorText.hidden = false;
      }
    });
    actions.appendChild(emitirBtn);
  }

  if (editable) {
    const deleteBtn = el('button', {
      type: 'button',
      className: 'btn btn-danger btn-sm',
      text: isAnulada ? 'Eliminar y liberar número' : 'Eliminar borrador',
    });
    deleteBtn.addEventListener('click', async () => {
      const mensaje = isAnulada
        ? '¿Eliminar esta factura anulada? Su número quedará libre para reutilizarse. Solo hazlo si esta factura NUNCA se presentó a Hacienda. No se puede deshacer.'
        : '¿Eliminar esta factura en borrador? No se puede deshacer.';
      if (!confirm(mensaje)) return;
      errorText.hidden = true;
      try {
        await apiFetch(`/facturas/${f.id}`, { method: 'DELETE' });
        expandedId = null;
        await load();
      } catch (err) {
        errorText.textContent = err.data?.error || err.message;
        errorText.hidden = false;
      }
    });
    actions.appendChild(deleteBtn);
  }

  const wrapTop = el('div', { className: 'grid grid-2' }, [numeroField]);
  wrap.appendChild(wrapTop);
  wrap.appendChild(actions);
  wrap.appendChild(errorText);

  wrap.appendChild(el('h3', { className: 'mt-16', text: 'Cobros / método de pago' }));
  const ingresosWrap = el('div');
  wrap.appendChild(ingresosWrap);
  loadIngresos(f.id, ingresosWrap);

  return wrap;
}

async function loadIngresos(facturaId, container) {
  let ingresos;
  try {
    ingresos = await apiFetch(`/ingresos?factura_id=${facturaId}`);
  } catch {
    ingresos = [];
  }
  container.textContent = '';

  if (!ingresos || ingresos.length === 0) {
    container.appendChild(el('p', { className: 'text-muted', text: 'Sin cobros registrados para esta factura.' }));
    return;
  }

  for (const i of ingresos) {
    const { wrapper: metodoWrap, getValue } = buildMetodoControl(i.metodo);

    const saveBtn = el('button', { type: 'button', className: 'btn btn-secondary btn-sm', text: 'Guardar' });
    saveBtn.addEventListener('click', async () => {
      await apiFetch(`/ingresos/${i.id}`, {
        method: 'PUT',
        body: JSON.stringify({ concepto: i.concepto, importe: i.importe, fecha: i.fecha, metodo: getValue() }),
      });
    });

    container.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: `${formatMoney(i.importe)} · ${formatDateEs(i.fecha)}` }),
      ]),
      metodoWrap,
      saveBtn,
    ]));
  }
}

const METODOS_PAGO = ['Efectivo', 'Transferencia', 'Bizum'];

// Builds a select limited to the usual payment methods, falling back to a
// free-text "Otro" option so older/combined values (e.g. "Transferencia +
// Bizum") already stored on an ingreso are preserved instead of silently
// overwritten.
function buildMetodoControl(currentValue) {
  const wrapper = el('span', { style: 'display:flex; gap:6px;' });
  const isKnown = METODOS_PAGO.includes(currentValue);

  const select = el('select', {}, [
    ...METODOS_PAGO.map((m) => el('option', { value: m, text: m })),
    el('option', { value: '__otro__', text: 'Otro' }),
  ]);
  select.value = isKnown ? currentValue : '__otro__';

  const otroInput = el('input', { type: 'text', placeholder: 'Especifica...' });
  otroInput.value = isKnown ? '' : (currentValue || '');
  otroInput.hidden = isKnown;

  select.addEventListener('change', () => {
    otroInput.hidden = select.value !== '__otro__';
  });

  wrapper.appendChild(select);
  wrapper.appendChild(otroInput);

  return {
    wrapper,
    getValue: () => (select.value === '__otro__' ? otroInput.value.trim() : select.value),
  };
}
