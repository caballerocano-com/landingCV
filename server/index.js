import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(__dirname, '../public');

const SUPPORTED_LANGS = ['es', 'en', 'fr', 'it', 'de', 'pt'];
const DEFAULT_LANG    = 'en';

const app = Fastify({ logger: false });

// Serve static files
await app.register(fastifyStatic, {
  root: PUBLIC,
  prefix: '/',
});

// ── Route logic ────────────────────────────────────────────────────
// /              → redirect to /<detected-lang>/
// /<lang>/       → serve index.html (CV)
// /<lang>/portfolio → serve portfolio.html
// /cv            → redirect to /<lang>/
// /portfolio     → redirect to /<lang>/portfolio

function detectLang(req) {
  const accept = req.headers['accept-language'] || '';
  const langs  = accept.split(',').map(l => l.split(';')[0].trim().toLowerCase().slice(0, 2));
  return langs.find(l => SUPPORTED_LANGS.includes(l)) || DEFAULT_LANG;
}

// Root → redirect to lang
app.get('/', (req, reply) => {
  const lang = detectLang(req);
  reply.redirect(302, `/${lang}/`);
});

// /cv → redirect
app.get('/cv', (req, reply) => {
  const lang = detectLang(req);
  reply.redirect(302, `/${lang}/`);
});

// /portfolio → redirect
app.get('/portfolio', (req, reply) => {
  const lang = detectLang(req);
  reply.redirect(302, `/${lang}/portfolio`);
});

// /<lang>/ → CV
app.get('/:lang/', (req, reply) => {
  const lang = req.params.lang;
  if (!SUPPORTED_LANGS.includes(lang)) {
    return reply.redirect(302, `/${DEFAULT_LANG}/`);
  }
  reply.sendFile('index.html');
});

// /<lang>/portfolio → Portfolio
app.get('/:lang/portfolio', (req, reply) => {
  const lang = req.params.lang;
  if (!SUPPORTED_LANGS.includes(lang)) {
    return reply.redirect(302, `/${DEFAULT_LANG}/portfolio`);
  }
  reply.sendFile('portfolio.html');
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
