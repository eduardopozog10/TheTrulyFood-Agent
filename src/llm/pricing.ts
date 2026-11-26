import { readFile } from 'node:fs/promises';
import { z } from 'zod';
const ratesSchema = z.object({ models: z.record(z.string(), z.object({
  inputPerMillionUsd: z.number().nonnegative(), outputPerMillionUsd: z.number().nonnegative(),
  verifiedAt: z.iso.datetime(), sourceUrl: z.url().refine(url => ['openai.com', 'developers.openai.com'].includes(new URL(url).hostname)),
})) });
export type Rates = z.infer<typeof ratesSchema>['models'];
export async function loadRates(): Promise<Rates> {
  try { return ratesSchema.parse(JSON.parse(await readFile('config/model-pricing.json', 'utf8'))).models; }
  catch { return {}; }
}
export function estimateCost(model: string, input: number | null, output: number | null, rates: Rates, now = Date.now()): number | null {
  const rate = rates[model];
  if (!rate || input === null || output === null) return null;
  const age = now - Date.parse(rate.verifiedAt);
  if (age < 0 || age > 30 * 86400_000) return null;
  return (input * rate.inputPerMillionUsd + output * rate.outputPerMillionUsd) / 1_000_000;
}
