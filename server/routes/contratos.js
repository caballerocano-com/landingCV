import crypto from 'crypto';
import { createReadStream, existsSync, readFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';
import { buildContratoPDF } from '../pdf/templates.js';
import { generarNumero } from './documentos.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/contratos');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function proyectoConCliente(proyectoId) {
  return db.prepare(
    `SELECT p.*, c.nombre AS cliente_nombre FROM proyectos p
     LEFT JOIN clientes c ON c.id = p.cliente_id WHERE p.id = ?`
  ).get(proyectoId);
}

export default async function contratosRoutes(app) {
  // ── Protected routes ──────────────────────────────────────────────

  app.register(async (protectedApp) => {
    protectedApp.addHook('preHandler', requireAuth);

    protectedApp.get('/api/contratos', async (req) => {
      const { proyecto_id } = req.query || {};
      if (proyecto_id) {
        return db.prepare('SELECT * FROM contratos WHERE proyecto_id = ? ORDER BY created_at DESC').all(proyecto_id);
      }
      return db.prepare('SELECT * FROM contratos ORDER BY created_at DESC').all();
    });

    protectedApp.post('/api/contratos', async (req, reply) => {
      const { proyecto_id, terminos, metodo_pago, plazos_pago, incluirFotos } = req.body || {};
      if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

      const proyecto = db.prepare('SELECT * FROM proyectos WHERE id = ?').get(proyecto_id);
      if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

      const token = crypto.randomBytes(16).toString('hex'); // 32 hex chars
      const expiresAt = new Date(Date.now() + THIRTY_DAYS_MS).toISOString();
      const numero = generarNumero('encargo');

      const result = db.prepare(
        `INSERT INTO contratos (proyecto_id, numero, token, terminos, metodo_pago, plazos_pago, expires_at, incluir_fotos)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(proyecto_id, numero, token, terminos || null, metodo_pago || null, plazos_pago || null, expiresAt, incluirFotos ? 1 : 0);

      return db.prepare('SELECT * FROM contratos WHERE id = ?').get(result.lastInsertRowid);
    });

    protectedApp.get('/api/contratos/:id', async (req, reply) => {
      const contrato = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!contrato) return reply.code(404).send({ error: 'No encontrado' });
      return contrato;
    });

    protectedApp.put('/api/contratos/:id', async (req, reply) => {
      const existing = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'No encontrado' });
      if (existing.estado !== 'borrador') {
        return reply.code(403).send({ error: 'No se puede editar un documento ya emitido' });
      }

      const { terminos, metodo_pago, plazos_pago } = req.body || {};
      db.prepare(
        `UPDATE contratos SET terminos = ?, metodo_pago = ?, plazos_pago = ? WHERE id = ?`
      ).run(
        terminos ?? existing.terminos,
        metodo_pago ?? existing.metodo_pago,
        plazos_pago ?? existing.plazos_pago,
        req.params.id
      );

      // PDF is only generated at signing time — no regeneration here.
      return db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    });

    protectedApp.delete('/api/contratos/:id', async (req, reply) => {
      const existing = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'No encontrado' });
      if (existing.estado !== 'borrador') {
        return reply.code(403).send({ error: 'Solo se pueden eliminar borradores' });
      }

      if (existing.pdf_path) {
        try { unlinkSync(existing.pdf_path); } catch { /* already gone */ }
      }
      db.prepare('DELETE FROM contratos WHERE id = ?').run(req.params.id);
      // Deleted document numbers are never reused (fiscal integrity)
      return { success: true };
    });

    protectedApp.patch('/api/contratos/:id/enviar', async (req, reply) => {
      const existing = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'No encontrado' });
      if (existing.estado !== 'borrador') {
        return db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      }

      db.prepare(`UPDATE contratos SET estado = 'enviado' WHERE id = ?`).run(req.params.id);
      return db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    });

    protectedApp.patch('/api/contratos/:id/anular', async (req, reply) => {
      const existing = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!existing) return reply.code(404).send({ error: 'No encontrado' });
      if (existing.estado !== 'enviado') {
        return reply.code(403).send({ error: 'Este documento no se puede anular' });
      }

      db.prepare(`UPDATE contratos SET estado = 'anulado' WHERE id = ?`).run(req.params.id);
      return db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
    });

    protectedApp.get('/api/contratos/:id/pdf', async (req, reply) => {
      const contrato = db.prepare('SELECT * FROM contratos WHERE id = ?').get(req.params.id);
      if (!contrato || !contrato.pdf_path || !existsSync(contrato.pdf_path)) {
        return reply.code(404).send({ error: 'PDF no encontrado' });
      }
      reply.header('Content-Type', 'application/pdf');
      reply.header('Content-Disposition', `inline; filename="contrato-${contrato.id}.pdf"`);
      return reply.send(createReadStream(contrato.pdf_path));
    });
  });

  // ── Public routes (no auth) ─────────────────────────────────────────

  app.get('/api/contratos/public/:token/pdf', async (req, reply) => {
    const contrato = db.prepare('SELECT * FROM contratos WHERE token = ?').get(req.params.token);
    if (!contrato || contrato.estado !== 'firmado' || !contrato.pdf_path || !existsSync(contrato.pdf_path)) {
      return reply.code(404).send({ error: 'PDF no encontrado' });
    }
    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `inline; filename="contrato-${contrato.id}.pdf"`);
    return reply.send(createReadStream(contrato.pdf_path));
  });

  app.get('/api/contratos/public/:token', async (req, reply) => {
    const contrato = db.prepare('SELECT * FROM contratos WHERE token = ?').get(req.params.token);
    if (!contrato) return reply.code(404).send({ error: 'Contrato no encontrado' });

    if (contrato.estado === 'firmado') {
      return { estado: 'firmado', firmado_at: contrato.firmado_at };
    }

    // 'expirado' is a computed, transient condition (from expires_at) rather
    // than a persisted estado — the stored state machine is only
    // borrador | enviado | firmado | anulado.
    if (new Date(contrato.expires_at).getTime() < Date.now()) {
      return { estado: 'expirado' };
    }

    const proyecto = proyectoConCliente(contrato.proyecto_id);
    const cliente = proyecto?.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id) : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(contrato.proyecto_id);

    return {
      estado: contrato.estado,
      contrato: {
        id: contrato.id,
        numero: contrato.numero,
        terminos: contrato.terminos,
        metodo_pago: contrato.metodo_pago,
        plazos_pago: contrato.plazos_pago,
        created_at: contrato.created_at,
        expires_at: contrato.expires_at,
      },
      proyecto,
      cliente,
      conceptos,
    };
  });

  app.post('/api/contratos/firmar/:token', async (req, reply) => {
    const contrato = db.prepare('SELECT * FROM contratos WHERE token = ?').get(req.params.token);
    if (!contrato) return reply.code(404).send({ error: 'Contrato no encontrado' });
    if (contrato.estado === 'firmado') return reply.code(409).send({ error: 'Este contrato ya fue firmado' });
    if (new Date(contrato.expires_at).getTime() < Date.now()) {
      db.prepare(`UPDATE contratos SET estado = 'expirado' WHERE id = ?`).run(contrato.id);
      return reply.code(410).send({ error: 'Este enlace ha expirado' });
    }

    const { firma } = req.body || {};
    if (!firma || typeof firma !== 'string') {
      return reply.code(400).send({ error: 'Falta la firma' });
    }

    const base64Data = firma.replace(/^data:image\/png;base64,/, '');
    const firmaPngBuffer = Buffer.from(base64Data, 'base64');

    const proyecto = proyectoConCliente(contrato.proyecto_id);
    const cliente = proyecto?.cliente_id ? db.prepare('SELECT * FROM clientes WHERE id = ?').get(proyecto.cliente_id) : null;
    const conceptos = db.prepare('SELECT * FROM conceptos WHERE proyecto_id = ? ORDER BY orden ASC, id ASC').all(contrato.proyecto_id);
    const fotos = contrato.incluir_fotos
      ? db.prepare(`SELECT * FROM archivos WHERE proyecto_id = ? AND tipo = 'foto' ORDER BY created_at ASC`).all(contrato.proyecto_id)
      : [];

    const firmadoAt = new Date().toISOString();
    const firmadoIp = req.ip || req.headers['x-forwarded-for'] || '';

    const contratoParaPdf = { ...contrato, firmado_at: firmadoAt, firmado_ip: firmadoIp };

    const filePath = join(STORAGE_DIR, `contrato-${contrato.id}-${contrato.token}.pdf`);

    await buildContratoPDF({
      contrato: contratoParaPdf,
      proyecto,
      cliente,
      conceptos,
      fotos,
      firmaPngBuffer,
      hash: null,
      filePath,
    });

    const pdfBuffer = readFileSync(filePath);
    const hash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    // Rebuild with the hash now that it's known.
    await buildContratoPDF({
      contrato: contratoParaPdf,
      proyecto,
      cliente,
      conceptos,
      fotos,
      firmaPngBuffer,
      hash,
      filePath,
    });

    const finalHash = crypto.createHash('sha256').update(readFileSync(filePath)).digest('hex');

    db.prepare(
      `UPDATE contratos SET estado = 'firmado', firmado_at = ?, firmado_ip = ?, pdf_path = ?, pdf_hash = ? WHERE id = ?`
    ).run(firmadoAt, firmadoIp, filePath, finalHash, contrato.id);

    return {
      ok: true,
      downloadUrl: `/api/contratos/public/${contrato.token}/pdf`,
    };
  });
}
