import { createReadStream, createWriteStream, existsSync, unlinkSync, unlink } from 'fs';
import { join, dirname } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { ZipArchive } from 'archiver';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { buildFacturaPDF } from '../pdf/templates.js';
import { generarNumero, numeroEnUso, registrarNumeroManual } from './documentos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/facturas');

// A borrador has no fiscal numero yet, so its PDF is named after its row id
// instead. Emitir assigns the real numero and renames this file to match.
function borradorFilePath(id) {
  return join(STORAGE_DIR, `borrador-${id}.pdf`);
}

const LISTADO_SELECT = `
  SELECT f.*, c.nombre AS cliente_nombre, p.nombre AS proyecto_nombre
  FROM facturas f
  LEFT JOIN proyectos p ON p.id = f.proyecto_id
  LEFT JOIN clientes c ON c.id = p.cliente_id
`;

function buildListadoQuery(query) {
  const { proyecto_id, cliente_id, serie, anio, estado, desde, hasta, q } = query || {};
  const where = [];
  const params = [];

  if (proyecto_id) { where.push('f.proyecto_id = ?'); params.push(proyecto_id); }
  if (cliente_id) { where.push('c.id = ?'); params.push(cliente_id); }
  if (serie === 'factura') where.push('f.es_rectificativa = 0');
  if (serie === 'rectificativa') where.push('f.es_rectificativa = 1');
  if (anio) { where.push(`f.numero LIKE ?`); params.push(`%-${anio}-%`); }
  if (estado) { where.push('f.estado = ?'); params.push(estado); }
  if (desde) { where.push('f.created_at >= ?'); params.push(desde); }
  if (hasta) { where.push('f.created_at <= ?'); params.push(`${hasta} 23:59:59`); }
  if (q) { where.push('f.numero LIKE ?'); params.push(`%${q}%`); }

  const sql = `${LISTADO_SELECT}${where.length ? ` WHERE ${where.join(' AND ')}` : ''} ORDER BY f.created_at DESC`;
  return { sql, params };
}

export default async function facturasRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/facturas', async (req) => {
    const { sql, params } = buildListadoQuery(req.query);
    return db.prepare(sql).all(...params);
  });

  app.post('/api/facturas', async (req, reply) => {
    const {
      proyecto_id, presupuesto_id, iva_porcentaje, fecha_vencimiento, notas,
      es_rectificativa, factura_original_id,
    } = req.body || {};
    if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

    let facturaOriginal = null;
    if (es_rectificativa) {
      if (!factura_original_id) return reply.code(400).send({ error: 'factura_original_id es obligatorio para una rectificativa' });
      facturaOriginal = db.prepare('SELECT * FROM facturas WHERE id = ?').get(factura_original_id);
      if (!facturaOriginal) return reply.code(404).send({ error: 'Factura original no encontrada' });
    }

    const cliente = proyecto.cliente_id
      ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id)
      : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(proyecto_id);

    // No numero is assigned here: a borrador is not a real fiscal document
    // yet, so it must not consume a slot in the factura/rectificativa series.
    // The number is only generated when this is emitida (see PUT below).
    const result = db.prepare(
      `INSERT INTO facturas (proyecto_id, presupuesto_id, numero, iva_porcentaje, fecha_vencimiento, notas, es_rectificativa, factura_original_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?)`
    ).run(
      proyecto_id,
      presupuesto_id || null,
      iva_porcentaje ?? 21,
      fecha_vencimiento || null,
      notas || null,
      es_rectificativa ? 1 : 0,
      es_rectificativa ? factura_original_id : null
    );

    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(result.lastInsertRowid);

    const filePath = borradorFilePath(factura.id);
    await buildFacturaPDF({ factura, proyecto, cliente, conceptos, facturaOriginal, filePath });

    db.prepare('UPDATE facturas SET pdf_path = ? WHERE id = ?').run(filePath, factura.id);

    return db.prepare('SELECT * FROM facturas WHERE id = ?').get(factura.id);
  });

  app.get('/api/facturas/:id', async (req, reply) => {
    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!factura) return reply.code(404).send({ error: 'No encontrado' });
    return factura;
  });

  app.put('/api/facturas/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });
    if (existing.estado !== 'borrador') {
      return reply.code(403).send({ error: 'No se puede editar un documento ya emitido' });
    }

    const { estado, fecha_vencimiento, notas, numero } = req.body || {};

    let nuevoNumero = existing.numero;

    // Manual override of the numero, only while still borrador. Checked for
    // collisions against the whole facturas table (numero is UNIQUE across
    // both facturas and rectificativas) before anything is written.
    if (numero !== undefined && numero !== existing.numero) {
      const limpio = (numero || '').trim() || null;
      if (limpio && numeroEnUso(limpio, existing.id)) {
        return reply.code(409).send({ error: `El número ${limpio} ya está en uso` });
      }
      nuevoNumero = limpio;
      if (limpio) registrarNumeroManual(existing.es_rectificativa ? 'rectificativa' : 'factura', limpio);
    }

    const nuevoEstado = estado ?? existing.estado;

    // Passing from borrador to emitida is what actually consumes a real
    // fiscal numero: a factura that only lived as a discarded test draft
    // never reaches this point, so it never costs a slot in the series.
    if (nuevoEstado === 'emitida' && existing.estado === 'borrador' && !nuevoNumero) {
      nuevoNumero = generarNumero(existing.es_rectificativa ? 'rectificativa' : 'factura');
    }

    db.prepare(
      `UPDATE facturas SET estado = ?, fecha_vencimiento = ?, notas = ?, numero = ? WHERE id = ?`
    ).run(
      nuevoEstado,
      fecha_vencimiento ?? existing.fecha_vencimiento,
      notas ?? existing.notas,
      nuevoNumero,
      req.params.id
    );

    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);

    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(factura.proyecto_id);
    const cliente = proyecto?.cliente_id
      ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id)
      : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(factura.proyecto_id);
    const facturaOriginal = factura.factura_original_id
      ? db.prepare('SELECT * FROM facturas WHERE id = ?').get(factura.factura_original_id)
      : null;

    // The PDF filename always mirrors the current numero (or the draft's
    // row-id placeholder while there isn't one yet), so it stays correct
    // whether numero just changed or the factura just got emitida.
    const targetFilePath = factura.numero ? join(STORAGE_DIR, `${factura.numero}.pdf`) : borradorFilePath(factura.id);
    const oldFilePath = existing.pdf_path;

    await buildFacturaPDF({ factura, proyecto, cliente, conceptos, facturaOriginal, filePath: targetFilePath });

    if (oldFilePath && oldFilePath !== targetFilePath && existsSync(oldFilePath)) {
      try { unlinkSync(oldFilePath); } catch { /* already gone */ }
    }
    if (factura.pdf_path !== targetFilePath) {
      db.prepare('UPDATE facturas SET pdf_path = ? WHERE id = ?').run(targetFilePath, factura.id);
    }

    return db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/facturas/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });
    if (existing.estado !== 'borrador') {
      return reply.code(403).send({ error: 'Solo se pueden eliminar borradores' });
    }

    if (existing.pdf_path) {
      try { unlinkSync(existing.pdf_path); } catch { /* already gone */ }
    }
    db.prepare('DELETE FROM facturas WHERE id = ?').run(req.params.id);
    // A borrador never had a real numero assigned (see POST above), so
    // deleting it frees nothing and leaves no gap in the real series.
    return { success: true };
  });

  app.patch('/api/facturas/:id/anular', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });
    if (existing.estado !== 'emitida' && existing.estado !== 'vencida') {
      return reply.code(403).send({ error: 'Este documento no se puede anular' });
    }

    db.prepare(`UPDATE facturas SET estado = 'anulada' WHERE id = ?`).run(req.params.id);
    return db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
  });

  app.get('/api/facturas/:id/pdf', async (req, reply) => {
    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!factura || !factura.pdf_path || !existsSync(factura.pdf_path)) {
      return reply.code(404).send({ error: 'PDF no encontrado' });
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${factura.numero || factura.id}.pdf"`);
    return reply.send(createReadStream(factura.pdf_path));
  });

  // Bulk delete for the global Facturas listing. Silently skips any id that
  // isn't actually a borrador (same rule as DELETE /api/facturas/:id: an
  // emitida never gets deleted/renumbered, only rectificada) and reports how
  // many were skipped so the UI can tell the user.
  app.post('/api/facturas/bulk-delete', async (req, reply) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return reply.code(400).send({ error: 'ids es obligatorio' });
    }

    let eliminadas = 0;
    let omitidas = 0;
    for (const id of ids) {
      const existing = db.prepare('SELECT * FROM facturas WHERE id = ?').get(id);
      if (!existing || existing.estado !== 'borrador') {
        omitidas++;
        continue;
      }
      if (existing.pdf_path) {
        try { unlinkSync(existing.pdf_path); } catch { /* already gone */ }
      }
      db.prepare('DELETE FROM facturas WHERE id = ?').run(id);
      eliminadas++;
    }

    return { eliminadas, omitidas };
  });

  // Bulk download for the global Facturas listing: either an explicit list
  // of ids, or the same filters as GET /api/facturas when ids is omitted.
  app.post('/api/facturas/zip', async (req, reply) => {
    const { ids, ...filtros } = req.body || {};

    let facturas;
    if (Array.isArray(ids) && ids.length) {
      const placeholders = ids.map(() => '?').join(',');
      facturas = db.prepare(`SELECT * FROM facturas WHERE id IN (${placeholders})`).all(...ids);
    } else {
      const { sql, params } = buildListadoQuery(filtros);
      facturas = db.prepare(sql).all(...params);
    }

    const conPdf = facturas.filter((f) => f.pdf_path && existsSync(f.pdf_path));
    if (conPdf.length === 0) return reply.code(404).send({ error: 'No hay PDFs para descargar' });

    // Built fully to a temp file first (rather than streamed straight into
    // the response) so archiver's own completion event is what we wait on,
    // instead of relying on Fastify's stream detection racing archive.finalize().
    const tmpZipPath = join(tmpdir(), `facturas-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
    await new Promise((resolve, reject) => {
      const output = createWriteStream(tmpZipPath);
      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.on('error', reject);
      output.on('error', reject);
      output.on('close', resolve);
      archive.pipe(output);
      for (const f of conPdf) {
        archive.file(f.pdf_path, { name: `${f.numero || `borrador-${f.id}`}.pdf` });
      }
      archive.finalize();
    });

    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', 'attachment; filename="facturas.zip"');
    const stream = createReadStream(tmpZipPath);
    stream.on('close', () => unlink(tmpZipPath, () => {}));
    return reply.send(stream);
  });
}
