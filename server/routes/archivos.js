import crypto from 'crypto';
import { mkdirSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import db from '../db/database.js';
import { requireAuth } from '../middleware/auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_DIR = join(__dirname, '../storage/proyectos');

// No @fastify/multipart or busboy is installed, and installing packages is
// not allowed here — so multipart/form-data bodies are parsed by hand below.
// Fastify is told to hand over the raw request body as a single Buffer for
// this content type; everything else is plain byte-level parsing using
// Buffer.indexOf (safe for binary data, unlike string splitting).

function extractBoundary(contentType) {
  const match = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || '');
  if (!match) return null;
  return (match[1] || match[2]).trim();
}

function parseContentDisposition(value) {
  const result = {};
  const nameMatch = /name="([^"]*)"/i.exec(value || '');
  if (nameMatch) result.name = nameMatch[1];
  const filenameMatch = /filename="([^"]*)"/i.exec(value || '');
  if (filenameMatch) result.filename = filenameMatch[1];
  return result;
}

function parseMultipart(buffer, boundary) {
  const boundaryBuf = Buffer.from(`--${boundary}`);
  const parts = [];
  let start = buffer.indexOf(boundaryBuf);

  while (start !== -1) {
    const partStart = start + boundaryBuf.length;
    const nextStart = buffer.indexOf(boundaryBuf, partStart);
    if (nextStart === -1) break;

    let partBuf = buffer.slice(partStart, nextStart);
    if (partBuf.slice(0, 2).toString('latin1') === '\r\n') partBuf = partBuf.slice(2);
    if (partBuf.slice(-2).toString('latin1') === '\r\n') partBuf = partBuf.slice(0, -2);

    if (partBuf.length > 0) {
      const headerEnd = partBuf.indexOf('\r\n\r\n');
      if (headerEnd !== -1) {
        const headerStr = partBuf.slice(0, headerEnd).toString('utf8');
        const body = partBuf.slice(headerEnd + 4);
        const headers = {};
        for (const line of headerStr.split('\r\n')) {
          const idx = line.indexOf(':');
          if (idx === -1) continue;
          headers[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
        }
        parts.push({ headers, body });
      }
    }

    start = nextStart;
  }

  return parts;
}

export default async function archivosRoutes(app) {
  // multipart/form-data has no default parser in Fastify without a plugin;
  // this registers the content type but defers all parsing to the route.
  app.addContentTypeParser('multipart/form-data', { parseAs: 'buffer' }, (req, body, done) => {
    done(null, body);
  });

  app.addHook('preHandler', requireAuth);

  app.get('/api/archivos', async (req, reply) => {
    const { proyecto_id } = req.query || {};
    if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

    return db.prepare('SELECT * FROM archivos WHERE proyecto_id = ? ORDER BY created_at DESC').all(proyecto_id);
  });

  app.post('/api/archivos/upload', async (req, reply) => {
    const boundary = extractBoundary(req.headers['content-type']);
    if (!boundary || !Buffer.isBuffer(req.body)) {
      return reply.code(400).send({ error: 'Cuerpo multipart inválido' });
    }

    const parts = parseMultipart(req.body, boundary);

    let proyecto_id = null;
    let descripcion = null;
    const fileParts = [];

    for (const part of parts) {
      const disp = parseContentDisposition(part.headers['content-disposition']);
      if (!disp.name) continue;

      if (disp.name === 'files' && disp.filename) {
        fileParts.push({
          filename: disp.filename,
          contentType: part.headers['content-type'] || 'application/octet-stream',
          body: part.body,
        });
      } else if (disp.name === 'proyecto_id') {
        proyecto_id = part.body.toString('utf8').trim();
      } else if (disp.name === 'descripcion') {
        descripcion = part.body.toString('utf8').trim();
      }
    }

    if (!proyecto_id) return reply.code(400).send({ error: 'proyecto_id es obligatorio' });

    const proyecto = db.prepare('SELECT id FROM proyectos WHERE id = ?').get(proyecto_id);
    if (!proyecto) return reply.code(404).send({ error: 'Proyecto no encontrado' });

    const projectDir = join(STORAGE_DIR, String(proyecto_id));
    mkdirSync(projectDir, { recursive: true });

    const created = [];
    for (const file of fileParts) {
      const mimetype = file.contentType.split(';')[0].trim();
      if (!mimetype.startsWith('image/') && !mimetype.startsWith('video/')) continue;

      const tipo = mimetype.startsWith('video/') ? 'video' : 'foto';
      const ext = extname(file.filename).toLowerCase() || (tipo === 'video' ? '.mp4' : '.jpg');
      const filename = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;
      const filePath = join(projectDir, filename);

      writeFileSync(filePath, file.body);

      const result = db.prepare(
        `INSERT INTO archivos (proyecto_id, filename, tipo, descripcion) VALUES (?, ?, ?, ?)`
      ).run(proyecto_id, filename, tipo, descripcion || null);

      created.push(db.prepare('SELECT * FROM archivos WHERE id = ?').get(result.lastInsertRowid));
    }

    return created;
  });

  app.delete('/api/archivos/:id', async (req, reply) => {
    const archivo = db.prepare('SELECT * FROM archivos WHERE id = ?').get(req.params.id);
    if (!archivo) return reply.code(404).send({ error: 'No encontrado' });

    const filePath = join(STORAGE_DIR, String(archivo.proyecto_id), archivo.filename);
    try {
      unlinkSync(filePath);
    } catch {
      // File already missing on disk — still remove the DB record below.
    }

    db.prepare('DELETE FROM archivos WHERE id = ?').run(req.params.id);
    return { success: true };
  });
}
