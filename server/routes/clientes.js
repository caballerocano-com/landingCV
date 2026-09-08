import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

export default async function clientesRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/clientes', async () => {
    return db.prepare('SELECT * FROM clientes ORDER BY nombre ASC').all();
  });

  app.post('/api/clientes', async (req, reply) => {
    const { nombre, nif, direccion_fiscal, telefono, email, notas } = req.body || {};
    if (!nombre) return reply.code(400).send({ error: 'nombre es obligatorio' });

    const result = db.prepare(
      `INSERT INTO clientes (nombre, nif, direccion_fiscal, telefono, email, notas)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(nombre, nif || null, direccion_fiscal || null, telefono || null, email || null, notas || null);

    return db.prepare('SELECT * FROM clientes WHERE id = ?').get(result.lastInsertRowid);
  });

  app.get('/api/clientes/:id', async (req, reply) => {
    const cliente = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!cliente) return reply.code(404).send({ error: 'No encontrado' });

    const proyectos = db.prepare('SELECT * FROM proyectos WHERE cliente_id = ? ORDER BY created_at DESC').all(req.params.id);
    return { ...cliente, proyectos };
  });

  app.put('/api/clientes/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { nombre, nif, direccion_fiscal, telefono, email, notas } = req.body || {};
    db.prepare(
      `UPDATE clientes SET nombre = ?, nif = ?, direccion_fiscal = ?, telefono = ?, email = ?, notas = ?
       WHERE id = ?`
    ).run(
      nombre ?? existing.nombre,
      nif ?? existing.nif,
      direccion_fiscal ?? existing.direccion_fiscal,
      telefono ?? existing.telefono,
      email ?? existing.email,
      notas ?? existing.notas,
      req.params.id
    );

    return db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/clientes/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM clientes WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM clientes WHERE id = ?').run(req.params.id);
    return { ok: true };
  });
}
