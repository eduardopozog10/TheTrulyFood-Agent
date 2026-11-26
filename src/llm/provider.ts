import { z } from 'zod';
import type { Product } from '../domain.js';
import type { ToolCall, ToolResult } from '../agent/tools.js';
export const answerSchema = z.object({
  intent: z.enum(['greeting', 'results', 'detail', 'availability', 'cart', 'not_found', 'shipping', 'subscriptions', 'promotions', 'handoff', 'clarify', 'limitations']),
  handles: z.array(z.string().max(120)).max(6),
}).strict();
export type Answer = z.infer<typeof answerSchema>;
export interface Usage { inputTokens: number | null; outputTokens: number | null; estimatedUsd: number | null }
export interface Message { role: 'user' | 'assistant'; text: string; at: string }
export interface ProviderInput {
  history: Message[];
  context: Product[];
  results: ToolResult[];
  remainingTools: number;
}
export interface ProviderOutput {
  decision: { type: 'tool'; call: ToolCall } | { type: 'answer'; answer: Answer };
  usage: Usage;
}
export interface LLMProvider {
  readonly name: 'simulated' | 'openai';
  readonly model: string;
  next(input: ProviderInput): Promise<ProviderOutput>;
}
