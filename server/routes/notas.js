import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function notasRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/notas', async (req) => {
    const { proyecto_id } = req.query || {};
    if (!proyecto_id) return [];

    try {
      return db.prepare('SELECT * FROM notas WHERE proyecto_id = ? ORDER BY created_at DESC').all(proyecto_id);
    } catch {
      // Table not created yet in this environment (manual migration pending).
      return [];
    }
  });

  app.post('/api/notas', async (req, reply) => {
    const { proyecto_id, texto } = req.body || {};
    if (!proyecto_id || !texto) {
      return reply.code(400).send({ error: 'proyecto_id y texto son obligatorios' });
    }

    const result = db.prepare(
      `INSERT INTO notas (proyecto_id, texto, created_at) VALUES (?, ?, datetime('now'))`
    ).run(proyecto_id, texto);

    return db.prepare('SELECT * FROM notas WHERE id = ?').get(result.lastInsertRowid);
  });

  app.delete('/api/notas/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM notas WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM notas WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
