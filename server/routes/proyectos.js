import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const ESTADOS = ['creado', 'presupuestado', 'en_curso', 'pendiente_cobro', 'cobrado', 'finalizado'];

export default async function proyectosRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/proyectos', async (req) => {
    const { estado, cliente_id } = req.query || {};
    let sql = `SELECT p.*, c.nombre AS cliente_nombre FROM proyectos p
               LEFT JOIN clientes c ON c.id = p.cliente_id WHERE 1=1`;
    const params = [];

    if (estado) {
      sql += ' AND p.estado = ?';
      params.push(estado);
    }
    if (cliente_id) {
      sql += ' AND p.cliente_id = ?';
      params.push(cliente_id);
    }
    sql += ' ORDER BY p.created_at DESC';

    return db.prepare(sql).all(...params);
  });

  app.post('/api/proyectos', async (req, reply) => {
    const { cliente_id, nombre, descripcion, tipo_servicio, direccion_obra, estado } = req.body || {};
    if (!nombre) return reply.code(400).send({ error: 'nombre es obligatorio' });

    const result = db.prepare(
      `INSERT INTO proyectos (cliente_id, nombre, descripcion, tipo_servicio, direccion_obra, estado)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      cliente_id || null,
      nombre,
      descripcion || null,
      tipo_servicio || null,
      direccion_obra || null,
      estado && ESTADOS.includes(estado) ? estado : 'creado'
    );

    return db.prepare('SELECT * FROM proyectos WHERE id = ?').get(result.lastInsertRowid);
  });

  app.get('/api/proyectos/:id', async (req, reply) => {
    const proyecto = db.prepare(
      `SELECT p.*, c.nombre AS cliente_nombre FROM proyectos p
       LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
    ).get(req.params.id);
    if (!proyecto) return reply.code(404).send({ error: 'No encontrado' });

    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(req.params.id);
    const horas = db.prepare('SELECT * FROM horas WHERE proyecto_id = ? ORDER BY fecha DESC').all(req.params.id);
    const presupuestos = db.prepare('SELECT * FROM presupuestos WHERE proyecto_id = ? ORDER BY created_at DESC').all(req.params.id);
    const facturas = db.prepare('SELECT * FROM facturas WHERE proyecto_id = ? ORDER BY created_at DESC').all(req.params.id);
    const contratos = db.prepare('SELECT * FROM contratos WHERE proyecto_id = ? ORDER BY created_at DESC').all(req.params.id);
    const ingresos = db.prepare('SELECT * FROM ingresos WHERE proyecto_id = ? ORDER BY fecha DESC').all(req.params.id);
    const gastos = db.prepare('SELECT * FROM gastos WHERE proyecto_id = ? ORDER BY fecha DESC').all(req.params.id);

    return {
      ...proyecto,
      conceptos,
      horas,
      presupuestos,
      facturas,
      contratos,
      ingresos,
      gastos,
      counts: {
        conceptos: conceptos.length,
        horas: horas.length,
        presupuestos: presupuestos.length,
        facturas: facturas.length,
        contratos: contratos.length,
        ingresos: ingresos.length,
      },
    };
  });

  app.put('/api/proyectos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { cliente_id, nombre, descripcion, tipo_servicio, direccion_obra } = req.body || {};
    db.prepare(
      `UPDATE proyectos SET cliente_id = ?, nombre = ?, descripcion = ?, tipo_servicio = ?, direccion_obra = ?, updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      cliente_id ?? existing.cliente_id,
      nombre ?? existing.nombre,
      descripcion ?? existing.descripcion,
      tipo_servicio ?? existing.tipo_servicio,
      direccion_obra ?? existing.direccion_obra,
      req.params.id
    );

    return db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  });

  app.delete('/api/proyectos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM proyectos WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.patch('/api/proyectos/:id/estado', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { estado } = req.body || {};
    if (!ESTADOS.includes(estado)) return reply.code(400).send({ error: 'estado inválido' });

    db.prepare(`UPDATE proyectos SET estado = ?, updated_at = datetime('now') WHERE id = ?`).run(estado, req.params.id);
    return db.prepare('SELECT * FROM proyectos WHERE id = ?').get(req.params.id);
  });

  // ── Conceptos ──────────────────────────────────────────────────────

  app.get('/api/proyectos/:id/conceptos', async (req) => {
    return db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(req.params.id);
  });

  app.post('/api/proyectos/:id/conceptos', async (req, reply) => {
    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(req.params.id);
    if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

    const { elemento_id, nombre, descripcion, cantidad, precio_unitario, unidad, orden } = req.body || {};
    if (!nombre) return reply.code(400).send({ error: 'nombre es obligatorio' });

    const result = db.prepare(
      `INSERT INTO conceptos (proyecto_id, elemento_id, nombre, descripcion, cantidad, precio_unitario, unidad, orden)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.params.id,
      elemento_id || null,
      nombre,
      descripcion || null,
      cantidad ?? 1,
      precio_unitario ?? 0,
      unidad || 'ud',
      orden ?? 0
    );

    return db.prepare('SELECT * FROM conceptos WHERE id = ?').get(result.lastInsertRowid);
  });

  async function updateConcepto(req, reply) {
    const existing = db.prepare('SELECT * FROM conceptos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { nombre, descripcion, cantidad, precio_unitario, unidad, orden } = req.body || {};
    db.prepare(
      `UPDATE conceptos SET nombre = ?, descripcion = ?, cantidad = ?, precio_unitario = ?, unidad = ?, orden = ?
       WHERE id = ?`
    ).run(
      nombre ?? existing.nombre,
      descripcion ?? existing.descripcion,
      cantidad ?? existing.cantidad,
      precio_unitario ?? existing.precio_unitario,
      unidad ?? existing.unidad,
      orden ?? existing.orden,
      req.params.id
    );

    return db.prepare('SELECT * FROM conceptos WHERE id = ?').get(req.params.id);
  }

  // PATCH behaves the same as PUT here: every field already falls back to its
  // existing value when omitted, so a partial body (e.g. just { cantidad })
  // updates only that field either way.
  app.put('/api/conceptos/:id', updateConcepto);
  app.patch('/api/conceptos/:id', updateConcepto);

  app.delete('/api/conceptos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM conceptos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    db.prepare('DELETE FROM conceptos WHERE id = ?').run(req.params.id);
    return { ok: true };
  });

  app.patch('/api/conceptos/:id/completado', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM conceptos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { completado } = req.body || {};
    db.prepare('UPDATE conceptos SET completado = ? WHERE id = ?').run(completado ? 1 : 0, req.params.id);
    return db.prepare('SELECT * FROM conceptos WHERE id = ?').get(req.params.id);
  });
}
