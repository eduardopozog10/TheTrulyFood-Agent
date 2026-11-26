import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/api.js';
import { loadConfig } from '../src/config.js';
import { assertStoreUrl, isPublicAddress, plainText, redact } from '../src/security.js';
import { setup, origin } from './helpers.js';
test('allowlist impide SSRF, credenciales, rutas administrativas, redirecciones y URLs arbitrarias', () => {
  for (const value of ['http://gautieroficial.cl/cart.js', 'https://evil.test/products.json', '//127.0.0.1/cart.js', 'https://gautieroficial.cl.evil.test/cart.js', 'https://user:password@gautieroficial.cl/cart.js', '/admin', '/checkout', '/products/../../admin', '/cart.js?url=https://evil.test', '/cart.js#secret']) assert.throws(() => assertStoreUrl(value, origin));
  assert.equal(assertStoreUrl('/products/producto-fixture.js', origin).hostname, 'gautieroficial.cl');
  assert.equal(assertStoreUrl('/cart/910000001:1?storefront=true', origin).origin, origin);
});
test('red privada, metadata, loopback, IPv6 y direcciones especiales nunca son destinos de conexión', () => {
  for (const ip of ['0.0.0.0', '10.0.0.1', '127.0.0.1', '169.254.169.254', '172.16.0.1', '192.168.1.1', '100.64.0.1', '224.0.0.1', '::1', '::ffff:127.0.0.1', '2002:7f00:1::', 'fc00::1']) assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress('1.1.1.1'), true);
});
test('HTML externo nunca se ejecuta y los secretos se redactan', () => {
  assert.equal(plainText('<script>steal()</script><p>Texto</p>'), 'Texto');
  assert.ok(!redact('API_KEY=very-secret-value').includes('very-secret'));
  assert.ok(!redact('Bearer super-secret-token').includes('super-secret'));
});
test('proveedor real requiere clave, modelo y consentimiento explícito; secreto nunca aparece en error de configuración', () => {
  for (const env of [{ LLM_PROVIDER: 'openai' }, { LLM_PROVIDER: 'openai', OPENAI_API_KEY: 'secret', OPENAI_MODEL: 'test' }, { SHOPIFY_STORE: 'https://evil.test' }]) assert.throws(() => loadConfig(env));
  assert.equal(loadConfig({}).LLM_PROVIDER, 'simulated');
  assert.equal(loadConfig({ LLM_PROVIDER: 'openai', OPENAI_ALLOW_PAID: 'true', OPENAI_API_KEY: 'test', OPENAI_MODEL: 'test' }).OPENAI_ALLOW_PAID, true);
  assert.throws(() => loadConfig({ PORT: 'secret-value' }), error => !String(error).includes('secret-value'));
});
test('API local: chat, métricas, reinicio y respuestas con encabezados seguros', async () => {
  const { engine } = setup(); const app = createApp(loadConfig({}), engine); const headers = { host: '127.0.0.1:3000' };
  try {
    const health = await app.inject({ url: '/api/health', headers }); assert.equal(health.statusCode, 200); assert.equal(health.json().status, 'ok');
    assert.match(String(health.headers['content-security-policy']), /default-src 'self'/);
    const start = await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { source: 'demo' } }); assert.equal(start.statusCode, 200);
    const id = start.json().id;
    const reply = await app.inject({ method: 'POST', url: `/api/conversations/${id}/messages`, headers, payload: { message: 'Ver catálogo' } });
    assert.equal(reply.statusCode, 200); assert.equal(reply.json().response.products.length, 3); assert.equal(reply.json().session.usage.estimatedUsd, 0);
    const reset = await app.inject({ method: 'POST', url: `/api/conversations/${id}/reset`, headers, payload: { source: 'demo' } }); assert.notEqual(reset.json().id, id);
    const stale = await app.inject({ method: 'POST', url: `/api/conversations/${id}/messages`, headers, payload: { message: 'hola' } }); assert.equal(stale.statusCode, 404);
  } finally { await app.close(); }
});
test('API rechaza host DNS rebinding, origen cruzado, entradas enormes, extra campos y formularios', async () => {
  const app = createApp(loadConfig({}), setup().engine); const headers = { host: 'localhost:3000' };
  try {
    assert.equal((await app.inject({ url: '/api/health', headers: { host: 'evil.test:3000' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/conversations', headers: { ...headers, origin: 'https://evil.test' }, payload: { source: 'demo' } })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { source: 'demo', url: 'https://evil.test' } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: '/api/conversations', headers: { ...headers, 'content-type': 'text/plain' }, payload: 'source=demo' })).statusCode, 415);
    const id = (await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { source: 'demo' } })).json().id;
    for (const message of ['', 'x'.repeat(2001)]) assert.equal((await app.inject({ method: 'POST', url: `/api/conversations/${id}/messages`, headers, payload: { message } })).statusCode, 400);
    assert.equal((await app.inject({ method: 'POST', url: `/api/conversations/${id}/messages`, headers, payload: { message: 'x'.repeat(10000) } })).statusCode, 413);
  } finally { await app.close(); }
});
test('API limita llamadas por minuto y no expone configuración secreta ni archivos locales', async () => {
  const config = loadConfig({ OPENAI_API_KEY: 'sk-private-must-not-leak' }); const app = createApp(config, setup().engine); const headers = { host: 'localhost:3000' };
  try {
    assert.ok(!(await app.inject({ url: '/api/config', headers })).body.includes(config.OPENAI_API_KEY));
    for (const url of ['/.env', '/data/test.jsonl', '/src/config.ts', '/package.json']) assert.equal((await app.inject({ url, headers })).statusCode, 404);
    let last;
    for (let i = 0; i < 31; i++) last = await app.inject({ method: 'POST', url: '/api/conversations', headers, payload: { source: 'demo' } });
    assert.equal(last?.statusCode, 429); assert.equal(last?.headers['retry-after'], '60');
  } finally { await app.close(); }
});
