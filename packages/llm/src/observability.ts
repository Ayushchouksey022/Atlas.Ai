import type { LLMCallLog, LLMObservabilitySink } from './types';

/**
 * Default development console sink: logs concise non-PII metrics.
 */
export const ConsoleObservabilitySink: LLMObservabilitySink = (log: LLMCallLog) => {
  const statusIcon = log.success ? '✓' : '✗';
  const tokenInfo =
    log.total_tokens !== undefined ? ` | ${log.total_tokens} tokens` : '';
  const errorInfo = log.error ? ` | Error: ${log.error}` : '';

  // In production, keep output compact. In development, format clearly.
  if (process.env.NODE_ENV !== 'production' || process.env.DEBUG_LLM) {
    console.log(
      `[LLM ${statusIcon}] ${log.prompt_name} (v${log.prompt_version}) | ${log.model} [${log.tier}] | ${log.latency_ms}ms${tokenInfo}${errorInfo}`,
    );
  }
};

/**
 * Dispatches an LLM call log to multiple observability sinks in parallel.
 */
export function createCompositeSink(
  sinks: LLMObservabilitySink[],
): LLMObservabilitySink {
  return async (log: LLMCallLog) => {
    await Promise.allSettled(sinks.map((sink) => sink(log)));
  };
}

/**
 * Creates a sink that writes to the Supabase `llm_calls` table.
 * Takes a supabase client instance to avoid tightly coupling this package.
 */
export function createSupabaseObservabilitySink(supabaseClient: {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  };
}): LLMObservabilitySink {
  return async (log: LLMCallLog) => {
    try {
      await supabaseClient.from('llm_calls').insert({
        prompt_name: log.prompt_name,
        prompt_version: log.prompt_version,
        model: log.model,
        tier: log.tier,
        latency_ms: log.latency_ms,
        prompt_tokens: log.prompt_tokens ?? null,
        completion_tokens: log.completion_tokens ?? null,
        total_tokens: log.total_tokens ?? null,
        success: log.success,
        error: log.error ?? null,
        created_at: log.created_at,
      });
    } catch {
      // Non-blocking telemetry failure: never break caller workflow
    }
  };
}
