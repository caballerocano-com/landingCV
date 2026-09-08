import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function gastosRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/gastos', async (req) => {
    const { proyecto_id } = req.query || {};
    if (proyecto_id) {
      return db.prepare('SELECT * FROM gastos WHERE proyecto_id = ? ORDER BY fecha DESC').all(proyecto_id);
    }
    return db.prepare('SELECT * FROM gastos ORDER BY fecha DESC').all();
  });

  app.post('/api/gastos', async (req, reply) => {
    const { proyecto_id, concepto, importe, fecha, categoria, notas } = req.body || {};
    if (!concepto || importe === undefined || !fecha) {
      return reply.code(400).send({ error: 'concepto, importe y fecha son obligatorios' });
    }

    const result = db.prepare(
      `INSERT INTO gastos (proyecto_id, concepto, importe, fecha, categoria, notas)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(proyecto_id || null, concepto, importe, fecha, categoria || null, notas || null);

    return db.prepare('SELECT * FROM gastos WHERE id = ?').get(result.lastInsertRowid);
  });

  app.put('/api/gastos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { concepto, importe, fecha, categoria, notas } = req.body || {};
    db.prepare(
      `UPDATE gastos SET concepto = ?, importe = ?, fecha = ?, categoria = ?, notas = ? WHERE id = ?`
    ).run(
      concepto ?? existing.concepto,
      importe ?? existing.importe,
      fecha ?? existing.fecha,
      categoria ?? existing.categoria,
      notas ?? existing.notas,
      req.params.id
    );

    return db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/gastos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM gastos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM gastos WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
