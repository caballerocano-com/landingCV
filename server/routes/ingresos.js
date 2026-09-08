import { createReadStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { buildReciboPDF } from '../pdf/templates.js';
import { generarNumero } from './documentos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/recibos');

export default async function ingresosRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/ingresos', async (req) => {
    const { proyecto_id } = req.query || {};
    if (proyecto_id) {
      return db.prepare('SELECT * FROM ingresos WHERE proyecto_id = ? ORDER BY fecha DESC').all(proyecto_id);
    }
    return db.prepare('SELECT * FROM ingresos ORDER BY fecha DESC').all();
  });

  app.post('/api/ingresos', async (req, reply) => {
    const { proyecto_id, factura_id, presupuesto_id, concepto, importe, fecha, metodo, notas } = req.body || {};
    if (!concepto || importe === undefined || !fecha) {
      return reply.code(400).send({ error: 'concepto, importe y fecha son obligatorios' });
    }

    const result = db.prepare(
      `INSERT INTO ingresos (proyecto_id, factura_id, presupuesto_id, concepto, importe, fecha, metodo, notas)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      proyecto_id || null,
      factura_id || null,
      presupuesto_id || null,
      concepto,
      importe,
      fecha,
      metodo || null,
      notas || null
    );

    return db.prepare('SELECT * FROM ingresos WHERE id = ?').get(result.lastInsertRowid);
  });

  app.put('/api/ingresos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { concepto, importe, fecha, metodo, notas } = req.body || {};
    db.prepare(
      `UPDATE ingresos SET concepto = ?, importe = ?, fecha = ?, metodo = ?, notas = ? WHERE id = ?`
    ).run(
      concepto ?? existing.concepto,
      importe ?? existing.importe,
      fecha ?? existing.fecha,
      metodo ?? existing.metodo,
      notas ?? existing.notas,
      req.params.id
    );

    return db.prepare('SELECT * FROM ingresos WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/ingresos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM ingresos WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.post('/api/ingresos/:id/recibo', async (req, reply) => {
    const ingreso = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(req.params.id);
    if (!ingreso) return reply.code(404).send({ error: 'Ingreso no encontrado' });

    const cliente = ingreso.proyecto_id
      ? db.prepare(
          `SELECT c.* FROM clientes c JOIN proyectos p ON p.cliente_id = c.id WHERE p.id = ?`
        ).get(ingreso.proyecto_id)
      : null;

    const numero = generarNumero('recibo');
    const result = db.prepare(`INSERT INTO recibos (ingreso_id, numero) VALUES (?, ?)`).run(ingreso.id, numero);
    const recibo = db.prepare('SELECT * FROM recibos WHERE id = ?').get(result.lastInsertRowid);

    const filePath = join(STORAGE_DIR, `${numero}.pdf`);
    await buildReciboPDF({ recibo, ingreso, cliente, filePath });

    db.prepare('UPDATE recibos SET pdf_path = ? WHERE id = ?').run(filePath, recibo.id);
    db.prepare('UPDATE ingresos SET recibo_pdf_path = ? WHERE id = ?').run(filePath, ingreso.id);

    return db.prepare('SELECT * FROM recibos WHERE id = ?').get(recibo.id);
  });

  app.get('/api/ingresos/:id/recibo/pdf', async (req, reply) => {
    const ingreso = db.prepare('SELECT * FROM ingresos WHERE id = ?').get(req.params.id);
    if (!ingreso || !ingreso.recibo_pdf_path || !existsSync(ingreso.recibo_pdf_path)) {
      return reply.code(404).send({ error: 'PDF no encontrado' });
    }
    reply.header('Content-Type', 'application/pdf');
    return reply.send(createReadStream(ingreso.recibo_pdf_path));
  });
}
