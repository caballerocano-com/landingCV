import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

import './db/database.js';
import authRoutes from './routes/auth.js';
import clientesRoutes from './routes/clientes.js';
import proyectosRoutes from './routes/proyectos.js';
import tiposRoutes from './routes/tipos.js';
import elementosRoutes from './routes/elementos.js';
import presupuestosRoutes from './routes/presupuestos.js';
import facturasRoutes from './routes/facturas.js';
import contratosRoutes from './routes/contratos.js';
import ingresosRoutes from './routes/ingresos.js';
import gastosRoutes from './routes/gastos.js';
import horasRoutes from './routes/horas.js';
import archivosRoutes from './routes/archivos.js';
import notasRoutes from './routes/notas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');
const APP_DIR = join(__dirname, 'app');
const STORAGE_DIR = join(__dirname, 'storage');

for (const dir of ['contratos', 'facturas', 'presupuestos', 'recibos', 'proyectos']) {
  mkdirSync(join(STORAGE_DIR, dir), { recursive: true });
}

const SECTIONS = [
  'electricidad', 'construccion', 'pladur', 'alicatados', 'fontaneria',
  'piscinas', 'seguridad', 'carpinteria', 'soldadura', 'manitas',
];
const LANGS = ['es', 'en', 'fr', 'de'];

const app = Fastify({
  logger: false,
  // Default is 1MB, too small for photo/video uploads (archivos.js).
  bodyLimit: 100 * 1024 * 1024,
  // Runs before routing: app.caballerocano.com is transparently mapped
  // onto the /app/ static prefix so the same routes below serve both.
  rewriteUrl(req) {
    const host = (req.headers.host || '').split(':')[0];
    const isPlatformHost = host === 'app.caballerocano.com';
    const alreadyRouted = req.url.startsWith('/api/') || req.url.startsWith('/storage/') || req.url.startsWith('/app/') || req.url.startsWith('/firmar/');
    if (isPlatformHost && !alreadyRouted) {
      return req.url === '/' ? '/app/index.html' : `/app${req.url}`;
    }
    return req.url;
  },
});

// ── Platform (app.caballerocano.com) ────────────────────────────────
// Serves server/app/ under /app/ for local dev, and at the subdomain root
// when the request host is app.caballerocano.com.

await app.register(fastifyStatic, {
  root: APP_DIR,
  prefix: '/app/',
  decorateReply: false,
});

await app.register(fastifyStatic, {
  root: STORAGE_DIR,
  prefix: '/storage/',
  decorateReply: false,
});

app.get('/firmar/:token', (req, reply) => {
  reply.sendFile('firmar.html', APP_DIR);
});

// Platform API routes
app.register(authRoutes);
app.register(clientesRoutes);
app.register(proyectosRoutes);
app.register(tiposRoutes);
app.register(elementosRoutes);
app.register(presupuestosRoutes);
app.register(facturasRoutes);
app.register(contratosRoutes);
app.register(ingresosRoutes);
app.register(gastosRoutes);
app.register(horasRoutes);
app.register(archivosRoutes);
app.register(notasRoutes);

// ── Public website (caballerocano.com) ──────────────────────────────

await app.register(fastifyStatic, {
  root: PUBLIC,
  prefix: '/',
});

// ── Route logic ────────────────────────────────────────────────────
// /                    → index.html
// /:lang               → index.html  (lang in LANGS)
// /:section            → {section}.html  (section in SECTIONS)
// /:section/:lang      → {section}.html
// Route params are constrained by regex so they never shadow real
// static assets served above (e.g. /css/vars.css, /js/app.js).

app.get('/', (req, reply) => {
  reply.sendFile('index.html');
});

const langOrSectionPattern = `^(${[...LANGS, ...SECTIONS].join('|')})$`;

app.get(`/:seg(${langOrSectionPattern})`, (req, reply) => {
  const { seg } = req.params;

  if (LANGS.includes(seg)) {
    return reply.sendFile('index.html');
  }

  return reply.sendFile(`${seg}.html`);
});

const sectionPattern = `^(${SECTIONS.join('|')})$`;
const langPattern = `^(${LANGS.join('|')})$`;

app.get(`/:section(${sectionPattern})/:lang(${langPattern})`, (req, reply) => {
  reply.sendFile(`${req.params.section}.html`);
});

// Fallback
app.setNotFoundHandler((req, reply) => {
  if (req.url.startsWith('/api/')) {
    return reply.code(404).send({ error: 'No encontrado' });
  }
  reply.code(404).sendFile('index.html');
});

// ── Start ──────────────────────────────────────────────────────────
const HOST = process.env.HOST || '0.0.0.0';
const PORT = parseInt(process.env.PORT || '3000', 10);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Server running at http://${HOST}:${PORT}`);
} catch (err) {
  console.error(err);
  process.exit(1);
}
