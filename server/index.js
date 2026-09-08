import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

const SECTIONS = [
  'electricidad', 'construccion', 'pladur', 'alicatados', 'fontaneria',
  'piscinas', 'seguridad', 'carpinteria', 'soldadura', 'manitas',
];
const LANGS = ['es', 'en', 'fr', 'de'];

const app = Fastify({ logger: false });

// Serve static files (css, js, assets, etc.)
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
