import test from 'node:test';
import assert from 'node:assert/strict';
import { ShopifyCatalog, decimalToMinor, normalizeProduct } from '../src/shopify/catalog.js';
import { jsonReply } from '../src/shopify/http.js';
import { ToolRunner } from '../src/agent/tools.js';
import { rawProduct, ajaxProduct, MockHttp, origin, json } from './helpers.js';
test('consulta catálogo, busca nombre/descripción/categoría y cachea sin repetir llamadas', async () => {
  const http = new MockHttp(); const catalog = new ShopifyCatalog(http, origin);
  assert.equal((await catalog.search('producto')).products.length, 1);
  assert.equal((await catalog.search('algodón')).products.length, 1);
  assert.equal((await catalog.search('accesorios')).products.length, 1);
  assert.equal(http.calls.length, 2);
  assert.equal(catalog.status().state, 'connected');
});
test('producto inexistente entrega lista vacía sin inventar una recomendación', async () => {
  assert.deepEqual((await new ShopifyCatalog(new MockHttp(), origin).search('inexistente')).products, []);
});
test('distingue disponible, agotado y stock desconocido por variante', () => {
  const product = normalizeProduct(rawProduct, 'CLP', origin, false);
  assert.deepEqual(product.variants.map(v => v.availability), ['available', 'sold_out', 'unknown']);
});
test('precio decimal exacto y unidad Ajax coinciden; moneda faltante no confirma precio', () => {
  const product = normalizeProduct(rawProduct, 'CLP', origin, false);
  const ajax = normalizeProduct(ajaxProduct, 'CLP', origin, true);
  assert.deepEqual(product.variants, ajax.variants);
  assert.equal(product.variants[0]?.priceMinor, 1234500);
  assert.equal(product.variants[1]?.priceMinor, 1250050);
  assert.equal(normalizeProduct(rawProduct, null, origin, false).variants[0]?.priceMinor, null);
});
test('rechaza precios negativos, ambiguos, infinitos y con precisión excesiva', () => {
  for (const value of [-1, Infinity, NaN, '49.990 CLP', '-4', '1.001', '1e6', '9999999999999999']) assert.equal(decimalToMinor(value), null);
  assert.equal(decimalToMinor('0.01'), 1);
  assert.equal(decimalToMinor('0'), 0);
});
test('valida identificadores seguros y variantes, y refresca el detalle', async () => {
  const http = new MockHttp(); const catalog = new ShopifyCatalog(http, origin);
  await catalog.detail('producto-fixture'); await catalog.detail('producto-fixture');
  assert.equal(http.calls.length, 4);
  assert.throws(() => normalizeProduct({ ...rawProduct, variants: [{ id: Number.MAX_SAFE_INTEGER + 1, title: 'X', price: '1' }] }, 'CLP', origin, false));
  assert.throws(() => normalizeProduct({ ...rawProduct, variants: [{ id: '0', title: 'X', price: '1' }] }, 'CLP', origin, false));
  await assert.rejects(catalog.cart('producto-fixture', '910000099', 1), /variante/);
});
test('no acepta que Shopify devuelva un producto distinto del solicitado', async () => {
  await assert.rejects(new ShopifyCatalog(new MockHttp(), origin).detail('otro-handle'), /no coincide/);
});
test('404, 403, HTML, JSON inválido y fallas de red se manejan con errores seguros', async () => {
  for (const reply of [json({}, 404), json({}, 403), { status: 200, headers: { 'content-type': 'text/html' }, body: 'challenge' }, { status: 200, headers: { 'content-type': 'application/json' }, body: '{' }]) assert.throws(() => jsonReply(reply));
  const http = new MockHttp(() => json({}, 403)); const catalog = new ShopifyCatalog(http, origin);
  await assert.rejects(catalog.search(''), /restringe/);
  await assert.rejects(catalog.search(''), /restringió/);
  assert.equal(http.calls.length, 1); assert.equal(catalog.status().state, 'blocked');
  const runner = new ToolRunner(new ShopifyCatalog(new MockHttp(() => { throw new Error('secret should not escape'); }), origin), 4);
  const result = await runner.execute({ name: 'buscar_productos', args: { query: '' } });
  assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('secret should'));
});
test('Ajax acepta JSON con MIME JavaScript de Shopify, pero rechaza código ejecutable y JSONP', () => {
  assert.deepEqual(jsonReply({ status: 200, headers: { 'content-type': 'text/javascript; charset=utf-8' }, body: '{"currency":"CLP"}' }), { currency: 'CLP' });
  for (const body of ['alert(1)', 'callback({"currency":"CLP"})']) assert.throws(() => jsonReply({ status: 200, headers: { 'content-type': 'text/javascript' }, body }));
});
test('argumentos de herramientas rechazan URLs, campos extra, ID inválido y cantidades incorrectas', async () => {
  const http = new MockHttp(); const runner = new ToolRunner(new ShopifyCatalog(http, origin), 6);
  for (const args of [
    { handle: 'https://localhost/secrets', variantId: '910000001', quantity: 1 },
    { handle: 'producto-fixture', variantId: '1;ls', quantity: 1 },
    { handle: 'producto-fixture', variantId: '910000001', quantity: 0 },
    { handle: 'producto-fixture', variantId: '910000001', quantity: 11 },
    { handle: 'producto-fixture', variantId: '910000001', quantity: 1, origin: 'https://evil.test' },
  ]) assert.equal((await runner.execute({ name: 'crear_carrito', args })).error?.code, 'TOOL_ARGUMENTS');
  assert.equal(http.calls.length, 0);
});
test('carrito solo se verifica con sesión aislada, variante, cantidad, precio y moneda concordantes', async () => {
  const http = new MockHttp((path, cookie) => {
    if (path.includes('/products/')) return json(ajaxProduct);
    if (path.startsWith('/cart/')) return { status: 302, headers: { location: '/cart', 'set-cookie': ['cart=test-session; HttpOnly; Secure'] }, body: '' };
    if (path === `${origin}/cart`) return { status: 200, headers: { 'content-type': 'text/html' }, body: 'cart' };
    if (path === '/cart.js' && cookie) return json({ currency: 'CLP', items: [{ variant_id: 910000001, quantity: 2, price: 1234500 }] });
    return json({ currency: 'CLP' });
  });
  const result = await new ShopifyCatalog(http, origin).cart('producto-fixture', '910000001', 2);
  assert.equal(result.cart.status, 'verified');
  assert.equal(result.cart.url, `${origin}/cart/910000001:2?storefront=true`);
  assert.equal(http.calls[0]?.cookie, undefined);
  assert.ok(http.calls.at(-1)?.cookie?.includes('cart=test-session'));
});
test('HTTP 200 aislado, redirecciones a checkout/otro dominio o carrito incorrecto no validan un enlace', async () => {
  for (const location of ['/checkout', 'https://evil.test/cart', '/cart']) {
    const http = new MockHttp(path => path.includes('products/') ? json(ajaxProduct) : path.startsWith('/cart/') ? { status: 302, headers: { location }, body: '' } : path === `${origin}/cart` ? { status: 200, headers: {}, body: '' } : json({ currency: 'CLP' }));
    const result = await new ShopifyCatalog(http, origin).cart('producto-fixture', '910000001', 1);
    assert.equal(result.cart.url, null); assert.equal(result.cart.status, 'unverified'); assert.equal(result.cart.productUrl, `${origin}/products/producto-fixture`);
    assert.ok(!http.calls.some(c => c.path.includes('checkout') || c.path.includes('evil.test')));
  }
});
test('invalida carritos con cookies cuando difiere variante, cantidad, precio o moneda', async () => {
  const expected = { variant_id: 910000001, quantity: 1, price: 1234500 };
  for (const mutation of [{ variant_id: 910000002 }, { quantity: 2 }, { price: 1 }, { currency: 'USD' }]) {
    const http = new MockHttp((path, cookie) => {
      if (path.includes('/products/')) return json(ajaxProduct);
      if (path.startsWith('/cart/')) return { status: 302, headers: { location: '/cart', 'set-cookie': ['cart=fixture; Secure'] }, body: '' };
      if (path === `${origin}/cart`) return { status: 200, headers: {}, body: 'cart' };
      if (path === '/cart.js' && cookie) return json({ currency: 'currency' in mutation ? mutation.currency : 'CLP', items: [{ ...expected, ...mutation }] });
      return json({ currency: 'CLP' });
    });
    const { cart } = await new ShopifyCatalog(http, origin).cart('producto-fixture', '910000001', 1);
    assert.equal(cart.status, 'unverified'); assert.equal(cart.url, null);
  }
});
test('no intenta carrito para agotado o stock desconocido', async () => {
  const http = new MockHttp(); const catalog = new ShopifyCatalog(http, origin);
  for (const id of ['910000002', '910000003']) assert.equal((await catalog.cart('producto-fixture', id, 1)).cart.status, 'unavailable');
  assert.ok(!http.calls.some(c => c.path.startsWith('/cart/')));
});
test('consultar_disponibilidad verifica pertenencia de la variante', async () => {
  const runner = new ToolRunner(new ShopifyCatalog(new MockHttp(), origin), 4);
  assert.equal((await runner.execute({ name: 'consultar_disponibilidad', args: { handle: 'producto-fixture', variantId: '910000099' } })).error?.code, 'VARIANT_NOT_FOUND');
});
