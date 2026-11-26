import { appendFile, mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { redact } from '../security.js';
export interface Journal { append(conversationId: string, event: Record<string, unknown>): Promise<void> }
export class FileJournal implements Journal {
  private directory: string;
  private queue = Promise.resolve();
  constructor(directory: string, private retentionDays: number) { this.directory = resolve(directory); }
  async init() {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await this.prune();
  }
  async prune() {
    for (const file of await readdir(this.directory)) {
      if (!/^[0-9a-f-]{36}\.jsonl$/.test(file)) continue;
      const path = join(this.directory, file);
      if (Date.now() - (await stat(path)).mtimeMs > this.retentionDays * 86400_000) await unlink(path);
    }
  }
  async append(conversationId: string, event: Record<string, unknown>): Promise<void> {
    if (!/^[0-9a-f-]{36}$/.test(conversationId)) throw new Error('Identificador de conversación inválido.');
    // Redaction per string leaf avoids corrupting numeric variant IDs and JSON structure.
    const line = JSON.stringify({ eventId: randomUUID(), conversationId, at: new Date().toISOString(), ...event }, (_key, value: unknown) => typeof value === 'string' ? redact(value) : value);
    const write = this.queue.then(() => appendFile(join(this.directory, `${conversationId}.jsonl`), line + '\n', { encoding: 'utf8', mode: 0o600 }));
    this.queue = write.catch(() => undefined);
    await write;
  }
}
