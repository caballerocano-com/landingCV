import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function horasRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/horas', async (req) => {
    const { proyecto_id } = req.query || {};
    if (proyecto_id) {
      return db.prepare('SELECT * FROM horas WHERE proyecto_id = ? ORDER BY fecha DESC').all(proyecto_id);
    }
    return db.prepare('SELECT * FROM horas ORDER BY fecha DESC').all();
  });

  app.post('/api/horas', async (req, reply) => {
    const { proyecto_id, fecha, horas, descripcion } = req.body || {};
    if (!proyecto_id || !fecha || horas === undefined) {
      return reply.code(400).send({ error: 'proyecto_id, fecha y horas son obligatorios' });
    }

    const result = db.prepare(
      `INSERT INTO horas (proyecto_id, fecha, horas, descripcion) VALUES (?, ?, ?, ?)`
    ).run(proyecto_id, fecha, horas, descripcion || null);

    return db.prepare('SELECT * FROM horas WHERE id = ?').get(result.lastInsertRowid);
  });

  app.put('/api/horas/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM horas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { fecha, horas, descripcion } = req.body || {};
    db.prepare('UPDATE horas SET fecha = ?, horas = ?, descripcion = ? WHERE id = ?').run(
      fecha ?? existing.fecha,
      horas ?? existing.horas,
      descripcion ?? existing.descripcion,
      req.params.id
    );

    return db.prepare('SELECT * FROM horas WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/horas/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM horas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM horas WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
