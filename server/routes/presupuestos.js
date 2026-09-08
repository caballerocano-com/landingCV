import { createReadStream, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { buildPresupuestoPDF } from '../pdf/templates.js';
import { generarNumero } from './documentos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/presupuestos');

export default async function presupuestosRoutes(app) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/presupuestos', async (req) => {
    const { proyecto_id } = req.query || {};
    if (proyecto_id) {
      return db.prepare('SELECT * FROM presupuestos WHERE proyecto_id = ? ORDER BY created_at DESC').all(proyecto_id);
    }
    return db.prepare('SELECT * FROM presupuestos ORDER BY created_at DESC').all();
  });

  app.post('/api/presupuestos', async (req, reply) => {
    const { proyecto_id, porcentaje_cobro, notas, incluirFotos } = req.body || {};
    if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

    const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

    const cliente = proyecto.cliente_id
      ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id)
      : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(proyecto_id);
    const fotos = incluirFotos
      ? db.prepare(`SELECT * FROM archivos WHERE proyecto_id = ? AND tipo = 'foto' ORDER BY created_at ASC`).all(proyecto_id)
      : [];

    const numero = generarNumero('presupuesto');

    const result = db.prepare(
      `INSERT INTO presupuestos (proyecto_id, numero, porcentaje_cobro, notas) VALUES (?, ?, ?, ?)`
    ).run(proyecto_id, numero, porcentaje_cobro ?? 100, notas || null);

    const presupuesto = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(result.lastInsertRowid);

    const filePath = join(STORAGE_DIR, `${numero}.pdf`);
    await buildPresupuestoPDF({ presupuesto, proyecto, cliente, conceptos, fotos, filePath });

    db.prepare('UPDATE presupuestos SET pdf_path = ? WHERE id = ?').run(filePath, presupuesto.id);

    return db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(presupuesto.id);
  });

  app.get('/api/presupuestos/:id', async (req, reply) => {
    const presupuesto = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(req.params.id);
    if (!presupuesto) return reply.code(404).send({ error: 'No encontrado' });
    return presupuesto;
  });

  app.put('/api/presupuestos/:id', async (req, reply) => {
    const existing = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(req.params.id);
    if (!existing) return reply.code(404).send({ error: 'No encontrado' });

    const { numero, porcentaje_cobro, estado, notas } = req.body || {};
    db.prepare(
      `UPDATE presupuestos SET numero = ?, porcentaje_cobro = ?, estado = ?, notas = ? WHERE id = ?`
    ).run(
      numero ?? existing.numero,
      porcentaje_cobro ?? existing.porcentaje_cobro,
      estado ?? existing.estado,
      notas ?? existing.notas,
      req.params.id
    );

    return db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(req.params.id);
  });

  app.get('/api/presupuestos/:id/pdf', async (req, reply) => {
    const presupuesto = db.prepare('SELECT * FROM presupuestos WHERE id = ?').get(req.params.id);
    if (!presupuesto || !presupuesto.pdf_path || !existsSync(presupuesto.pdf_path)) {
      return reply.code(404).send({ error: 'PDF no encontrado' });
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="${presupuesto.numero}.pdf"`);
    return reply.send(createReadStream(presupuesto.pdf_path));
  });
}
