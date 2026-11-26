interface Variant { id: string; title: string; priceMinor: number | null; currency: string | null; availability: 'available' | 'sold_out' | 'unknown' }
interface Product { handle: string; title: string; description: string; category: string; variants: Variant[]; url: string | null; image: string | null; source: 'live' | 'demo'; checkedAt: string }
interface Session { id: string; source: 'live' | 'demo'; messageCount: number; toolCount: number; model: string; provider: string; usage: { inputTokens: number | null; outputTokens: number | null; estimatedUsd: number | null }; connection: { state: string } }
interface Tool { name: string; ok: boolean; durationMs: number; error?: { message: string } }
interface ChatResult { response: { text: string; products: Product[]; cart: { status: string; url: string | null; productUrl: string | null; reason: string } | null }; session: Session; tools: Tool[]; error: { message: string } | null }
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const messages = element<HTMLDivElement>('messages');
const input = element<HTMLTextAreaElement>('message');
const source = element<HTMLSelectElement>('source');
let session: Session | null = null;
let busy = false;
let activeProvider = 'simulated';
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: { 'Content-Type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(180000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error?.message ?? 'No fue posible conectar con el servicio local.');
  return result as T;
}
function node<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag); el.className = className; el.textContent = text; return el;
}
function setBusy(value: boolean) {
  busy = value;
  document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>('button,select').forEach(el => { el.disabled = value; });
  input.disabled = value;
  element('processing').hidden = !value;
}
function showError(text = '') { const el = element('error'); el.textContent = text; el.hidden = !text; }
function money(minor: number | null, currency: string | null) {
  if (minor === null || !currency) return 'Precio no verificado';
  try { return `${new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 2, ...(minor % 100 ? { minimumFractionDigits: 2 } : {}) }).format(minor / 100)} ${currency}`; } catch { return 'Precio no verificado'; }
}
function safeLink(url: string, label: string, className = ''): HTMLAnchorElement | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.origin !== 'https://gautieroficial.cl' || parsed.username || parsed.password) return null;
    const link = node('a', className, label); link.href = parsed.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; return link;
  } catch { return null; }
}
function promptButton(label: string, prompt: string) { const button = node('button', '', label); button.type = 'button'; button.addEventListener('click', () => { void send(prompt); }); return button; }
function renderProduct(p: Product): HTMLElement {
  const card = node('article', 'product-card');
  if (p.image) {
    try { const url = new URL(p.image); if (url.protocol === 'https:' && ['cdn.shopify.com', 'gautieroficial.cl'].includes(url.hostname)) { const img = node('img'); img.src = url.href; img.alt = p.title; img.loading = 'lazy'; img.referrerPolicy = 'no-referrer'; card.append(img); } } catch { /* no image */ }
  }
  card.append(node('div', 'product-source', p.source === 'demo' ? 'SIMULADO · PRODUCTO FICTICIO' : 'DATOS DEL CATÁLOGO PÚBLICO'));
  card.append(node('h3', '', p.title));
  if (p.category) card.append(node('div', 'product-category', p.category));
  if (p.description) { const details = node('details', 'product-description'); details.append(node('summary', '', 'Descripción publicada'), node('p', '', p.description)); card.append(details); }
  const first = p.variants[0];
  const different = p.variants.some(v => v.priceMinor !== first?.priceMinor || v.currency !== first?.currency);
  card.append(node('div', 'product-price', different ? 'Precio según variante' : money(first?.priceMinor ?? null, first?.currency ?? null)));
  for (const v of p.variants) {
    const variant = node('div', 'variant');
    variant.append(node('div', 'variant-title', `${v.title}${different ? ` · ${money(v.priceMinor, v.currency)}` : ''}`));
    variant.append(node('span', `availability ${v.availability}`, { available: '● Disponible según la vitrina', sold_out: '● Agotado', unknown: '○ Disponibilidad desconocida' }[v.availability]));
    variant.append(node('div', 'variant-id', `ID ${v.id}`));
    if (v.availability === 'available') {
      const actions = node('div', 'product-actions');
      actions.append(promptButton(p.source === 'demo' ? 'Probar carrito' : 'Preparar carrito', `Quiero carrito de ${p.handle}, variante ${v.id}, cantidad 1`));
      variant.append(actions);
    }
    card.append(variant);
  }
  const actions = node('div', 'product-actions');
  actions.append(promptButton('Ver detalle', `Detalle de ${p.handle}`), promptButton('Consultar stock', `Disponibilidad de ${p.handle}`));
  if (p.url) { const link = safeLink(p.url, 'Sitio oficial ↗'); if (link) actions.append(link); }
  card.append(actions, node('div', 'product-updated', `Consulta: ${new Date(p.checkedAt).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`));
  return card;
}
function addMessage(role: 'user' | 'assistant', text: string, result?: ChatResult['response']) {
  const wrapper = node('div', `message ${role}`);
  const meta = node('div', 'message-meta');
  meta.append(node('strong', '', role === 'user' ? 'Tú' : 'Asistente comercial'), node('span', '', new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })));
  wrapper.append(meta, node('div', 'message-text', text));
  if (result?.products.length) { const grid = node('div', 'product-grid'); result.products.forEach(p => grid.append(renderProduct(p))); wrapper.append(grid); }
  if (result?.cart?.status === 'verified' && result.cart.url) {
    const notice = node('div', 'cart-notice', 'Carrito verificado en esta consulta. No reserva stock ni confirma una compra.');
    const link = safeLink(result.cart.url, 'Abrir carrito en Shopify ↗', 'cart-link'); if (link) notice.append(node('br'), link); wrapper.append(notice);
  }
  messages.append(wrapper); messages.scrollTop = messages.scrollHeight;
}
function updateMetrics(s: Session) {
  element('message-count').textContent = String(s.messageCount); element('tool-count').textContent = String(s.toolCount);
  element('input-tokens').textContent = s.usage.inputTokens === null ? 'Desconocido' : s.usage.inputTokens.toLocaleString('es-CL');
  element('output-tokens').textContent = s.usage.outputTokens === null ? 'Desconocido' : s.usage.outputTokens.toLocaleString('es-CL');
  element('cost').textContent = s.usage.estimatedUsd === null ? 'Desconocido' : `US$ ${s.usage.estimatedUsd.toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 6 })}`;
  element('cost-label').textContent = s.provider === 'simulated' ? 'MODO GRATUITO' : 'API ACTIVADA';
  element('model').textContent = `${s.provider} / ${s.model}`;
  element('provider-label').textContent = s.provider === 'simulated' ? 'Modo simulado · sin consumo de API' : 'OpenAI · proveedor real';
  const state = s.connection.state;
  const labels: Record<string, string> = { idle: 'Sin consultar', connected: 'Datos públicos consultados', blocked: 'Acceso público restringido', error: 'Error de conexión', demo: 'Catálogo ficticio · sin conexión externa' };
  element('connection').replaceChildren(node('span', `status-dot ${state}`), node('span', '', labels[state] ?? 'Desconocido'));
  element('mode-notice').textContent = `${s.provider === 'simulated' ? 'Proveedor simulado: permite probar flujos; no evalúa la calidad de una IA real.' : 'Proveedor OpenAI activado explícitamente: las consultas pueden generar costos.'} ${s.source === 'demo' ? 'Catálogo ficticio, sin enlaces de compra reales.' : 'Catálogo real de Gautier, sujeto a acceso público.'}`;
}
function renderTools(tools: Tool[]) {
  if (!tools.length) return;
  const list = element('tools'); list.querySelector('.empty-tools')?.remove();
  for (const tool of tools) {
    const row = node('li', `tool-row${tool.ok ? '' : ' failed'}`);
    row.append(node('strong', '', tool.name), node('span', '', `${tool.ok ? 'Completada' : 'Error'} · ${tool.durationMs} ms${tool.error ? ` · ${tool.error.message}` : ''}`)); list.prepend(row);
  }
  while (list.children.length > 20) list.lastElementChild?.remove();
}
async function restart() {
  if (busy) return;
  setBusy(true); showError();
  try {
    const next = await api<Session>(session ? `/api/conversations/${session.id}/reset` : '/api/conversations', { source: source.value });
    session = next; messages.replaceChildren(); element('tools').replaceChildren(node('li', 'empty-tools', 'Las consultas aparecerán aquí cuando envíes un mensaje.')); updateMetrics(next);
    addMessage('assistant', next.source === 'demo' ? '¡Hola! Estás en el catálogo ficticio de demostración. Puedes buscar una gorra, explorar variantes o probar un carrito sin conexiones de compra. ¿Qué quieres revisar?' : '¡Hola! Te ayudo a consultar el catálogo público de Gautier. Si la tienda restringe la conexión, puedes elegir “Demostración” en el panel. ¿Qué estás buscando?');
  } catch (error) {
    showError(error instanceof Error ? error.message : 'No se pudo iniciar una conversación.');
    if (session) source.value = session.source;
  } finally { setBusy(false); input.focus(); }
}
async function send(text: string) {
  if (busy || !text.trim() || !session) return;
  showError(); setBusy(true); addMessage('user', text); input.value = ''; element('character-count').textContent = '0 / 2000';
  try {
    const result = await api<ChatResult>(`/api/conversations/${session.id}/messages`, { message: text });
    session = result.session; updateMetrics(session); renderTools(result.tools); addMessage('assistant', result.response.text, result.response);
    if (result.error) showError(result.error.message);
  } catch (error) { showError(error instanceof Error ? error.message : 'No fue posible enviar el mensaje.'); }
  finally { setBusy(false); input.focus(); }
}
element('chat-form').addEventListener('submit', event => { event.preventDefault(); void send(input.value); });
input.addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); void send(input.value); } });
input.addEventListener('input', () => { element('character-count').textContent = `${input.value.length} / 2000`; });
element('reset').addEventListener('click', () => { void restart(); }); source.addEventListener('change', () => { void restart(); });
document.querySelectorAll<HTMLButtonElement>('[data-prompt]').forEach(button => button.addEventListener('click', () => { void send(button.dataset.prompt ?? ''); }));
async function boot() {
  setBusy(true);
  try { const config = await api<{ defaultSource: string; provider: string }>('/api/config'); source.value = config.defaultSource; activeProvider = config.provider; }
  catch { showError('El servicio local no está disponible. Inícialo con npm run dev y recarga esta página.'); }
  finally { setBusy(false); }
  if (activeProvider) await restart();
}
void boot();
