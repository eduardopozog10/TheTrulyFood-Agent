import { loadConfig, STORES } from './config.js';
import { PublicStoreHttp } from './shopify/http.js';
import { ShopifyCatalog } from './shopify/catalog.js';
import { DemoCatalog } from './shopify/demo.js';
import { SimulatedProvider } from './llm/simulated.js';
import { OpenAIProvider } from './llm/openai.js';
import { loadRates } from './llm/pricing.js';
import { FileJournal } from './storage/journal.js';
import { ConversationEngine } from './agent/engine.js';
import { createApp } from './api.js';
async function main() {
  const config = loadConfig();
  const store = STORES[config.SHOPIFY_STORE];
  const provider = config.LLM_PROVIDER === 'simulated' ? new SimulatedProvider() : new OpenAIProvider(config.OPENAI_MODEL, config.OPENAI_API_KEY, await loadRates());
  const journal = new FileJournal(config.DATA_DIR, config.LOG_RETENTION_DAYS);
  await journal.init();
  const catalogs = { live: new ShopifyCatalog(new PublicStoreHttp(store.origin, config.SHOPIFY_TIMEOUT_MS), store.origin), demo: new DemoCatalog() };
  const engine = new ConversationEngine(provider, catalogs, journal, config.MAX_TOOL_CALLS);
  const app = createApp(config, engine);
  const cleanup = setInterval(() => { void journal.prune().catch(() => process.stderr.write('No fue posible aplicar la retención de registros.\n')); }, 3600_000);
  cleanup.unref();
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { clearInterval(cleanup); void app.close(); });
  await app.listen({ host: '127.0.0.1', port: config.PORT });
  process.stdout.write(`The Truly Food · http://127.0.0.1:${config.PORT} · proveedor ${provider.name}\n`);
}
main().catch(() => { process.stderr.write('No se pudo iniciar. Revisa .env.example, permisos locales y disponibilidad del puerto. No se muestran detalles sensibles.\n'); process.exitCode = 1; });
