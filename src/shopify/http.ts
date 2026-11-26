import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { AppError } from '../domain.js';
import { assertStoreUrl, isPublicAddress } from '../security.js';

export interface HttpReply { status: number; headers: Record<string, string | string[] | undefined>; body: string }
export interface StoreHttp { get(path: string, cookie?: string): Promise<HttpReply> }
export class PublicStoreHttp implements StoreHttp {
  private requests: number[] = [];
  constructor(private origin: string, private timeoutMs = 8000) {}
  async get(path: string, cookie?: string): Promise<HttpReply> {
    const url = assertStoreUrl(path, this.origin);
    this.requests = this.requests.filter(at => Date.now() - at < 60_000);
    if (this.requests.length >= 30) throw new AppError('SHOPIFY_RATE_LIMIT', 'Límite de consultas a la tienda alcanzado. Espera un minuto.', 429);
    this.requests.push(Date.now());
    let addresses;
    let dnsTimer: ReturnType<typeof setTimeout> | undefined;
    try { addresses = await Promise.race([lookup(url.hostname, { all: true, family: 4 }), new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error('DNS timeout')), this.timeoutMs); })]); }
    catch { throw new AppError('SHOPIFY_NETWORK', 'No fue posible resolver la tienda.', 502); }
    finally { clearTimeout(dnsTimer); }
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address))) {
      throw new AppError('URL_BLOCKED', 'Dirección de red no autorizada.', 502);
    }
    const pinned = addresses[0]!;
    return new Promise((resolve, reject) => {
      const req = request(url, {
        method: 'GET',
        family: 4,
        headers: { Accept: 'application/json,text/html;q=0.5', 'User-Agent': 'TheTrulyFood-LocalPrototype/0.1', ...(cookie ? { Cookie: cookie } : {}) },
        // Connect to the address already checked, while retaining TLS hostname validation.
        lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
      }, res => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on('data', (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 1_000_000) { req.destroy(new AppError('RESPONSE_TOO_LARGE', 'La respuesta de la tienda excede el límite.', 502)); return; }
          chunks.push(chunk);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 502, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', () => reject(new AppError('SHOPIFY_NETWORK', 'La respuesta de la tienda se interrumpió.', 502)));
      });
      const timer = setTimeout(() => req.destroy(new AppError('SHOPIFY_TIMEOUT', 'La tienda tardó demasiado en responder.', 504)), this.timeoutMs);
      req.on('close', () => clearTimeout(timer));
      req.on('error', error => reject(error instanceof AppError ? error : new AppError('SHOPIFY_NETWORK', 'No fue posible conectar con la tienda.', 502)));
      req.end();
    });
  }
}
export function jsonReply(reply: HttpReply): unknown {
  if (reply.status === 403 || reply.status === 429) throw new AppError('SHOPIFY_BLOCKED', 'La tienda restringe el acceso público. Puedes usar el catálogo de demostración.', 502);
  if (reply.status !== 200) throw new AppError('SHOPIFY_HTTP', 'La tienda no entregó los datos solicitados.', 502);
  const mediaType = String(reply.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase();
  // Shopify Ajax .js endpoints legitimately use text/javascript for a JSON body.
  // JSON.parse still rejects executable scripts, JSONP, HTML and challenge pages.
  if (!['application/json', 'text/javascript', 'application/javascript'].includes(mediaType ?? '')) throw new AppError('SHOPIFY_FORMAT', 'La tienda no entregó una respuesta JSON verificable.', 502);
  try { return JSON.parse(reply.body) as unknown; }
  catch { throw new AppError('SHOPIFY_FORMAT', 'La respuesta de la tienda no pudo validarse.', 502); }
}
