export type Source = 'live' | 'demo';
export type Availability = 'available' | 'sold_out' | 'unknown';
export interface Variant {
  id: string;
  title: string;
  priceMinor: number | null;
  currency: string | null;
  availability: Availability;
}
export interface Product {
  handle: string;
  title: string;
  description: string;
  category: string;
  variants: Variant[];
  url: string | null;
  image: string | null;
  source: Source;
  checkedAt: string;
}
export interface CartResult {
  status: 'verified' | 'unverified' | 'unavailable';
  url: string | null;
  productUrl: string | null;
  reason: string;
  checkedAt: string;
}
export interface Catalog {
  readonly source: Source;
  search(query: string): Promise<{ products: Product[]; partial: boolean }>;
  detail(handle: string): Promise<Product>;
  cart(handle: string, variantId: string, quantity: number): Promise<{ product: Product; cart: CartResult }>;
  status(): { state: 'idle' | 'connected' | 'blocked' | 'error' | 'demo'; checkedAt: string | null };
}
export class AppError extends Error {
  constructor(public readonly code: string, public readonly safeMessage: string, public readonly statusCode = 400) {
    super(safeMessage);
  }
}
export function safeError(error: unknown): { code: string; message: string } {
  return error instanceof AppError
    ? { code: error.code, message: error.safeMessage }
    : { code: 'INTERNAL_ERROR', message: 'Ocurrió un problema técnico. Intenta de nuevo.' };
}
