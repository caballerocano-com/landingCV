import { el, formatMoney, formatDateEs } from './ui.js';

const pathParts = window.location.pathname.split('/').filter(Boolean);
const token = pathParts[pathParts.length - 1];

let hasDrawn = false;
let canvas, ctx, drawing = false;

init();

async function init() {
  let data;
  try {
    const res = await fetch(`/api/contratos/public/${token}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al cargar la hoja de encargo');
  } catch (err) {
    showMessage(err.message || 'No se pudo cargar la hoja de encargo.');
    return;
  }

  if (data.estado === 'firmado') {
    showMessage(`Este encargo ya fue firmado el ${formatDateEs(data.firmado_at)}.`);
    return;
  }
  if (data.estado === 'expirado') {
    showMessage('Este enlace ha expirado.');
    return;
  }

  document.getElementById('loading').hidden = true;
  document.getElementById('contract-root').hidden = false;
  renderContract(data);
  setupCanvas();
}

function showMessage(text) {
  document.getElementById('loading').hidden = true;
  const screen = document.getElementById('message-screen');
  screen.hidden = false;
  screen.textContent = '';
  screen.appendChild(el('p', { text }));
}

function renderContract(data) {
  const { proyecto, cliente, conceptos, contrato } = data;

  const info = document.getElementById('contract-info');
  info.appendChild(el('h2', { text: proyecto?.nombre || 'Proyecto' }));
  if (proyecto?.descripcion) info.appendChild(el('p', { className: 'text-muted', text: proyecto.descripcion }));
  if (cliente) info.appendChild(el('p', { className: 'mt-8', text: `Cliente: ${cliente.nombre}` }));
  info.appendChild(el('p', { className: 'text-muted', text: `Fecha: ${formatDateEs(contrato.created_at)}` }));

  const conceptosEl = document.getElementById('contract-conceptos');
  let subtotal = 0;
  for (const c of conceptos) {
    const lineTotal = (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0);
    subtotal += lineTotal;
    conceptosEl.appendChild(el('div', { className: 'list-row' }, [
      el('div', { className: 'list-row__main' }, [
        el('div', { text: c.nombre }),
        el('div', { className: 'list-row__meta', text: `${c.cantidad} ${c.unidad} × ${formatMoney(c.precio_unitario)}` }),
      ]),
      el('div', { text: formatMoney(lineTotal) }),
    ]));
  }
  const iva = subtotal * 0.21;
  const total = subtotal + iva;
  const totalsEl = document.getElementById('contract-totals');
  totalsEl.appendChild(el('div', { className: 'totals-row__item' }, [
    el('div', { className: 'totals-row__label', text: 'Subtotal' }),
    el('div', { className: 'totals-row__value', text: formatMoney(subtotal) }),
  ]));
  totalsEl.appendChild(el('div', { className: 'totals-row__item' }, [
    el('div', { className: 'totals-row__label', text: 'IVA (21%)' }),
    el('div', { className: 'totals-row__value', text: formatMoney(iva) }),
  ]));
  totalsEl.appendChild(el('div', { className: 'totals-row__item' }, [
    el('div', { className: 'totals-row__label', text: 'TOTAL' }),
    el('div', { className: 'totals-row__value totals-row__value--total', text: formatMoney(total) }),
  ]));

  const paymentEl = document.getElementById('contract-payment');
  paymentEl.appendChild(el('h2', { text: 'Condiciones de pago' }));
  if (contrato.metodo_pago) paymentEl.appendChild(el('p', { text: `Método: ${contrato.metodo_pago}` }));
  if (contrato.plazos_pago) paymentEl.appendChild(el('p', { text: `Plazos: ${contrato.plazos_pago}` }));
  paymentEl.appendChild(el('p', { className: 'text-muted mt-8', text: 'Transferencia bancaria o Bizum (623 800 979).' }));

  if (contrato.terminos) {
    document.getElementById('contract-terms').hidden = false;
    document.getElementById('terms-text').textContent = contrato.terminos;
  }
}

function setupCanvas() {
  canvas = document.getElementById('signature-canvas');
  ctx = canvas.getContext('2d');

  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#0f1f2e';
  };
  resize();

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const point = e.touches ? e.touches[0] : e;
    return { x: point.clientX - rect.left, y: point.clientY - rect.top };
  };

  const start = (e) => {
    e.preventDefault();
    drawing = true;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    if (!hasDrawn) {
      hasDrawn = true;
      document.getElementById('submit-signature').disabled = false;
    }
  };
  const end = (e) => {
    e.preventDefault();
    drawing = false;
  };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end, { passive: false });

  document.getElementById('clear-signature').addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawn = false;
    document.getElementById('submit-signature').disabled = true;
  });

  document.getElementById('submit-signature').addEventListener('click', onSubmitSignature);
}

async function onSubmitSignature() {
  const errorEl = document.getElementById('sign-error');
  errorEl.hidden = true;

  const submitBtn = document.getElementById('submit-signature');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Enviando…';

  const firma = canvas.toDataURL('image/png');

  try {
    const res = await fetch(`/api/contratos/firmar/${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firma }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Error al firmar el encargo');

    document.getElementById('contract-root').hidden = true;
    const screen = document.getElementById('message-screen');
    screen.hidden = false;
    screen.textContent = '';
    screen.appendChild(el('p', { text: '¡Encargo firmado correctamente!' }));
    screen.appendChild(el('a', {
      href: data.downloadUrl,
      target: '_blank',
      className: 'btn btn-primary mt-16',
      text: 'Descargar encargo firmado',
    }));
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = 'Firmar y confirmar';
  }
}
