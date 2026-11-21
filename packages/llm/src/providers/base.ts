import { z } from 'zod';
import { LLMValidationError } from '../errors';
import type {
  GenerateJSONArgs,
  GenerateTextArgs,
  LLMCallLog,
  LLMObservabilitySink,
  LLMProvider,
  LLMTier,
  ProviderConfig,
} from '../types';

export abstract class BaseLLMProvider implements LLMProvider {
  protected fastModel: string;
  protected strongModel: string;
  protected sink?: LLMObservabilitySink;

  constructor(
    config?: ProviderConfig,
    defaults?: { fastModel: string; strongModel: string },
  ) {
    this.fastModel =
      config?.fastModel ||
      process.env.LLM_MODEL_FAST ||
      defaults?.fastModel ||
      'gpt-4o-mini';
    this.strongModel =
      config?.strongModel ||
      process.env.LLM_MODEL_STRONG ||
      defaults?.strongModel ||
      'gpt-4o';
    this.sink = config?.observabilitySink;
  }

  protected resolveModel(tier: LLMTier): string {
    return tier === 'fast' ? this.fastModel : this.strongModel;
  }

  protected async recordTelemetry(log: LLMCallLog): Promise<void> {
    if (this.sink) {
      try {
        await this.sink(log);
      } catch (err) {
        // Observability failures should not break the execution flow
        console.error('[LLMTelemetryError]', err);
      }
    }
  }

  /**
   * Concrete adapter implements raw invocation against model provider or mock engine.
   */
  protected abstract executeCall(args: {
    tier: LLMTier;
    model: string;
    system: string;
    user: string;
    jsonMode?: boolean;
    promptName?: string;
  }): Promise<{
    text: string;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  }>;

  async generateText(args: GenerateTextArgs): Promise<string> {
    const model = this.resolveModel(args.tier);
    const startTime = performance.now();
    const promptName = args.promptName || 'unnamed_text';
    const promptVersion = args.promptVersion || '1.0.0';

    try {
      const result = await this.executeCall({
        tier: args.tier,
        model,
        system: args.system,
        user: args.user,
        jsonMode: false,
        promptName,
      });

      const latencyMs = Math.round(performance.now() - startTime);

      await this.recordTelemetry({
        prompt_name: promptName,
        prompt_version: promptVersion,
        model,
        tier: args.tier,
        latency_ms: latencyMs,
        prompt_tokens: result.usage?.prompt_tokens,
        completion_tokens: result.usage?.completion_tokens,
        total_tokens: result.usage?.total_tokens,
        success: true,
        created_at: new Date().toISOString(),
      });

      return result.text;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - startTime);

      await this.recordTelemetry({
        prompt_name: promptName,
        prompt_version: promptVersion,
        model,
        tier: args.tier,
        latency_ms: latencyMs,
        success: false,
        error: (err as Error).message,
        created_at: new Date().toISOString(),
      });

      throw err;
    }
  }

  async generateJSON<T>(args: GenerateJSONArgs<T>): Promise<T> {
    const model = this.resolveModel(args.tier);
    const maxRetries = args.maxRetries ?? 2;
    const promptName = args.promptName || 'unnamed_json';
    const promptVersion = args.promptVersion || '1.0.0';

    const startTime = performance.now();
    let currentUserPrompt = args.user;
    let lastRawOutput = '';
    let lastValidationErrors: z.ZodIssue[] = [];
    let cumulativePromptTokens = 0;
    let cumulativeCompletionTokens = 0;
    let cumulativeTotalTokens = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      let callResult: {
        text: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      try {
        callResult = await this.executeCall({
          tier: args.tier,
          model,
          system: args.system,
          user: currentUserPrompt,
          jsonMode: true,
          promptName,
        });

        if (callResult.usage) {
          cumulativePromptTokens += callResult.usage.prompt_tokens ?? 0;
          cumulativeCompletionTokens += callResult.usage.completion_tokens ?? 0;
          cumulativeTotalTokens += callResult.usage.total_tokens ?? 0;
        }
      } catch (err) {
        // Provider network/auth errors shouldn't be masked as retry validation failures
        const latencyMs = Math.round(performance.now() - startTime);
        await this.recordTelemetry({
          prompt_name: promptName,
          prompt_version: promptVersion,
          model,
          tier: args.tier,
          latency_ms: latencyMs,
          prompt_tokens: cumulativePromptTokens || undefined,
          completion_tokens: cumulativeCompletionTokens || undefined,
          total_tokens: cumulativeTotalTokens || undefined,
          success: false,
          error: (err as Error).message,
          created_at: new Date().toISOString(),
        });
        throw err;
      }

      lastRawOutput = callResult.text;

      // 1. Parse JSON
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(callResult.text);
      } catch (err) {
        lastValidationErrors = [
          {
            code: z.ZodIssueCode.custom,
            message: `Output was not valid JSON: ${(err as Error).message}`,
            path: [],
          },
        ];

        if (attempt < maxRetries) {
          currentUserPrompt = `${args.user}

[PREVIOUS ATTEMPT FAILED]
Your previous output was not valid JSON:
${(err as Error).message}

Raw output was:
${callResult.text.slice(0, 500)}

Please output strictly valid, well-formed JSON conforming to the schema.`;
          continue;
        }

        break;
      }

      // 2. Validate with Zod Schema
      const validationResult = args.schema.safeParse(parsedJson);
      if (validationResult.success) {
        const latencyMs = Math.round(performance.now() - startTime);
        await this.recordTelemetry({
          prompt_name: promptName,
          prompt_version: promptVersion,
          model,
          tier: args.tier,
          latency_ms: latencyMs,
          prompt_tokens: cumulativePromptTokens || undefined,
          completion_tokens: cumulativeCompletionTokens || undefined,
          total_tokens: cumulativeTotalTokens || undefined,
          success: true,
          created_at: new Date().toISOString(),
        });
        return validationResult.data;
      }

      lastValidationErrors = validationResult.error.issues;

      if (attempt < maxRetries) {
        const issuesSummary = lastValidationErrors
          .map(
            (issue) =>
              `- [${issue.path.join('.') || 'root'}]: ${issue.message}`,
          )
          .join('\n');

        currentUserPrompt = `${args.user}

[PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION]
Your previous output failed validation:
${issuesSummary}

Please correct the issues and output strictly valid JSON conforming to the schema.`;
      }
    }

    const latencyMs = Math.round(performance.now() - startTime);
    const validationError = new LLMValidationError({
      promptName,
      promptVersion,
      rawOutput: lastRawOutput,
      validationErrors: lastValidationErrors,
      attempts: maxRetries + 1,
    });

    await this.recordTelemetry({
      prompt_name: promptName,
      prompt_version: promptVersion,
      model,
      tier: args.tier,
      latency_ms: latencyMs,
      prompt_tokens: cumulativePromptTokens || undefined,
      completion_tokens: cumulativeCompletionTokens || undefined,
      total_tokens: cumulativeTotalTokens || undefined,
      success: false,
      error: validationError.message,
      created_at: new Date().toISOString(),
    });

    throw validationError;
  }
}
