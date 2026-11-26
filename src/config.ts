import { z } from 'zod';
export const STORES = Object.freeze({
  gautier: { id: 'gautier', name: 'Gautier · tienda de prueba', origin: 'https://gautieroficial.cl' },
});
const bool = z.enum(['true', 'false']).default('false').transform(v => v === 'true');
const schema = z.object({
  PORT: z.coerce.number().int().min(1024).max(65535).default(3000),
  SHOPIFY_STORE: z.enum(['gautier']).default('gautier'),
  SHOPIFY_MODE: z.enum(['live', 'demo']).default('live'),
  LLM_PROVIDER: z.enum(['simulated', 'openai']).default('simulated'),
  OPENAI_ALLOW_PAID: bool,
  OPENAI_API_KEY: z.string().default(''),
  OPENAI_MODEL: z.string().max(120).default(''),
  DATA_DIR: z.string().min(1).default('./data'),
  LOG_RETENTION_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  MAX_TOOL_CALLS: z.coerce.number().int().min(1).max(6).default(4),
  SHOPIFY_TIMEOUT_MS: z.coerce.number().int().min(1000).max(15000).default(8000),
});
export type Config = z.infer<typeof schema>;
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = schema.safeParse(env);
  if (!result.success) throw new Error('Configuración inválida: revisa los nombres y límites de .env.example.');
  const config = result.data;
  if (config.LLM_PROVIDER === 'openai' && (!config.OPENAI_ALLOW_PAID || !config.OPENAI_API_KEY || !config.OPENAI_MODEL)) {
    throw new Error('OpenAI requiere autorización explícita OPENAI_ALLOW_PAID=true, clave y modelo. No se realizó ninguna llamada.');
  }
  return config;
}
