import { randomUUID } from 'node:crypto';
import { AppError, safeError, type Catalog, type Product, type Source } from '../domain.js';
import { redact } from '../security.js';
import type { Journal } from '../storage/journal.js';
import type { LLMProvider, Message, Usage } from '../llm/provider.js';
import { ToolRunner, type ToolResult } from './tools.js';
import { validateAnswer, type CommercialResponse } from '../commercial/validate.js';
export interface Session {
  id: string; source: Source; createdAt: string; messages: Message[]; products: Product[];
  tools: number; usage: Usage; errors: number; busy: boolean; lastActivity: number;
}
export class ConversationEngine {
  private sessions = new Map<string, Session>();
  constructor(private provider: LLMProvider, private catalogs: Record<Source, Catalog>, private journal: Journal, private maxToolCalls: number) {}
  private async log(id: string, event: Record<string, unknown>) {
    try { await this.journal.append(id, event); }
    catch { throw new AppError('STORAGE_ERROR', 'No fue posible guardar el registro local. Revisa permisos y espacio disponible.', 503); }
  }
  async create(source: Source): Promise<Session> {
    for (const [id, session] of this.sessions) if (!session.busy && Date.now() - session.lastActivity > 86400_000) this.sessions.delete(id);
    if (this.sessions.size >= 200) throw new AppError('SESSION_LIMIT', 'Se alcanzó el límite local de conversaciones. Reinicia el servicio.', 429);
    const session: Session = {
      id: randomUUID(), source, createdAt: new Date().toISOString(), messages: [], products: [], tools: 0,
      usage: { inputTokens: 0, outputTokens: 0, estimatedUsd: 0 },
      errors: 0, busy: false, lastActivity: Date.now(),
    };
    await this.log(session.id, { type: 'conversation_created', source, provider: this.provider.name, model: this.provider.model });
    this.sessions.set(session.id, session);
    return session;
  }
  get(id: string): Session {
    const s = this.sessions.get(id);
    if (!s) throw new AppError('CONVERSATION_NOT_FOUND', 'La conversación expiró o el servidor se reinició. Inicia una nueva.', 404);
    return s;
  }
  async reset(id: string, source: Source): Promise<Session> {
    const current = this.get(id);
    if (current.busy) throw new AppError('CONVERSATION_BUSY', 'Espera a que termine el mensaje actual.', 409);
    // Create first so a storage failure does not destroy a working conversation.
    const next = await this.create(source);
    await this.log(id, { type: 'conversation_closed' });
    this.sessions.delete(id);
    return next;
  }
  snapshot(s: Session) {
    return { id: s.id, source: s.source, createdAt: s.createdAt, messageCount: s.messages.length, toolCount: s.tools, usage: s.usage, errorCount: s.errors, provider: this.provider.name, model: this.provider.model, connection: this.catalogs[s.source].status() };
  }
  async send(id: string, raw: string): Promise<{ response: CommercialResponse; tools: ToolResult[]; session: ReturnType<ConversationEngine['snapshot']>; error: { code: string; message: string } | null }> {
    const s = this.get(id);
    if (s.busy) throw new AppError('CONVERSATION_BUSY', 'Espera a que termine el mensaje actual.', 409);
    if (s.messages.length >= 120) throw new AppError('MESSAGE_LIMIT', 'Esta conversación alcanzó el límite. Inicia una nueva.', 429);
    s.busy = true;
    s.lastActivity = Date.now();
    const text = redact(raw);
    const user: Message = { role: 'user', text, at: new Date().toISOString() };
    const results: ToolResult[] = [];
    const deadline = Date.now() + 60000;
    const runner = new ToolRunner(this.catalogs[s.source], this.maxToolCalls);
    let response: CommercialResponse = { text: 'No fue posible completar la consulta.', products: [], cart: null };
    let technicalError: { code: string; message: string } | null = null;
    try {
      await this.log(id, { type: 'message', provider: this.provider.name, model: this.provider.model, message: user });
      s.messages.push(user);
      for (let step = 0; step <= this.maxToolCalls; step++) {
        if (Date.now() >= deadline) throw new AppError('TURN_TIMEOUT', 'La consulta alcanzó su límite de tiempo. Intenta una solicitud más acotada.', 504);
        let output;
        try { output = await this.provider.next({ history: s.messages.slice(-16), context: s.products, results, remainingTools: this.maxToolCalls - results.length }); }
        catch (error) {
          if (this.provider.name === 'openai') {
            s.usage = { inputTokens: null, outputTokens: null, estimatedUsd: null };
            await this.log(id, { type: 'usage', provider: this.provider.name, model: this.provider.model, usage: { inputTokens: null, outputTokens: null, estimatedUsd: null }, reason: 'failed_provider_attempt' });
          }
          throw error;
        }
        for (const key of ['inputTokens', 'outputTokens', 'estimatedUsd'] as const) {
          s.usage[key] = s.usage[key] === null || output.usage[key] === null ? null : s.usage[key] + output.usage[key];
        }
        await this.log(id, { type: 'usage', provider: this.provider.name, model: this.provider.model, usage: output.usage });
        if (Date.now() >= deadline) throw new AppError('TURN_TIMEOUT', 'La consulta alcanzó su límite de tiempo. Intenta una solicitud más acotada.', 504);
        if (output.decision.type === 'answer') {
          response = validateAnswer(output.decision.answer, results, s.products);
          break;
        }
        if (results.length >= this.maxToolCalls) throw new AppError('TOOL_LIMIT', 'Se alcanzó el límite de herramientas de este mensaje.', 429);
        const call = output.decision.call;
        if (call.name === 'crear_carrito') {
          if (!/carrito|comprar|lo quiero|la quiero|llevar/i.test(text) || /\bno\b.{0,30}\b(?:carrito|comprar|quiero|llevar)\b/i.test(text)) throw new AppError('CART_CONSENT', 'El carrito requiere una solicitud explícita del cliente.');
          const args = typeof call.args === 'object' && call.args !== null ? call.args as Record<string, unknown> : {};
          const known = [...s.products, ...results.flatMap(r => r.ok ? r.products : [])].find(p => p.handle === args.handle);
          if (!known) throw new AppError('CART_SELECTION', 'Primero consulta el producto y selecciona una variante.');
          const variant = known.variants.find(v => v.id === args.variantId);
          const fold = (value: string) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');
          if (!variant || (known.variants.length > 1 && !text.includes(variant.id) && !fold(text).includes(fold(variant.title)))) throw new AppError('CART_SELECTION', 'Indica la variante que quieres agregar al carrito.');
        }
        const result = await runner.execute(call);
        results.push(result);
        s.tools++;
        await this.log(id, { type: 'tool', result });
        if (!result.ok) {
          s.errors++;
          technicalError = result.error ?? { code: 'TOOL_ERROR', message: 'La herramienta falló.' };
          response = { text: technicalError.message, products: [], cart: null };
          break;
        }
      }
      if (response.products.length) s.products = response.products;
    } catch (error) {
      technicalError = safeError(error);
      s.errors++;
      response = { text: technicalError.message, products: [], cart: null };
      try { await this.log(id, { type: 'error', error: technicalError, provider: this.provider.name, model: this.provider.model }); }
      catch { technicalError = { code: 'STORAGE_ERROR', message: 'Falló el registro local. Revisa el almacenamiento antes de continuar.' }; response.text = technicalError.message; }
    }
    const assistant: Message = { role: 'assistant', text: response.text, at: new Date().toISOString() };
    s.messages.push(assistant);
    try { await this.log(id, { type: 'message', provider: this.provider.name, model: this.provider.model, message: assistant }); }
    catch { technicalError = { code: 'STORAGE_ERROR', message: 'No se pudo guardar la respuesta en el registro local.' }; }
    s.busy = false;
    return { response, tools: results, session: this.snapshot(s), error: technicalError };
  }
}
