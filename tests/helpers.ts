import type { HttpReply, StoreHttp } from '../src/shopify/http.js';
import type { Journal } from '../src/storage/journal.js';
import { ShopifyCatalog } from '../src/shopify/catalog.js';
import { DemoCatalog } from '../src/shopify/demo.js';
import { SimulatedProvider } from '../src/llm/simulated.js';
import { ConversationEngine } from '../src/agent/engine.js';
import type { LLMProvider } from '../src/llm/provider.js';
export const origin = 'https://gautieroficial.cl';
export const rawProduct = {
  handle: 'producto-fixture', title: 'Producto fixture', body_html: '<p>Algodón para pruebas</p>', product_type: 'Accesorios', images: [{ src: '//cdn.shopify.com/fixture.jpg' }],
  variants: [
    { id: 910000001, title: 'Arena', price: '12345.00', available: true },
    { id: 910000002, title: 'Negro', price: '12500.50', available: false },
    { id: 910000003, title: 'Verde', price: '14000.00' },
  ],
};
export const ajaxProduct = { ...rawProduct, description: rawProduct.body_html, images: ['//cdn.shopify.com/fixture.jpg'], variants: rawProduct.variants.map(v => ({ ...v, price: Math.round(Number(v.price) * 100) })) };
export function json(body: unknown, status = 200): HttpReply { return { status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }; }
export class MockHttp implements StoreHttp {
  calls: { path: string; cookie: string | undefined }[] = [];
  constructor(private responder: (path: string, cookie?: string) => HttpReply | Promise<HttpReply> = path => path === '/cart.js' ? json({ currency: 'CLP' }) : path.includes('products.json') ? json({ products: [rawProduct] }) : json(ajaxProduct)) {}
  async get(path: string, cookie?: string) { this.calls.push({ path, cookie }); return this.responder(path, cookie); }
}
export class MemoryJournal implements Journal {
  events: { conversationId: string; event: Record<string, unknown> }[] = [];
  async append(conversationId: string, event: Record<string, unknown>) { this.events.push({ conversationId, event }); }
}
export function setup(provider: LLMProvider = new SimulatedProvider(), http = new MockHttp(), max = 4) {
  const journal = new MemoryJournal();
  const live = new ShopifyCatalog(http, origin);
  const engine = new ConversationEngine(provider, { demo: new DemoCatalog(), live }, journal, max);
  return { engine, journal, http, live };
}
