import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function tiposRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/tipos-servicio', async () => {
    return db.prepare('SELECT * FROM tipos_servicio ORDER BY nombre ASC').all();
  });

  app.post('/api/tipos-servicio', async (req, reply) => {
    const { nombre } = req.body || {};
    const trimmed = (nombre || '').trim();
    if (!trimmed) return reply.code(400).send({ error: 'nombre es obligatorio' });

    db.prepare('INSERT OR IGNORE INTO tipos_servicio (nombre) VALUES (?)').run(trimmed);
    return db.prepare('SELECT * FROM tipos_servicio WHERE nombre = ?').get(trimmed);
  });
}
