import type { z } from 'zod';

export interface LLMValidationErrorDetails {
  promptName?: string;
  promptVersion?: string;
  rawOutput: string;
  validationErrors: z.ZodIssue[];
  attempts: number;
}

/**
 * Thrown when an LLM output fails schema validation after all retry attempts.
 */
export class LLMValidationError extends Error {
  readonly promptName?: string;
  readonly promptVersion?: string;
  readonly rawOutput: string;
  readonly validationErrors: z.ZodIssue[];
  readonly attempts: number;

  constructor(details: LLMValidationErrorDetails) {
    const issuesSummary = details.validationErrors
      .map((issue) => `[${issue.path.join('.') || 'root'}]: ${issue.message}`)
      .join('; ');

    super(
      `LLM output for '${details.promptName || 'unnamed'}' (v${
        details.promptVersion || '1.0'
      }) failed schema validation after ${details.attempts} attempts: ${issuesSummary}`,
    );

    this.name = 'LLMValidationError';
    this.promptName = details.promptName;
    this.promptVersion = details.promptVersion;
    this.rawOutput = details.rawOutput;
    this.validationErrors = details.validationErrors;
    this.attempts = details.attempts;

    Object.setPrototypeOf(this, LLMValidationError.prototype);
  }
}

/**
 * Thrown when an underlying LLM provider fails due to network, rate-limit, or API error.
 */
export class LLMProviderError extends Error {
  readonly statusCode?: number;
  readonly provider: string;

  constructor(message: string, provider: string, statusCode?: number) {
    super(`[${provider}] ${message}`);
    this.name = 'LLMProviderError';
    this.provider = provider;
    this.statusCode = statusCode;

    Object.setPrototypeOf(this, LLMProviderError.prototype);
  }
}
