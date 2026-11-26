import { z } from 'zod';
import { AppError, safeError, type Catalog, type Product, type CartResult } from '../domain.js';
import { handleSchema, idSchema } from '../shopify/catalog.js';
export const toolNames = ['buscar_productos', 'detalle_producto', 'consultar_disponibilidad', 'crear_carrito'] as const;
export type ToolName = typeof toolNames[number];
export interface ToolCall { name: ToolName; args: unknown }
export interface ToolResult {
  name: ToolName;
  args: Record<string, unknown>;
  ok: boolean;
  products: Product[];
  cart?: CartResult;
  partial?: boolean;
  error?: { code: string; message: string };
  durationMs: number;
}
const schemas = {
  buscar_productos: z.object({ query: z.string().trim().max(160) }).strict(),
  detalle_producto: z.object({ handle: handleSchema }).strict(),
  consultar_disponibilidad: z.object({ handle: handleSchema, variantId: idSchema.nullable() }).strict(),
  crear_carrito: z.object({ handle: handleSchema, variantId: idSchema, quantity: z.number().int().min(1).max(10) }).strict(),
};
export const toolDefinitions = toolNames.map(name => ({
  type: 'function' as const, name,
  description: {
    buscar_productos: 'Busca en el catálogo público autorizado por nombre, descripción o categoría. Una búsqueda vacía enumera productos.',
    detalle_producto: 'Consulta nuevamente precio, variantes y disponibilidad de un producto por su handle.',
    consultar_disponibilidad: 'Consulta el producto y una variante opcional. La ausencia de stock es desconocido.',
    crear_carrito: 'Valida una variante y un carrito de visitante. Solo devuelve enlace si comprueba sus datos; nunca compra ni paga.',
  }[name],
  strict: true,
  parameters: z.toJSONSchema(schemas[name], { target: 'draft-7' }),
}));
export class ToolRunner {
  private calls = 0;
  constructor(private catalog: Catalog, private maxCalls: number) {}
  async execute(call: ToolCall): Promise<ToolResult> {
    if (++this.calls > this.maxCalls) throw new AppError('TOOL_LIMIT', 'Se alcanzó el límite de herramientas de este mensaje.', 429);
    const start = Date.now();
    let args: Record<string, unknown> = {};
    try {
      if (!toolNames.includes(call.name)) throw new AppError('TOOL_INVALID', 'Herramienta no permitida.');
      const parsed = schemas[call.name].safeParse(call.args);
      if (!parsed.success) throw new AppError('TOOL_ARGUMENTS', 'Los argumentos de la herramienta son inválidos.');
      args = parsed.data;
      if (call.name === 'buscar_productos') {
        const result = await this.catalog.search(args.query as string);
        return { name: call.name, args, ok: true, ...result, durationMs: Date.now() - start };
      }
      if (call.name === 'crear_carrito') {
        const result = await this.catalog.cart(args.handle as string, args.variantId as string, args.quantity as number);
        return { name: call.name, args, ok: true, products: [result.product], cart: result.cart, durationMs: Date.now() - start };
      }
      const product = await this.catalog.detail(args.handle as string);
      if (args.variantId && !product.variants.some(v => v.id === args.variantId)) throw new AppError('VARIANT_NOT_FOUND', 'La variante no pertenece al producto.');
      return { name: call.name, args, ok: true, products: [product], durationMs: Date.now() - start };
    } catch (error) {
      return { name: call.name, args, ok: false, products: [], error: safeError(error), durationMs: Date.now() - start };
    }
  }
}
