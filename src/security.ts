import { isIP } from 'node:net';
import { BlockList } from 'node:net';
import { AppError } from './domain.js';

const blocked = new BlockList();
for (const [ip, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 3],
] as const) blocked.addSubnet(ip, prefix, 'ipv4');
export function isPublicAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) return !blocked.check(address, 'ipv4');
  // Prototype uses pinned IPv4 only. IPv6 transition/tunnel ranges need a separate review.
  if (version === 6) return false;
  return false;
}
export function assertStoreUrl(value: string, origin: string): URL {
  const url = new URL(value, origin);
  if (url.origin !== origin || url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new AppError('URL_BLOCKED', 'La URL no pertenece a la tienda autorizada.');
  }
  if (!/^\/(?:products(?:\.json|\/[a-z0-9][a-z0-9-]{0,119}(?:\.js)?)|cart(?:\.js|\/[0-9]{1,20}:[1-9][0-9]?)?|robots\.txt)$/.test(url.pathname)) {
    throw new AppError('URL_BLOCKED', 'La ruta solicitada no está autorizada.');
  }
  for (const key of url.searchParams.keys()) {
    if (!['limit', 'page', 'storefront'].includes(key)) throw new AppError('URL_BLOCKED', 'Parámetros no autorizados.');
  }
  return url;
}
export function redact(value: string): string {
  return value
    .replace(/\b(?:sk|ghp|github_pat|gho|ghs)[-_][A-Za-z0-9_-]{8,}\b/g, '[CREDENCIAL OMITIDA]')
    .replace(/\b(?:Bearer\s+)[A-Za-z0-9._-]+/gi, '[CREDENCIAL OMITIDA]')
    .replace(/\b(?:api[_-]?key|token|password|contrase[nñ]a)\s*[:=]\s*[^\s,;]+/gi, '[CREDENCIAL OMITIDA]')
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL OMITIDO]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, '[RUT OMITIDO]')
    .replace(/(?<!\d)(?:\+?56[\s-]?)?9[\s-]?(?:\d[\s-]?){8}(?!\d)/g, '[TELÉFONO OMITIDO]');
}
export function plainText(value: unknown, max = 1000): string {
  return typeof value === 'string'
    ? redact(value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max)
    : '';
}
