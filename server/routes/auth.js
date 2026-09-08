import crypto from 'crypto';
import { sessions, requireAuth } from '../middleware/auth.js';

const USERNAME = 'kaseo';
const PASSWORD = 'sv*kI45ñÑl7+7O/)Q9dEu|yI';

export default async function authRoutes(app) {
  app.post('/api/auth/login', async (req, reply) => {
    const { username, password } = req.body || {};

    if (username !== USERNAME || password !== PASSWORD) {
      return reply.code(401).send({ error: 'Credenciales incorrectas' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    sessions.add(token);
    return { token };
  });

  app.post('/api/auth/logout', { preHandler: requireAuth }, async (req) => {
    sessions.delete(req.token);
    return { ok: true };
  });

  app.get('/api/auth/check', { preHandler: requireAuth }, async () => {
    return { ok: true };
  });
}
