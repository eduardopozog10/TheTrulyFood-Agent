import test from 'node:test';
import assert from 'node:assert/strict';
import { OpenAIProvider } from '../src/llm/openai.js';
import type { ProviderInput } from '../src/llm/provider.js';
const input: ProviderInput = { history: [{ role: 'user', text: 'Busca gorra', at: new Date().toISOString() }], context: [], results: [], remainingTools: 4 };
const usage = { input_tokens: 100, output_tokens: 40 };
test('OpenAI opcional utiliza endpoint oficial, herramientas estrictas y store=false sin ninguna llamada real', async () => {
  let calls = 0;
  const mockedFetch: typeof fetch = async (url, init) => {
    calls++; assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(String(init?.body)); assert.equal(body.store, false); assert.equal(body.tools.length, 4); assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.model, 'configured-test-model'); assert.equal(body.tools[0].strict, true);
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'function_call', name: 'buscar_productos', arguments: '{"query":"gorra"}' }], usage }), { headers: { 'content-type': 'application/json' } });
  };
  const result = await new OpenAIProvider('configured-test-model', 'test-key', {}, mockedFetch).next(input);
  assert.equal(calls, 1); assert.equal(result.decision.type, 'tool'); assert.equal(result.usage.inputTokens, 100); assert.equal(result.usage.estimatedUsd, null);
});
test('respuesta estructurada funciona y precios/promociones inventados se bloquean', async () => {
  for (const extra of [false, true]) {
    const mock: typeof fetch = async () => new Response(JSON.stringify({ status: 'completed', usage, output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ intent: 'greeting', handles: [], ...(extra ? { price: 99, promotion: '2x1' } : {}) }) }] }] }));
    const provider = new OpenAIProvider('configured-test-model', 'test-key', {}, mock);
    if (extra) await assert.rejects(provider.next(input), /contrato comercial/);
    else assert.equal((await provider.next(input)).decision.type, 'answer');
  }
});
test('errores HTTP, argumentos inválidos, respuestas incompletas y salida excesiva son seguros', async () => {
  const mocks: (typeof fetch)[] = [
    async () => new Response('sk-should-not-escape', { status: 401 }),
    async () => { throw new Error('sk-should-not-escape'); },
    async () => new Response('{'),
    async () => new Response(JSON.stringify({ status: 'incomplete', output: [], usage })),
    async () => new Response(JSON.stringify({ output: [{ type: 'function_call', name: 'run_shell', arguments: '{}' }], usage })),
    async () => new Response('x'.repeat(128001)),
  ];
  for (const mock of mocks) await assert.rejects(new OpenAIProvider('configured-test-model', 'test-key', {}, mock).next(input), error => !String(error).includes('sk-should-not-escape'));
});
test('contextos excesivos se bloquean antes de llamar a la API', async () => {
  let calls = 0;
  const mock: typeof fetch = async () => { calls++; return new Response('{}'); };
  await assert.rejects(new OpenAIProvider('configured-test-model', 'test-key', {}, mock).next({ ...input, history: [{ role: 'user', text: 'a'.repeat(65000), at: '' }] }), /excede/);
  assert.equal(calls, 0);
});
