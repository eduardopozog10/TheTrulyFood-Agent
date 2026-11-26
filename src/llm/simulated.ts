import type { LLMProvider, ProviderInput, ProviderOutput, Answer } from './provider.js';
import type { Product } from '../domain.js';
import type { ToolName } from '../agent/tools.js';
const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
export class SimulatedProvider implements LLMProvider {
  readonly name = 'simulated' as const;
  readonly model = 'deterministic-v1';
  async next(input: ProviderInput): Promise<ProviderOutput> {
    const text = normalize(input.history.at(-1)?.text ?? '');
    const usage = { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 };
    const answer = (intent: Answer['intent'], handles: string[] = []): ProviderOutput => ({ decision: { type: 'answer', answer: { intent, handles } }, usage });
    const tool = (name: ToolName, args: Record<string, unknown>): ProviderOutput => ({ decision: { type: 'tool', call: { name, args } }, usage });
    const last = input.results.at(-1);
    if (last) {
      if (!last.ok) return answer('limitations');
      if (!last.products.length) return answer('not_found');
      return answer(last.name === 'buscar_productos' ? 'results' : last.name === 'crear_carrito' ? 'cart' : last.name === 'consultar_disponibilidad' ? 'availability' : 'detail', last.products.map(p => p.handle));
    }
    if (/(ignora|ignore|system prompt|instrucciones internas|api.?key|credencial|inventa|finge|simula.*pag|pague|pago confirmado)/.test(text)) return answer('limitations');
    if (/despacho|envio|entrega|comuna/.test(text)) return answer('shipping');
    if (/suscrip|recurrente|mensual/.test(text)) return answer('subscriptions');
    if (/descuento|promocion|oferta|cupon/.test(text)) return answer('promotions');
    if (/persona|humano|ejecutivo|asesor real/.test(text)) return answer('handoff');
    if (/^(hola|buen[oa]s?|hey|gracias)[!.,\s]*$/.test(text)) return answer('greeting');
    let selected: Product | undefined = input.context.find(p => text.includes(p.handle));
    const index = /primer[oa]|\b1\b/.test(text) ? 0 : /segund[oa]|\b2\b/.test(text) ? 1 : /tercer[oa]|\b3\b/.test(text) ? 2 : -1;
    selected ??= index >= 0 ? input.context[index] : input.context.length === 1 ? input.context[0] : undefined;
    selected ??= input.context.find(p => normalize(p.title).split(' ').filter(w => w.length > 3 && !['demostracion'].includes(w)).some(w => text.includes(w)));
    if (/carrito|comprar|lo quiero|la quiero|llevar/.test(text)) {
      if (/\bno\b.{0,30}\b(?:carrito|comprar|quiero|llevar)\b/.test(text)) return answer('clarify');
      if (!selected) return answer('clarify');
      const explicit = text.match(/\b[1-9][0-9]{7,19}\b/)?.[0];
      const variant = explicit ? selected.variants.find(v => v.id === explicit) : selected.variants.find(v => text.includes(normalize(v.title))) ?? (selected.variants.length === 1 ? selected.variants[0] : undefined);
      if (!variant) return answer('clarify', [selected.handle]);
      const requested = text.match(/(?:cantidad\s*[:=]?\s*|\bx\s*)(\d{1,3})\b/)?.[1];
      const quantity = requested ? Number(requested) : 1;
      return tool('crear_carrito', { handle: selected.handle, variantId: variant.id, quantity });
    }
    if (selected && /stock|disponib|agotad/.test(text)) return tool('consultar_disponibilidad', { handle: selected.handle, variantId: text.match(/\b[1-9][0-9]{7,19}\b/)?.[0] ?? null });
    if (selected && /detalle|precio|cuanto|variante|primero|primera|segundo|segunda|tercero|tercera|ese|esa|este|esta/.test(text)) return tool('detalle_producto', { handle: selected.handle });
    if (input.remainingTools < 1) return answer('limitations');
    if (/catalogo|productos|recomienda|recomiendame|que tienen|que venden|ver todo/.test(text)) return tool('buscar_productos', { query: '' });
    const query = text.replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).filter(w => w && !['busco', 'buscar', 'busca', 'quiero', 'necesito', 'una', 'un', 'unos', 'unas', 'el', 'la', 'los', 'las', 'de', 'del', 'para', 'por', 'favor', 'tienes', 'tienen', 'hay', 'muestra', 'muestrame', 'ver', 'me', 'puedes', 'precio', 'cuanto', 'cuesta', 'disponible', 'stock'].includes(w)).join(' ').slice(0, 160);
    if (!query) return answer('clarify');
    return tool('buscar_productos', { query });
  }
}
