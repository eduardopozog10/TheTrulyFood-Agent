import { loadConfig, STORES } from '../src/config.js';
import { ShopifyCatalog } from '../src/shopify/catalog.js';
import { PublicStoreHttp } from '../src/shopify/http.js';
import { safeError } from '../src/domain.js';
const config = loadConfig();
const catalog = new ShopifyCatalog(new PublicStoreHttp(STORES[config.SHOPIFY_STORE].origin, config.SHOPIFY_TIMEOUT_MS), STORES[config.SHOPIFY_STORE].origin);
try {
  const result = await catalog.search('gorra');
  const first = result.products[0];
  const detail = first ? await catalog.detail(first.handle) : null;
  const variant = detail?.variants.find(v => v.availability === 'available');
  const cart = process.argv.includes('--cart') && detail && variant ? (await catalog.cart(detail.handle, variant.id, 1)).cart : null;
  console.log(JSON.stringify({ result, detail, cart, connection: catalog.status() }, null, 2));
} catch (error) {
  console.log(JSON.stringify({ error: safeError(error), connection: catalog.status() }, null, 2));
  process.exitCode = 1;
}
