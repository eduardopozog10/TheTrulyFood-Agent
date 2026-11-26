import Fastify from 'fastify';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { z } from 'zod';
import { AppError, safeError } from './domain.js';
import { STORES, type Config } from './config.js';
import type { ConversationEngine } from './agent/engine.js';
const newSchema = z.object({ source: z.enum(['live', 'demo']) }).strict();
const messageSchema = z.object({ message: z.string().trim().min(1).max(2000) }).strict();
const idSchema = z.object({ id: z.uuid() });
export function createApp(config: Config, engine: ConversationEngine) {
  const app = Fastify({ logger: false, bodyLimit: 8192, requestTimeout: 10000, connectionTimeout: 180000 });
  const rate = new Map<string, { start: number; count: number }>();
  app.addHook('onRequest', async (req, reply) => {
    reply.headers({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://cdn.shopify.com https://gautieroficial.cl; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'",
    });
    const allowedHosts = [`127.0.0.1:${config.PORT}`, `localhost:${config.PORT}`, `[::1]:${config.PORT}`];
    if (!allowedHosts.includes(req.headers.host ?? '')) throw new AppError('HOST_BLOCKED', 'Host local no autorizado.', 403);
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origins = allowedHosts.map(h => `http://${h}`);
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && !origins.includes(req.headers.origin))) throw new AppError('ORIGIN_BLOCKED', 'Origen de solicitud no autorizado.', 403);
      if (!String(req.headers['content-type']).startsWith('application/json')) throw new AppError('CONTENT_TYPE', 'Se requiere JSON.', 415);
    }
    if (req.url.startsWith('/api/') && req.method !== 'GET') {
      const now = Date.now();
      for (const [key, value] of rate) if (now - value.start >= 60_000) rate.delete(key);
      const current = rate.get(req.ip) ?? { start: now, count: 0 };
      if (++current.count > 30) { reply.header('Retry-After', '60'); throw new AppError('RATE_LIMIT', 'Demasiadas solicitudes. Espera un minuto.', 429); }
      rate.set(req.ip, current);
    }
  });
  app.setErrorHandler((error, _req, reply) => {
    const known = safeError(error);
    const httpStatus = error instanceof AppError ? error.statusCode : (error as { statusCode?: number }).statusCode;
    reply.code(httpStatus && httpStatus >= 400 && httpStatus < 500 ? httpStatus : error instanceof AppError ? error.statusCode : 500).send({ error: known });
  });
  app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Ruta no disponible.' } }));
  app.get('/api/health', async () => ({ status: 'ok', phase: 1 }));
  app.get('/api/config', async () => ({
    store: STORES[config.SHOPIFY_STORE], provider: config.LLM_PROVIDER, defaultSource: config.SHOPIFY_MODE,
    simulated: config.LLM_PROVIDER === 'simulated', maxToolCalls: config.MAX_TOOL_CALLS,
    notice: 'Prototipo local. Gautier es una tienda de prueba independiente de The Truly Food.',
  }));
  app.post('/api/conversations', async req => {
    const parsed = newSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError('INPUT_INVALID', 'Selecciona un catálogo válido.');
    return engine.snapshot(await engine.create(parsed.data.source));
  });
  app.post('/api/conversations/:id/reset', async req => {
    const params = idSchema.safeParse(req.params);
    const body = newSchema.safeParse(req.body);
    if (!params.success || !body.success) throw new AppError('INPUT_INVALID', 'Solicitud de reinicio inválida.');
    return engine.snapshot(await engine.reset(params.data.id, body.data.source));
  });
  app.post('/api/conversations/:id/messages', async req => {
    const params = idSchema.safeParse(req.params);
    const body = messageSchema.safeParse(req.body);
    if (!params.success || !body.success) throw new AppError('INPUT_INVALID', 'Escribe un mensaje de entre 1 y 2000 caracteres.');
    return engine.send(params.data.id, body.data.message);
  });
  for (const [url, filename, type] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/app.js', 'app.js', 'text/javascript; charset=utf-8'], ['/styles.css', 'styles.css', 'text/css; charset=utf-8']] as const) {
    app.get(url, async (_req, reply) => reply.type(type).send(await readFile(resolve('dist/web', filename))));
  }
  return app;
}
