import { z } from 'zod';

export type LLMTier = 'fast' | 'strong';

export interface GenerateJSONArgs<T> {
  tier: LLMTier;
  system: string;
  user: string;
  schema: z.ZodType<T, any, any>;
  maxRetries?: number;
  promptName?: string;
  promptVersion?: string;
}

export interface GenerateTextArgs {
  tier: LLMTier;
  system: string;
  user: string;
  promptName?: string;
  promptVersion?: string;
}

/**
 * Core LLM Provider interface matching PRD Section 9.
 */
export interface LLMProvider {
  /**
   * Generates a structured JSON object validated against a Zod schema.
   * Retries up to maxRetries (default 2) if schema validation fails,
   * appending the validation error to the follow-up prompt.
   */
  generateJSON<T>(args: GenerateJSONArgs<T>): Promise<T>;

  /**
   * Generates free-form text.
   */
  generateText(args: GenerateTextArgs): Promise<string>;
}

/**
 * Observability telemetry entry for each LLM call.
 * Invariant: Never contains full user data or PII.
 */
export interface LLMCallLog {
  id?: string;
  prompt_name: string;
  prompt_version: string;
  model: string;
  tier: LLMTier;
  latency_ms: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  success: boolean;
  error?: string;
  created_at: string;
}

export type LLMObservabilitySink = (log: LLMCallLog) => Promise<void> | void;

/**
 * Versioned prompt definition contract.
 */
export interface PromptDefinition<TInput, TOutput> {
  name: string;
  version: string;
  tier: LLMTier;
  schema: z.ZodType<TOutput, any, any>;
  system: string;
  buildUser: (input: TInput) => string;
}

export interface ProviderConfig {
  apiKey?: string;
  fastModel?: string;
  strongModel?: string;
  observabilitySink?: LLMObservabilitySink;
}
