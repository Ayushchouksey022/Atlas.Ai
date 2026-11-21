import { LLMProviderError } from '../errors';
import type { LLMTier, ProviderConfig } from '../types';
import { BaseLLMProvider } from './base';

export interface OpenAIProviderConfig extends ProviderConfig {
  baseUrl?: string;
}

export class OpenAIProvider extends BaseLLMProvider {
  private apiKey?: string;
  private baseUrl: string;

  constructor(config?: OpenAIProviderConfig) {
    super(config, {
      fastModel: 'gpt-4o-mini',
      strongModel: 'gpt-4o',
    });

    this.apiKey =
      config?.apiKey ||
      process.env.LLM_API_KEY ||
      process.env.OPENAI_API_KEY;

    this.baseUrl =
      config?.baseUrl ||
      process.env.OPENAI_BASE_URL ||
      'https://api.openai.com/v1';
  }

  protected async executeCall(args: {
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
  }> {
    if (!this.apiKey) {
      throw new LLMProviderError(
        'Missing OpenAI API key. Please set LLM_API_KEY or OPENAI_API_KEY.',
        'openai',
        401,
      );
    }

    const payload: Record<string, unknown> = {
      model: args.model,
      messages: [
        { role: 'system', content: args.system },
        { role: 'user', content: args.user },
      ],
      temperature: 0.2,
    };

    if (args.jsonMode) {
      payload.response_format = { type: 'json_object' };
    }

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      throw new LLMProviderError(
        `Network error communicating with OpenAI: ${(err as Error).message}`,
        'openai',
      );
    }

    if (!response.ok) {
      let errorBody = '';
      try {
        errorBody = await response.text();
      } catch {
        errorBody = response.statusText;
      }
      throw new LLMProviderError(
        `OpenAI API request failed (${response.status}): ${errorBody}`,
        'openai',
        response.status,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    };

    const text = data.choices?.[0]?.message?.content || '';

    return {
      text,
      usage: data.usage,
    };
  }
}
