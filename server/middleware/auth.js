export const sessions = new Set();

export function requireAuth(req, reply, done) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token || !sessions.has(token)) {
    reply.code(401).send({ error: 'No autorizado' });
    return;
  }

  req.token = token;
  done();
}
