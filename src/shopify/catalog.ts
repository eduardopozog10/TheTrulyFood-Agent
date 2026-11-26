import { z } from 'zod';
import { AppError, type Catalog, type Product, type Variant, type CartResult } from '../domain.js';
import { plainText, assertStoreUrl } from '../security.js';
import { jsonReply, type StoreHttp } from './http.js';

export const handleSchema = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/);
export const idSchema = z.string().regex(/^[1-9][0-9]{0,19}$/);
const shopId = z.union([z.string(), z.number().int().positive().refine(Number.isSafeInteger)]).transform(String).pipe(idSchema);
const rawVariant = z.object({ id: shopId, title: z.string().max(500), price: z.unknown(), available: z.boolean().optional() });
const rawProduct = z.object({
  handle: handleSchema, title: z.string().min(1).max(500),
  body_html: z.string().max(100000).optional(), description: z.string().max(100000).optional(),
  product_type: z.string().max(500).optional(), type: z.string().max(500).optional(),
  images: z.array(z.union([z.string(), z.object({ src: z.string() })])).max(250).optional(),
  variants: z.array(rawVariant).min(1).max(250),
});
export function decimalToMinor(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [whole = '', fraction = ''] = value.split('.');
  const result = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(result) ? result : null;
}
function imageUrl(raw: unknown, origin: string): string | null {
  if (typeof raw !== 'string') return null;
  try {
    const url = new URL(raw, origin);
    return url.protocol === 'https:' && !url.username && !url.password && [new URL(origin).hostname, 'cdn.shopify.com'].includes(url.hostname) ? url.href : null;
  } catch { return null; }
}
export function normalizeProduct(raw: unknown, currency: string | null, origin: string, ajax: boolean): Product {
  const parsed = rawProduct.safeParse(raw);
  if (!parsed.success) throw new AppError('SHOPIFY_FORMAT', 'Los datos del producto son inválidos.', 502);
  const p = parsed.data;
  const variants: Variant[] = p.variants.map(v => ({
    id: v.id, title: plainText(v.title, 120), currency,
    priceMinor: !currency ? null : ajax ? (typeof v.price === 'number' && Number.isSafeInteger(v.price) && v.price >= 0 && v.price <= 1e12 ? v.price : null) : decimalToMinor(v.price),
    availability: v.available === true ? 'available' : v.available === false ? 'sold_out' : 'unknown',
  }));
  const firstImage = p.images?.[0];
  return {
    handle: p.handle, title: plainText(p.title, 160), description: plainText(p.description ?? p.body_html, 1200),
    category: plainText(p.product_type ?? p.type, 120), variants,
    image: imageUrl(typeof firstImage === 'object' ? firstImage.src : firstImage, origin),
    url: new URL(`/products/${p.handle}`, origin).href, source: 'live', checkedAt: new Date().toISOString(),
  };
}
const folded = (s: string) => s.toLocaleLowerCase('es-CL').normalize('NFD').replace(/\p{Diacritic}/gu, '');
export function searchProducts(products: Product[], query: string): Product[] {
  const words = folded(query).split(/\s+/).filter(Boolean);
  return products.filter(p => words.every(w => folded(`${p.title} ${p.description} ${p.category}`).includes(w))).slice(0, 6);
}
export class ShopifyCatalog implements Catalog {
  readonly source = 'live' as const;
  private connection: ReturnType<Catalog['status']> = { state: 'idle', checkedAt: null };
  private cached: { products: Product[]; expires: number; partial: boolean } | undefined;
  private pending: Promise<{ products: Product[]; partial: boolean }> | undefined;
  private blockedUntil = 0;
  constructor(private http: StoreHttp, private origin: string) {}
  status() { return this.connection; }
  private async operation<T>(fn: () => Promise<T>): Promise<T> {
    if (Date.now() < this.blockedUntil) throw new AppError('SHOPIFY_BLOCKED', 'La tienda restringió el acceso. Espera un minuto o usa la demostración.', 502);
    try {
      const value = await fn();
      this.connection = { state: 'connected', checkedAt: new Date().toISOString() };
      return value;
    } catch (error) {
      const blocked = error instanceof AppError && error.code === 'SHOPIFY_BLOCKED';
      if (blocked) this.blockedUntil = Date.now() + 60_000;
      this.connection = { state: blocked ? 'blocked' : 'error', checkedAt: new Date().toISOString() };
      throw error;
    }
  }
  private async currency(): Promise<string | null> {
    const result = z.object({ currency: z.string().regex(/^[A-Z]{3}$/) }).safeParse(jsonReply(await this.http.get('/cart.js')));
    return result.success ? result.data.currency : null;
  }
  async search(query: string): Promise<{ products: Product[]; partial: boolean }> {
    if (this.cached && Date.now() < this.cached.expires) return { products: searchProducts(this.cached.products, query), partial: this.cached.partial };
    this.pending ??= this.operation(async () => {
      const currency = await this.currency();
      const all: Product[] = [];
      let partial = false;
      for (let page = 1; page <= 2; page++) {
        const result = z.object({ products: z.array(z.unknown()).max(50) }).safeParse(jsonReply(await this.http.get(`/products.json?limit=50&page=${page}`)));
        if (!result.success) throw new AppError('SHOPIFY_FORMAT', 'El catálogo público no tiene el formato esperado.', 502);
        for (const raw of result.data.products) all.push(normalizeProduct(raw, currency, this.origin, false));
        if (result.data.products.length < 50) break;
        if (page === 2) partial = true;
      }
      this.cached = { products: all, partial, expires: Date.now() + 60_000 };
      return { products: all, partial };
    }).finally(() => { this.pending = undefined; });
    const result = await this.pending;
    return { products: searchProducts(result.products, query), partial: result.partial };
  }
  async detail(handle: string): Promise<Product> {
    handleSchema.parse(handle);
    return this.operation(async () => {
      const currency = await this.currency();
      const product = normalizeProduct(jsonReply(await this.http.get(`/products/${handle}.js`)), currency, this.origin, true);
      if (product.handle !== handle) throw new AppError('SHOPIFY_FORMAT', 'El producto devuelto no coincide con la consulta.', 502);
      return product;
    });
  }
  async cart(handle: string, variantId: string, quantity: number) {
    idSchema.parse(variantId);
    z.number().int().min(1).max(10).parse(quantity);
    const product = await this.detail(handle);
    const variant = product.variants.find(v => v.id === variantId);
    if (!variant) throw new AppError('VARIANT_NOT_FOUND', 'La variante no pertenece al producto.');
    const base: CartResult = { status: 'unverified', url: null, productUrl: product.url, reason: 'No se pudo comprobar el carrito. Revisa el producto en la tienda oficial.', checkedAt: new Date().toISOString() };
    if (variant.availability !== 'available' || variant.priceMinor === null || !variant.currency) {
      return { product, cart: { ...base, status: 'unavailable' as const, reason: 'Se necesita precio, moneda y disponibilidad verificables para preparar el carrito.' } };
    }
    // Only an isolated visitor cart. No add.js POST, checkout, payment or order API.
    const path = `/cart/${variantId}:${quantity}?storefront=true`;
    try {
      let next = path;
      const cookies = new Map<string, string>();
      let arrived = false;
      for (let step = 0; step < 3; step++) {
        const reply = await this.http.get(next, [...cookies.values()].join('; '));
        const setCookies = reply.headers['set-cookie'];
        for (const cookie of (Array.isArray(setCookies) ? setCookies : setCookies ? [setCookies] : [])) {
          const pair = cookie.split(';')[0] ?? '';
          if (/^[A-Za-z0-9_-]+=[^\r\n;]{0,4096}$/.test(pair)) cookies.set(pair.split('=')[0]!, pair);
        }
        if (reply.status === 200 && new URL(next, this.origin).pathname === '/cart') { arrived = true; break; }
        if (![301, 302, 303, 307, 308].includes(reply.status) || typeof reply.headers.location !== 'string') break;
        const target = assertStoreUrl(reply.headers.location, this.origin);
        if (target.pathname !== '/cart') break;
        next = target.href;
      }
      if (!arrived || !cookies.size) return { product, cart: base };
      const rawCart = z.object({ currency: z.string(), items: z.array(z.object({ variant_id: shopId, quantity: z.number().int(), price: z.number().int().nonnegative() })).max(100) }).safeParse(jsonReply(await this.http.get('/cart.js', [...cookies.values()].join('; '))));
      const item = rawCart.success ? rawCart.data.items[0] : undefined;
      if (!rawCart.success || rawCart.data.items.length !== 1 || rawCart.data.currency !== variant.currency || !item || item.variant_id !== variantId || item.quantity !== quantity || item.price !== variant.priceMinor) return { product, cart: base };
      return { product, cart: { ...base, status: 'verified' as const, url: new URL(path, this.origin).href, reason: 'Variante, cantidad, precio y moneda comprobados en un carrito de visitante. La tienda confirma el valor final al abrirlo.' } };
    } catch { return { product, cart: base }; }
  }
}
