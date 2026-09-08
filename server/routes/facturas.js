import { createReadStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { buildFacturaPDF } from '../pdf/templates.js';
import { generarNumero } from './documentos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/facturas');

export default async function facturasRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/facturas', async (req) => {
    const { proyecto_id } = req.query || {};
    if (proyecto_id) {
      return db.prepare('SELECT * FROM facturas WHERE proyecto_id = ? ORDER BY created_at DESC').all(proyecto_id);
    }
    return db.prepare('SELECT * FROM facturas ORDER BY created_at DESC').all();
  });

  app.post('/api/facturas', async (req, reply) => {
    const { proyecto_id, presupuesto_id, iva_porcentaje, fecha_vencimiento, notas } = req.body || {};
    if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

    const cliente = proyecto.cliente_id
      ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id)
      : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(proyecto_id);

    const numero = generarNumero('factura');

    const result = db.prepare(
      `INSERT INTO facturas (proyecto_id, presupuesto_id, numero, iva_porcentaje, fecha_vencimiento, notas)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(proyecto_id, presupuesto_id || null, numero, iva_porcentaje ?? 21, fecha_vencimiento || null, notas || null);

    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(result.lastInsertRowid);

    const filePath = join(STORAGE_DIR, `${numero}.pdf`);
    await buildFacturaPDF({ factura, proyecto, cliente, conceptos, filePath });

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

    const { numero, estado, fecha_vencimiento, notas } = req.body || {};
    db.prepare(
      `UPDATE facturas SET numero = ?, estado = ?, fecha_vencimiento = ?, notas = ? WHERE id = ?`
    ).run(
      numero ?? existing.numero,
      estado ?? existing.estado,
      fecha_vencimiento ?? existing.fecha_vencimiento,
      notas ?? existing.notas,
      req.params.id
    );

    return db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
  });

  app.get('/api/facturas/:id/pdf', async (req, reply) => {
    const factura = db.prepare('SELECT * FROM facturas WHERE id = ?').get(req.params.id);
    if (!factura || !factura.pdf_path || !existsSync(factura.pdf_path)) {
      return reply.code(404).send({ error: 'PDF no encontrado' });
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${factura.numero}.pdf"`);
    return reply.send(createReadStream(factura.pdf_path));
  });
}
