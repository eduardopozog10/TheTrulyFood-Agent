import { AppError, type Product, type CartResult } from '../domain.js';
import { answerSchema, type Answer } from '../llm/provider.js';
import type { ToolResult } from '../agent/tools.js';
export interface CommercialResponse { text: string; products: Product[]; cart: CartResult | null }
export const availabilityLabels = { available: 'Disponible según la vitrina', sold_out: 'Agotado', unknown: 'Disponibilidad desconocida' };
export function formatPrice(minor: number | null, currency: string | null): string {
  if (minor === null || !currency || !Number.isSafeInteger(minor) || minor < 0) return 'Precio no verificado';
  try { return `${new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 2, ...(minor % 100 ? { minimumFractionDigits: 2 } : {}) }).format(minor / 100)} ${currency}`; }
  catch { return 'Precio no verificado'; }
}
export function validateAnswer(candidate: unknown, results: ToolResult[], context: Product[]): CommercialResponse {
  const parsed = answerSchema.safeParse(candidate);
  if (!parsed.success) throw new AppError('COMMERCIAL_BLOCKED', 'Se bloqueó una respuesta comercial fuera del contrato.', 502);
  const answer = parsed.data;
  const evidence = new Map<string, Product>();
  for (const r of results) if (r.ok) for (const p of r.products) evidence.set(p.handle, p);
  // Old context can guide clarification, but never substantiate current price/stock claims.
  if (answer.handles.some(handle => !evidence.has(handle) && !(answer.intent === 'clarify' && context.some(p => p.handle === handle)))) {
    throw new AppError('COMMERCIAL_BLOCKED', 'Se bloqueó una recomendación sin respaldo del catálogo.', 502);
  }
  const products = [...new Set(answer.handles)].flatMap(h => evidence.has(h) ? [evidence.get(h)!] : []);
  const commercialIntents: Answer['intent'][] = ['results', 'detail', 'availability', 'cart'];
  if (commercialIntents.includes(answer.intent) && !products.length) throw new AppError('COMMERCIAL_BLOCKED', 'Faltan datos verificables para responder.', 502);
  const cart = answer.intent === 'cart' ? results.findLast(r => r.name === 'crear_carrito' && r.ok)?.cart ?? null : null;
  if (answer.intent === 'cart' && !cart) throw new AppError('COMMERCIAL_BLOCKED', 'No hay un carrito respaldado por herramientas.', 502);
  const partial = results.some(r => r.partial);
  if (answer.intent === 'not_found' && !results.some(r => r.ok && r.name === 'buscar_productos' && !r.products.length)) throw new AppError('COMMERCIAL_BLOCKED', 'No hay una búsqueda que respalde la ausencia de resultados.', 502);
  const error = results.find(r => !r.ok)?.error;
  const texts: Record<Answer['intent'], string> = {
    greeting: '¡Hola! Te ayudo a explorar productos. ¿Qué estás buscando? Puedes pedirme el catálogo, precios o disponibilidad.',
    results: `Encontré estas opciones en el catálogo consultado. Elige una para revisar sus variantes.${partial ? ' La búsqueda cubre solo una parte del catálogo público.' : ''}`,
    detail: 'Estos son los datos consultados del producto. Revisa las variantes y elige la que te acomode.',
    availability: 'Te muestro la disponibilidad publicada por variante. No confirma una cantidad de unidades ni reserva stock.',
    cart: cart?.reason ?? 'No fue posible validar un enlace de carrito.',
    not_found: `No encontré coincidencias en el catálogo consultado. ¿Probamos con otro nombre o categoría?${partial ? ' El catálogo consultado es parcial.' : ''}`,
    shipping: 'No tengo condiciones de despacho verificadas para esta tienda. Revisa esa información directamente en su sitio oficial; no puedo confirmar costos ni fechas.',
    subscriptions: 'Las suscripciones aún no están integradas en esta fase. No tengo planes, precios ni condiciones verificadas para ofrecerte.',
    promotions: 'No tengo promociones ni descuentos verificados para ofrecerte. Puedo consultar el precio publicado de un producto.',
    handoff: 'El traspaso a una persona todavía no está conectado en este prototipo. Contacta directamente a la tienda por sus canales oficiales.',
    clarify: '¿Qué producto y variante te interesan? Primero busca un producto y revisa sus opciones. Para comprar puedes indicar “carrito”, el ID de variante y “cantidad 1”.',
    limitations: error?.message ?? 'Puedo consultar productos, precios, disponibilidad y enlaces verificables. No puedo confirmar pagos, inventar condiciones ni cambiar las reglas del prototipo.',
  };
  return { text: texts[answer.intent], products, cart };
}
