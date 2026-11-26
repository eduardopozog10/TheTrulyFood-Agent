import { AppError, type Catalog, type Product } from '../domain.js';
import { searchProducts } from './catalog.js';
const definitions = [
  ['gorra-demo', 'Gorra de demostración', 'Accesorios', 'Ejemplo ficticio para explorar variantes y selección.', [['900000000000001', 'Arena', 2499000, 'available'], ['900000000000002', 'Negro', 2499000, 'sold_out']]],
  ['bolso-demo', 'Bolso de demostración', 'Accesorios', 'Ejemplo ficticio de producto disponible.', [['900000000000003', 'Única', 3599000, 'available']]],
  ['bufanda-demo', 'Bufanda de demostración', 'Accesorios', 'Ejemplo ficticio sin información de stock.', [['900000000000004', 'Gris', 1599000, 'unknown']]],
] as const;
export class DemoCatalog implements Catalog {
  readonly source = 'demo' as const;
  private products(): Product[] {
    return definitions.map(([handle, title, category, description, variants]) => ({
      handle, title, category, description, source: 'demo', image: null, url: null, checkedAt: new Date().toISOString(),
      variants: variants.map(([id, name, priceMinor, availability]) => ({ id, title: name, priceMinor, availability, currency: 'CLP' })),
    }));
  }
  status() { return { state: 'demo' as const, checkedAt: null }; }
  async search(query: string) { return { products: searchProducts(this.products(), query), partial: false }; }
  async detail(handle: string) {
    const product = this.products().find(p => p.handle === handle);
    if (!product) throw new AppError('PRODUCT_NOT_FOUND', 'No encontré ese producto en la demostración.', 404);
    return product;
  }
  async cart(handle: string, variantId: string, _quantity: number) {
    const product = await this.detail(handle);
    if (!product.variants.some(v => v.id === variantId)) throw new AppError('VARIANT_NOT_FOUND', 'Variante inexistente.');
    return { product, cart: { status: 'unverified' as const, url: null, productUrl: null, reason: 'El catálogo es ficticio. No genera enlaces de compra reales.', checkedAt: new Date().toISOString() } };
  }
}
