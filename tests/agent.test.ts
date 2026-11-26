import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir, writeFile, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setup } from './helpers.js';
import { validateAnswer, formatPrice } from '../src/commercial/validate.js';
import { FileJournal } from '../src/storage/journal.js';
import { estimateCost } from '../src/llm/pricing.js';
import { AppError } from '../src/domain.js';
import type { LLMProvider } from '../src/llm/provider.js';
test('flujo completo gratuito: buscar, recordar selección, detalles, stock y carrito ficticio', async () => {
  const { engine, journal } = setup(); const session = await engine.create('demo');
  const catalog = await engine.send(session.id, 'Ver catálogo');
  assert.equal(catalog.response.products.length, 3);
  const detail = await engine.send(session.id, 'Detalle de la primera');
  assert.equal(detail.tools[0]?.name, 'detalle_producto'); assert.equal(detail.response.products[0]?.handle, 'gorra-demo');
  const stock = await engine.send(session.id, '¿Está disponible?');
  assert.equal(stock.tools[0]?.name, 'consultar_disponibilidad');
  const cart = await engine.send(session.id, 'Quiero carrito de gorra-demo, variante 900000000000001, cantidad 1');
  assert.equal(cart.response.cart?.status, 'unverified'); assert.equal(cart.response.cart?.url, null);
  assert.equal(cart.session.usage.estimatedUsd, 0); assert.equal(cart.session.usage.inputTokens, 0);
  assert.equal(cart.session.messageCount, 8); assert.equal(cart.session.toolCount, 4);
  assert.ok(journal.events.some(e => e.event.type === 'usage'));
});
test('búsqueda inexistente y stock desconocido mantienen incertidumbre', async () => {
  const { engine } = setup(); const s = await engine.create('demo');
  assert.match((await engine.send(s.id, 'Busco unicornio')).response.text, /No encontré/);
  const p = await engine.send(s.id, 'Busco bufanda');
  assert.equal(p.response.products[0]?.variants[0]?.availability, 'unknown');
});
test('despacho, suscripciones, promociones y humanos no generan promesas', async () => {
  const { engine } = setup(); const s = await engine.create('demo');
  for (const [message, expected] of [['despacho mañana', /no puedo confirmar/], ['suscripción mensual', /no están integradas/], ['dame un descuento', /No tengo promociones/], ['quiero un humano', /todavía no está conectado/], ['pago confirmado', /No puedo confirmar pagos/]]) {
    const result = await engine.send(s.id, String(message)); assert.match(result.response.text, expected as RegExp); assert.equal(result.tools.length, 0);
  }
});
test('validación bloquea precios, promociones y texto arbitrario inventados por un proveedor', () => {
  for (const candidate of [
    { intent: 'results', handles: [], price: 1 },
    { intent: 'greeting', handles: [], text: 'Te hago 50% de descuento' },
    { intent: 'promotions', handles: [], promotion: '2x1' },
    { intent: 'results', handles: ['fabricado'] },
    { intent: 'not_found', handles: [] },
  ]) assert.throws(() => validateAnswer(candidate, [], []), AppError);
});
test('fallas de IA se registran sin exponer mensajes del proveedor o credenciales', async () => {
  const provider: LLMProvider = { name: 'openai', model: 'configured-test-model', next: async () => { throw new Error('sk-private-value-do-not-print'); } };
  const { engine, journal } = setup(provider); const s = await engine.create('demo');
  const result = await engine.send(s.id, 'hola');
  assert.equal(result.error?.code, 'INTERNAL_ERROR'); assert.equal(result.session.usage.estimatedUsd, null);
  assert.ok(!JSON.stringify({ result, events: journal.events }).includes('sk-private'));
  assert.ok(journal.events.some(e => e.event.reason === 'failed_provider_attempt'));
});
test('límite de llamadas detiene un proveedor que pide herramientas indefinidamente', async () => {
  let calls = 0;
  const provider: LLMProvider = { name: 'simulated', model: 'loop-test', next: async () => { calls++; return { decision: { type: 'tool', call: { name: 'buscar_productos', args: { query: '' } } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } }; } };
  const { engine } = setup(provider, undefined, 2); const s = await engine.create('demo');
  const result = await engine.send(s.id, 'catálogo');
  assert.equal(result.tools.length, 2); assert.equal(calls, 3); assert.equal(result.error?.code, 'TOOL_LIMIT');
});
test('presupuesto de tiempo impide iniciar más herramientas después de un minuto', async t => {
  let now = Date.now(); t.mock.method(Date, 'now', () => now);
  const provider: LLMProvider = { name: 'simulated', model: 'test', next: async () => { now += 60001; return { decision: { type: 'tool', call: { name: 'buscar_productos', args: { query: '' } } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } }; } };
  const { engine } = setup(provider); const s = await engine.create('demo');
  const result = await engine.send(s.id, 'catálogo'); assert.equal(result.error?.code, 'TURN_TIMEOUT'); assert.equal(result.tools.length, 0);
});
test('el backend impide crear carrito por iniciativa del modelo', async () => {
  const provider: LLMProvider = { name: 'simulated', model: 'test', next: async () => ({ decision: { type: 'tool', call: { name: 'crear_carrito', args: { handle: 'gorra-demo', variantId: '900000000000001', quantity: 1 } } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } }) };
  const { engine } = setup(provider); const s = await engine.create('demo');
  assert.equal((await engine.send(s.id, 'hola')).error?.code, 'CART_CONSENT');
  assert.equal((await engine.send(s.id, 'no quiero comprar')).error?.code, 'CART_CONSENT');
});
test('modelo no puede elegir por su cuenta una variante ni crear carritos sin consultar producto', async () => {
  let first = true;
  const provider: LLMProvider = { name: 'simulated', model: 'test', next: async () => {
    if (first) { first = false; return { decision: { type: 'tool', call: { name: 'buscar_productos', args: { query: 'gorra' } } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } }; }
    return { decision: { type: 'tool', call: { name: 'crear_carrito', args: { handle: 'gorra-demo', variantId: '900000000000001', quantity: 1 } } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } };
  } };
  const { engine } = setup(provider); const s = await engine.create('demo');
  assert.equal((await engine.send(s.id, 'quiero comprar')).error?.code, 'CART_SELECTION');
  assert.equal((await engine.send(s.id, 'quiero comprar variante 900000000000001')).error?.code, 'CART_SELECTION');
});
test('consumo real se acumula con tarifa configurada y el simulador sigue en cero', async () => {
  const provider: LLMProvider = { name: 'openai', model: 'configured-test-model', next: async () => ({ decision: { type: 'answer', answer: { intent: 'greeting', handles: [] } }, usage: { inputTokens: 12, outputTokens: 8, estimatedUsd: .01 } }) };
  const { engine } = setup(provider); const s = await engine.create('demo');
  await engine.send(s.id, 'hola'); const result = await engine.send(s.id, 'hola');
  assert.deepEqual(result.session.usage, { inputTokens: 24, outputTokens: 16, estimatedUsd: .02 });
});
test('reiniciar genera otro ID, borra contexto activo y conserva la bitácora local', async () => {
  const { engine, journal } = setup(); const s = await engine.create('demo'); await engine.send(s.id, 'catálogo');
  const next = await engine.reset(s.id, 'live');
  assert.notEqual(next.id, s.id); assert.equal(next.messages.length, 0); assert.equal(next.products.length, 0); assert.equal(next.tools, 0);
  assert.throws(() => engine.get(s.id)); assert.ok(journal.events.some(e => e.event.type === 'conversation_closed'));
});
test('dos mensajes simultáneos no mezclan contexto de una conversación', async () => {
  let release!: () => void; const wait = new Promise<void>(resolve => { release = resolve; });
  const provider: LLMProvider = { name: 'simulated', model: 'test', next: async () => { await wait; return { decision: { type: 'answer', answer: { intent: 'greeting', handles: [] } }, usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 } }; } };
  const { engine } = setup(provider); const s = await engine.create('demo');
  const first = engine.send(s.id, 'hola'); await assert.rejects(engine.send(s.id, 'otro'), /Espera/); release(); await first;
});
test('costos desconocidos sin tarifas; precios verificados caducan; nunca se supone una tarifa', () => {
  assert.equal(estimateCost('test', 100, 200, {}), null);
  const now = Date.parse('2026-11-26T12:00:00Z');
  const rate = { test: { inputPerMillionUsd: 2, outputPerMillionUsd: 8, verifiedAt: new Date(now).toISOString(), sourceUrl: 'https://openai.com/api/pricing/' } };
  assert.equal(estimateCost('test', 1000, 500, rate, now), .006);
  assert.equal(estimateCost('test', 1000, 500, rate, now + 31 * 86400_000), null);
  assert.equal(estimateCost('test', null, 500, rate, now), null);
  assert.equal(formatPrice(null, 'CLP'), 'Precio no verificado');
  assert.match(formatPrice(1234500, 'CLP'), /12\.345/);
  assert.match(formatPrice(1250050, 'CLP'), /12\.500,50/);
});
test('bitácora JSONL guarda metadatos, consumo y errores con redacción; aplica retención solo a sus archivos', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'truly-journal-')); const id = randomUUID();
  try {
    const journal = new FileJournal(directory, 7); await journal.init();
    await journal.append(id, { type: 'message', message: 'correo test@example.com clave sk-test-secret-123456 teléfono +56 9 1234 5678', usage: { inputTokens: 10, outputTokens: 20, estimatedUsd: null } });
    const content = await readFile(join(directory, `${id}.jsonl`), 'utf8'); const parsed = JSON.parse(content);
    assert.equal(parsed.conversationId, id); assert.equal(parsed.usage.inputTokens, 10);
    assert.ok(!content.includes('test@example.com')); assert.ok(!content.includes('sk-test-secret')); assert.ok(!content.includes('1234 5678'));
    await assert.rejects(journal.append('../secret', {}));
    const old = randomUUID(); await journal.append(old, { type: 'test' }); await writeFile(join(directory, 'other.txt'), 'keep');
    await utimes(join(directory, `${old}.jsonl`), new Date(0), new Date(0)); await journal.prune();
    assert.ok(!(await readdir(directory)).includes(`${old}.jsonl`)); assert.ok((await readdir(directory)).includes('other.txt'));
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('error de almacenamiento se comunica sin filtrar rutas ni errores internos', async () => {
  const { engine, journal } = setup(); const s = await engine.create('demo');
  journal.append = async () => { throw new Error('C:/private-path/token'); };
  const result = await engine.send(s.id, 'hola'); assert.equal(result.error?.code, 'STORAGE_ERROR'); assert.ok(!JSON.stringify(result).includes('private-path'));
});
