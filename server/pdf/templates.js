import PDFDocument from 'pdfkit';
import { createWriteStream } from 'fs';
import { OWNER, COLORS, FONTS, formatMoney, formatDateEs } from './styles.js';

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 595.28; // A4 pt

function drawHeader(doc, { tipoDocumento, numero, fecha }) {
  const startY = PAGE_MARGIN;

  doc.font(FONTS.bold).fontSize(13).fillColor(COLORS.text)
    .text(OWNER.nombre, PAGE_MARGIN, startY);

  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted)
    .text(`NIF: ${OWNER.nif}`)
    .text(OWNER.direccion)
    .text(`Tel: ${OWNER.telefono}  ·  ${OWNER.email}`)
    .text(OWNER.web);

  doc.font(FONTS.bold).fontSize(14).fillColor(COLORS.accent)
    .text(tipoDocumento, PAGE_MARGIN, startY, { align: 'right', width: PAGE_WIDTH - 2 * PAGE_MARGIN });

  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted)
    .text(`Nº ${numero}`, { align: 'right', width: PAGE_WIDTH - 2 * PAGE_MARGIN })
    .text(`Fecha: ${formatDateEs(fecha)}`, { align: 'right', width: PAGE_WIDTH - 2 * PAGE_MARGIN });

  const afterY = Math.max(doc.y, startY + 60) + 10;
  doc.moveTo(PAGE_MARGIN, afterY).lineTo(PAGE_WIDTH - PAGE_MARGIN, afterY)
    .strokeColor(COLORS.border).lineWidth(1).stroke();

  doc.y = afterY + 16;
}

function drawClientBlock(doc, cliente) {
  if (!cliente) return;
  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.text).text('Cliente');
  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMid);
  doc.text(cliente.nombre || '');
  if (cliente.nif) doc.text(`NIF: ${cliente.nif}`);
  if (cliente.direccion_fiscal) doc.text(cliente.direccion_fiscal);
  if (cliente.telefono || cliente.email) {
    doc.text([cliente.telefono, cliente.email].filter(Boolean).join('  ·  '));
  }
  doc.moveDown(1);
}

function drawProjectBlock(doc, proyecto) {
  if (!proyecto) return;
  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.text).text(proyecto.nombre || '');
  if (proyecto.descripcion) {
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMid).text(proyecto.descripcion);
  }
  if (proyecto.direccion_obra) {
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted).text(`Dirección de obra: ${proyecto.direccion_obra}`);
  }
  doc.moveDown(1);
}

const COL = {
  desc: PAGE_MARGIN,
  descW: 235,
  qty: PAGE_MARGIN + 235,
  qtyW: 55,
  unit: PAGE_MARGIN + 290,
  unitW: 45,
  price: PAGE_MARGIN + 335,
  priceW: 75,
  total: PAGE_MARGIN + 410,
  totalW: PAGE_WIDTH - PAGE_MARGIN - (PAGE_MARGIN + 410),
};

function drawConceptsTable(doc, conceptos) {
  const tableWidth = PAGE_WIDTH - 2 * PAGE_MARGIN;
  const headerY = doc.y;

  doc.rect(PAGE_MARGIN, headerY, tableWidth, 20).fill(COLORS.bgAlt);
  doc.font(FONTS.bold).fontSize(8.5).fillColor(COLORS.textMid);
  doc.text('DESCRIPCIÓN', COL.desc + 6, headerY + 6, { width: COL.descW - 6 });
  doc.text('CANT.', COL.qty, headerY + 6, { width: COL.qtyW, align: 'right' });
  doc.text('UD.', COL.unit, headerY + 6, { width: COL.unitW, align: 'right' });
  doc.text('PRECIO', COL.price, headerY + 6, { width: COL.priceW, align: 'right' });
  doc.text('TOTAL', COL.total, headerY + 6, { width: COL.totalW - 6, align: 'right' });

  let y = headerY + 24;
  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.text);

  let subtotal = 0;
  for (const c of conceptos) {
    if (y > 720) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
    const lineTotal = (Number(c.cantidad) || 0) * (Number(c.precio_unitario) || 0);
    subtotal += lineTotal;

    const nameHeight = doc.heightOfString(c.nombre || '', { width: COL.descW - 6 });
    doc.text(c.nombre || '', COL.desc + 6, y, { width: COL.descW - 6 });
    doc.text(String(c.cantidad), COL.qty, y, { width: COL.qtyW, align: 'right' });
    doc.text(c.unidad || '', COL.unit, y, { width: COL.unitW, align: 'right' });
    doc.text(formatMoney(c.precio_unitario), COL.price, y, { width: COL.priceW, align: 'right' });
    doc.text(formatMoney(lineTotal), COL.total, y, { width: COL.totalW - 6, align: 'right' });

    y += Math.max(nameHeight, 14) + 8;
    doc.moveTo(PAGE_MARGIN, y - 4).lineTo(PAGE_WIDTH - PAGE_MARGIN, y - 4)
      .strokeColor(COLORS.border).lineWidth(0.5).stroke();
  }

  doc.y = y + 6;
  return subtotal;
}

function drawTotals(doc, subtotal, ivaPorcentaje = 21) {
  const iva = subtotal * (ivaPorcentaje / 100);
  const total = subtotal + iva;

  const labelW = 120;
  const valX = PAGE_WIDTH - PAGE_MARGIN - 200;

  doc.font(FONTS.regular).fontSize(9.5).fillColor(COLORS.textMid);
  doc.text('Subtotal', valX, doc.y, { width: labelW });
  doc.text(formatMoney(subtotal), valX + labelW, doc.y - doc.currentLineHeight(), { width: 80, align: 'right' });

  doc.text(`IVA (${ivaPorcentaje}%)`, valX, doc.y, { width: labelW });
  doc.text(formatMoney(iva), valX + labelW, doc.y - doc.currentLineHeight(), { width: 80, align: 'right' });

  doc.moveDown(0.3);
  doc.font(FONTS.bold).fontSize(12).fillColor(COLORS.text);
  doc.text('TOTAL', valX, doc.y, { width: labelW });
  doc.text(formatMoney(total), valX + labelW, doc.y - doc.currentLineHeight(), { width: 80, align: 'right' });

  doc.moveDown(1);
  return { iva, total };
}

function drawPaymentBlock(doc) {
  doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Formas de pago');
  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted);
  doc.text(`Transferencia bancaria: ${OWNER.cuenta_bancaria}`);
  doc.text(`Bizum: ${OWNER.bizum}`);
  doc.moveDown(1);
}

function finalize(doc, filePath) {
  return new Promise((resolve, reject) => {
    const stream = createWriteStream(filePath);
    doc.pipe(stream);
    doc.end();
    stream.on('finish', () => resolve(filePath));
    stream.on('error', reject);
  });
}

export async function buildPresupuestoPDF({ presupuesto, proyecto, cliente, conceptos, filePath }) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  drawHeader(doc, { tipoDocumento: 'PRESUPUESTO', numero: presupuesto.numero, fecha: presupuesto.created_at });
  drawClientBlock(doc, cliente);
  drawProjectBlock(doc, proyecto);

  const subtotal = drawConceptsTable(doc, conceptos);
  const { total } = drawTotals(doc, subtotal, 21);

  if (presupuesto.porcentaje_cobro && presupuesto.porcentaje_cobro < 100) {
    const solicitado = total * (presupuesto.porcentaje_cobro / 100);
    doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.accent)
      .text(`Importe solicitado (${presupuesto.porcentaje_cobro}%): ${formatMoney(solicitado)}`);
    doc.moveDown(1);
  }

  drawPaymentBlock(doc);

  if (presupuesto.notas) {
    doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Términos y condiciones');
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted).text(presupuesto.notas);
    doc.moveDown(1);
  }

  doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.textMuted)
    .text('Presupuesto válido por 30 días.', PAGE_MARGIN, 780, { width: PAGE_WIDTH - 2 * PAGE_MARGIN, align: 'center' });

  return finalize(doc, filePath);
}

export async function buildFacturaPDF({ factura, proyecto, cliente, conceptos, filePath }) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });
  drawHeader(doc, { tipoDocumento: 'FACTURA', numero: factura.numero, fecha: factura.created_at });
  drawClientBlock(doc, cliente);

  if (factura.fecha_vencimiento) {
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted)
      .text(`Fecha de vencimiento: ${formatDateEs(factura.fecha_vencimiento)}`);
    doc.moveDown(0.5);
  }

  drawProjectBlock(doc, proyecto);

  const subtotal = drawConceptsTable(doc, conceptos);
  drawTotals(doc, subtotal, factura.iva_porcentaje ?? 21);

  drawPaymentBlock(doc);

  if (factura.notas) {
    doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Notas');
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted).text(factura.notas);
  }

  return finalize(doc, filePath);
}

export async function buildReciboPDF({ recibo, ingreso, cliente, filePath }) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

  doc.font(FONTS.bold).fontSize(12).fillColor(COLORS.text).text(OWNER.nombre);
  doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted)
    .text(`NIF: ${OWNER.nif}  ·  ${OWNER.telefono}  ·  ${OWNER.email}`);
  doc.moveDown(1);

  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_WIDTH - PAGE_MARGIN, doc.y)
    .strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.moveDown(1);

  doc.font(FONTS.bold).fontSize(16).fillColor(COLORS.accent)
    .text('RECIBO DE PAGO', { align: 'center' });
  doc.moveDown(1);

  doc.font(FONTS.regular).fontSize(9.5).fillColor(COLORS.textMid);
  doc.text(`Nº recibo: ${recibo.numero}`);
  doc.text(`Fecha: ${formatDateEs(ingreso.fecha)}`);
  if (cliente) doc.text(`Cliente: ${cliente.nombre}`);
  doc.moveDown(1);

  doc.font(FONTS.bold).fontSize(10).fillColor(COLORS.text).text('Concepto');
  doc.font(FONTS.regular).fontSize(9.5).fillColor(COLORS.textMid).text(ingreso.concepto);
  doc.moveDown(1);

  doc.font(FONTS.bold).fontSize(14).fillColor(COLORS.text)
    .text(`Importe recibido: ${formatMoney(ingreso.importe)}`);
  doc.moveDown(0.5);

  doc.font(FONTS.regular).fontSize(9.5).fillColor(COLORS.textMuted)
    .text(`Método de pago: ${ingreso.metodo || '—'}`);
  doc.moveDown(3);

  doc.font(FONTS.regular).fontSize(9.5).fillColor(COLORS.text).text('Recibido conforme:');
  doc.moveDown(2);
  doc.moveTo(PAGE_MARGIN, doc.y).lineTo(PAGE_MARGIN + 200, doc.y)
    .strokeColor(COLORS.border).lineWidth(1).stroke();
  doc.font(FONTS.regular).fontSize(8).fillColor(COLORS.textMuted)
    .text('Firma', PAGE_MARGIN, doc.y + 4);

  return finalize(doc, filePath);
}

export async function buildContratoPDF({
  contrato, proyecto, cliente, conceptos, firmaPngBuffer, hash, filePath,
}) {
  const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN });

  drawHeader(doc, { tipoDocumento: 'CONTRATO', numero: `C-${contrato.id}`, fecha: contrato.created_at });

  doc.font(FONTS.bold).fontSize(14).fillColor(COLORS.text)
    .text('CONTRATO DE SERVICIOS', { align: 'center' });
  doc.moveDown(1);

  drawClientBlock(doc, cliente);
  drawProjectBlock(doc, proyecto);

  const subtotal = drawConceptsTable(doc, conceptos);
  drawTotals(doc, subtotal, 21);

  if (contrato.metodo_pago || contrato.plazos_pago) {
    doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Condiciones de pago');
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted);
    if (contrato.metodo_pago) doc.text(`Método: ${contrato.metodo_pago}`);
    if (contrato.plazos_pago) doc.text(`Plazos: ${contrato.plazos_pago}`);
    doc.moveDown(1);
  }

  drawPaymentBlock(doc);

  if (contrato.terminos) {
    doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Términos y condiciones');
    doc.font(FONTS.regular).fontSize(9).fillColor(COLORS.textMuted).text(contrato.terminos);
    doc.moveDown(1);
  }

  if (doc.y > 620) doc.addPage();

  doc.font(FONTS.bold).fontSize(9.5).fillColor(COLORS.text).text('Firma');
  doc.font(FONTS.regular).fontSize(8.5).fillColor(COLORS.textMuted)
    .text(`Firmado digitalmente el ${formatDateEs(contrato.firmado_at)} desde IP ${contrato.firmado_ip}`);
  doc.moveDown(0.5);

  if (firmaPngBuffer) {
    try {
      doc.image(firmaPngBuffer, PAGE_MARGIN, doc.y, { fit: [220, 100] });
      doc.y += 110;
    } catch {
      // ignore malformed signature image
    }
  }

  if (hash) {
    doc.font(FONTS.regular).fontSize(6.5).fillColor(COLORS.textMuted)
      .text(`SHA-256: ${hash}`, PAGE_MARGIN, 800, { width: PAGE_WIDTH - 2 * PAGE_MARGIN });
  }

  return finalize(doc, filePath);
}
