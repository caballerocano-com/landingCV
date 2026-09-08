import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function elementosRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/elementos', async () => {
    return db.prepare('SELECT * FROM elementos ORDER BY nombre ASC').all();
  });

  app.post('/api/elementos', async (req, reply) => {
    const { nombre, descripcion, precio_unitario, unidad, activo } = req.body || {};
    if (!nombre) return reply.code(400).send({ error: 'nombre es obligatorio' });

    const result = db.prepare(
      `INSERT INTO elementos (nombre, descripcion, precio_unitario, unidad, activo)
       VALUES (?, ?, ?, ?, ?)`
    ).run(
      nombre,
      descripcion || null,
      precio_unitario ?? 0,
      unidad || 'ud',
      activo === undefined ? 1 : (activo ? 1 : 0)
    );

    return db.prepare('SELECT * FROM elementos WHERE id = ?').get(result.lastInsertRowid);
  });

  app.put('/api/elementos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM elementos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { nombre, descripcion, precio_unitario, unidad, activo } = req.body || {};
    db.prepare(
      `UPDATE elementos SET nombre = ?, descripcion = ?, precio_unitario = ?, unidad = ?, activo = ?
       WHERE id = ?`
    ).run(
      nombre ?? existing.nombre,
      descripcion ?? existing.descripcion,
      precio_unitario ?? existing.precio_unitario,
      unidad ?? existing.unidad,
      activo === undefined ? existing.activo : (activo ? 1 : 0),
      req.params.id
    );

    return db.prepare('SELECT * FROM elementos WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/elementos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM elementos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM elementos WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
