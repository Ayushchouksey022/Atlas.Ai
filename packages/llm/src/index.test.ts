import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  MockProvider,
  OpenAIProvider,
  getLLMProvider,
  LLMValidationError,
  LLMProviderError,
  createCompositeSink,
  createSupabaseObservabilitySink,
  ConsoleObservabilitySink,
  newsSummaryPrompt,
  nodeMappingPrompt,
  verdictPrompt,
  graphChangeDraftPrompt,
  quickstartGuidePrompt,
  personalizationPrompt,
  type LLMCallLog,
} from './index';

describe('@repo/llm - Package Integration and Unit Tests', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('MockProvider & Deterministic Prompt Fixtures', () => {
    it('generates valid output for all 6 prompt definitions with MockProvider', async () => {
      const provider = new MockProvider();

      // 1. News Summary Prompt
      const newsOutput = await provider.generateJSON({
        tier: newsSummaryPrompt.tier,
        system: newsSummaryPrompt.system,
        user: newsSummaryPrompt.buildUser({
          title: 'Claude 3.5 Sonnet Release',
          source_url: 'https://anthropic.com/news',
          raw_text: 'Anthropic releases Claude 3.5 Sonnet with strong coding abilities.',
        }),
        schema: newsSummaryPrompt.schema,
        promptName: newsSummaryPrompt.name,
        promptVersion: newsSummaryPrompt.version,
      });
      expect(newsSummaryPrompt.schema.safeParse(newsOutput).success).toBe(true);
      expect(newsOutput.bullets).toHaveLength(3);
      expect(newsOutput.impact_score).toBeGreaterThanOrEqual(1);
      expect(newsOutput.impact_score).toBeLessThanOrEqual(10);

      // 2. Node Mapping Prompt
      const mappingOutput = await provider.generateJSON({
        tier: nodeMappingPrompt.tier,
        system: nodeMappingPrompt.system,
        user: nodeMappingPrompt.buildUser({
          title: 'Cursor editor update',
          bullets: ['Cursor introduces new agent mode.'],
          tags: ['editors', 'ai'],
          candidates: [
            {
              slug: 'cursor-ide',
              name: 'Cursor IDE',
              description: 'AI-assisted code editor',
            },
          ],
        }),
        schema: nodeMappingPrompt.schema,
        promptName: nodeMappingPrompt.name,
        promptVersion: nodeMappingPrompt.version,
      });
      expect(nodeMappingPrompt.schema.safeParse(mappingOutput).success).toBe(true);
      expect(mappingOutput.primary_slug).toBe('cursor-ide');

      // 3. Verdict Prompt
      const verdictOutput = await provider.generateJSON({
        tier: verdictPrompt.tier,
        system: verdictPrompt.system,
        user: verdictPrompt.buildUser({
          title: 'Cursor editor update',
          bullets: ['Cursor introduces new agent mode.'],
          impact_score: 8,
          tags: ['editors', 'ai'],
          candidateNodes: [{ slug: 'cursor-ide', name: 'Cursor IDE' }],
          userRoadmapSlice: [{ slug: 'cursor-ide', status: 'available' }],
          approvedSupersedes: [],
        }),
        schema: verdictPrompt.schema,
        promptName: verdictPrompt.name,
        promptVersion: verdictPrompt.version,
      });
      expect(verdictPrompt.schema.safeParse(verdictOutput).success).toBe(true);
      expect(['shield', 'injection', 'override']).toContain(verdictOutput.verdict);

      // 4. Graph Change Draft Prompt
      const graphDraftOutput = await provider.generateJSON({
        tier: graphChangeDraftPrompt.tier,
        system: graphChangeDraftPrompt.system,
        user: graphChangeDraftPrompt.buildUser({
          toolName: 'Agentic CLI',
          category: 'ai-assistants',
          description: 'Standalone CLI developer agent',
          sourceExcerpt: 'Official announcement of Agentic CLI tool',
          existingNodeSlugs: ['terminal-basics'],
        }),
        schema: graphChangeDraftPrompt.schema,
        promptName: graphChangeDraftPrompt.name,
        promptVersion: graphChangeDraftPrompt.version,
      });
      expect(
        graphChangeDraftPrompt.schema.safeParse(graphDraftOutput).success,
      ).toBe(true);
      expect(graphDraftOutput.proposed_node.slug).toBe('agentic-cli');

      // 5. Quickstart Guide Prompt
      const guideOutput = await provider.generateJSON({
        tier: quickstartGuidePrompt.tier,
        system: quickstartGuidePrompt.system,
        user: quickstartGuidePrompt.buildUser({
          nodeName: 'Cursor IDE',
          nodeType: 'tool',
          description: 'AI editor',
          officialDocsExcerpt: 'Install cursor from official docs.',
          officialUrl: 'https://cursor.com/docs',
        }),
        schema: quickstartGuidePrompt.schema,
        promptName: quickstartGuidePrompt.name,
        promptVersion: quickstartGuidePrompt.version,
      });
      expect(quickstartGuidePrompt.schema.safeParse(guideOutput).success).toBe(
        true,
      );
      expect(guideOutput.steps.length).toBeGreaterThanOrEqual(3);

      // 6. Personalization Prompt
      const personalizationOutput = await provider.generateJSON({
        tier: personalizationPrompt.tier,
        system: personalizationPrompt.system,
        user: personalizationPrompt.buildUser({
          node: {
            slug: 'cursor-ide',
            name: 'Cursor IDE',
            description: 'AI Code Editor',
            area: 'editors-ides',
            level: 1,
            node_type: 'tool',
          },
          user_profile: {
            experience_levels: { 'editors-ides': 'working' },
          },
        }),
        schema: personalizationPrompt.schema,
        promptName: personalizationPrompt.name,
        promptVersion: personalizationPrompt.version,
      });
      expect(
        personalizationPrompt.schema.safeParse(personalizationOutput).success,
      ).toBe(true);
      expect(personalizationOutput.node_slug).toBe('cursor-ide');
    });

    it('generates deterministic free-form text with generateText', async () => {
      const provider = new MockProvider();
      const text = await provider.generateText({
        tier: 'fast',
        system: 'You are an assistant',
        user: 'Hello world',
      });
      expect(text).toContain('Deterministic mock text response');
    });
  });

  describe('Retry Logic & Schema Validation Failures', () => {
    it('retries when response is invalid JSON and succeeds on subsequent valid attempt', async () => {
      const provider = new MockProvider();
      provider
        .enqueueResponse('not a valid json string')
        .enqueueResponse(
          JSON.stringify({
            count: 42,
            message: 'success on retry',
          }),
        );

      const targetSchema = z.object({
        count: z.number(),
        message: z.string(),
      });

      const result = await provider.generateJSON({
        tier: 'fast',
        system: 'system prompt',
        user: 'user prompt',
        schema: targetSchema,
        maxRetries: 2,
      });

      expect(result).toEqual({
        count: 42,
        message: 'success on retry',
      });

      const history = provider.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1].user).toContain('[PREVIOUS ATTEMPT FAILED]');
      expect(history[1].user).toContain('Your previous output was not valid JSON');
    });

    it('retries when response fails Zod schema validation and succeeds on subsequent attempt', async () => {
      const provider = new MockProvider();
      provider
        .enqueueResponse(
          JSON.stringify({
            score: 999, // Fails schema (max 10)
          }),
        )
        .enqueueResponse(
          JSON.stringify({
            score: 7,
          }),
        );

      const targetSchema = z.object({
        score: z.number().int().min(1).max(10),
      });

      const result = await provider.generateJSON({
        tier: 'fast',
        system: 'system prompt',
        user: 'rate this score',
        schema: targetSchema,
        maxRetries: 2,
      });

      expect(result).toEqual({ score: 7 });

      const history = provider.getHistory();
      expect(history).toHaveLength(2);
      expect(history[1].user).toContain(
        '[PREVIOUS ATTEMPT FAILED SCHEMA VALIDATION]',
      );
    });

    it('throws LLMValidationError after exceeding maxRetries', async () => {
      const provider = new MockProvider();
      // Enqueue 3 bad responses (attempt 0 + 2 retries)
      provider
        .enqueueResponse(JSON.stringify({ score: 100 }))
        .enqueueResponse(JSON.stringify({ score: 200 }))
        .enqueueResponse(JSON.stringify({ score: 300 }));

      const targetSchema = z.object({
        score: z.number().int().min(1).max(10),
      });

      await expect(
        provider.generateJSON({
          tier: 'fast',
          system: 'system prompt',
          user: 'rate this score',
          schema: targetSchema,
          maxRetries: 2,
          promptName: 'test_score_prompt',
          promptVersion: '2.1.0',
        }),
      ).rejects.toThrowError(LLMValidationError);

      const history = provider.getHistory();
      expect(history).toHaveLength(3); // 1 initial + 2 retries
    });
  });

  describe('Anti-hallucination Invariant across all Prompts', () => {
    it('enforces the anti-hallucination instruction across all 6 system prompts', () => {
      const prompts = [
        newsSummaryPrompt,
        nodeMappingPrompt,
        verdictPrompt,
        graphChangeDraftPrompt,
        quickstartGuidePrompt,
        personalizationPrompt,
      ];

      for (const prompt of prompts) {
        const lowerSystem = prompt.system.toLowerCase();
        const hasAntiHallucination =
          lowerSystem.includes("say 'unknown'") ||
          lowerSystem.includes('say unknown') ||
          lowerSystem.includes('do not invent') ||
          lowerSystem.includes('never invent');

        expect(
          hasAntiHallucination,
          `Prompt '${prompt.name}' must enforce anti-hallucination instructions`,
        ).toBe(true);
      }
    });
  });

  describe('Observability & Non-PII Logging', () => {
    it('dispatches metrics to custom sink without logging user PII', async () => {
      const recordedLogs: LLMCallLog[] = [];
      const testSink = (log: LLMCallLog) => {
        recordedLogs.push(log);
      };

      const provider = new MockProvider({
        observabilitySink: testSink,
      });

      await provider.generateJSON({
        tier: 'fast',
        system: 'You are a bot',
        user: 'Sensitive user input with password=secret123 and email=dev@company.com',
        schema: z.object({ status: z.string() }),
        promptName: 'login_helper',
        promptVersion: '1.0.0',
      });

      expect(recordedLogs).toHaveLength(1);
      const log = recordedLogs[0];
      expect(log.prompt_name).toBe('login_helper');
      expect(log.prompt_version).toBe('1.0.0');
      expect(log.tier).toBe('fast');
      expect(log.success).toBe(true);
      expect(log.latency_ms).toBeGreaterThanOrEqual(0);
      expect(log.total_tokens).toBe(75);

      // Verify Non-PII guarantee: Log object must not contain user text or prompt body
      const logKeys = Object.keys(log);
      expect(logKeys).not.toContain('user');
      expect(logKeys).not.toContain('input');
      expect(logKeys).not.toContain('system');
      expect(logKeys).not.toContain('prompt');
      expect(JSON.stringify(log)).not.toContain('secret123');
      expect(JSON.stringify(log)).not.toContain('dev@company.com');
    });

    it('createSupabaseObservabilitySink writes telemetry rows to llm_calls table', async () => {
      const insertedRows: Array<Record<string, unknown>> = [];
      const fakeSupabase = {
        from: (table: string) => ({
          insert: async (row: Record<string, unknown>) => {
            if (table === 'llm_calls') {
              insertedRows.push(row);
            }
            return { error: null };
          },
        }),
      };

      const sink = createSupabaseObservabilitySink(fakeSupabase);
      await sink({
        prompt_name: 'test_prompt',
        prompt_version: '1.0.0',
        model: 'gpt-4o',
        tier: 'strong',
        latency_ms: 120,
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150,
        success: true,
        created_at: new Date().toISOString(),
      });

      expect(insertedRows).toHaveLength(1);
      expect(insertedRows[0].prompt_name).toBe('test_prompt');
      expect(insertedRows[0].model).toBe('gpt-4o');
      expect(insertedRows[0].tier).toBe('strong');
    });

    it('createCompositeSink notifies multiple sinks in parallel', async () => {
      const sink1Logs: LLMCallLog[] = [];
      const sink2Logs: LLMCallLog[] = [];

      const composite = createCompositeSink([
        (log) => {
          sink1Logs.push(log);
        },
        (log) => {
          sink2Logs.push(log);
        },
        ConsoleObservabilitySink,
      ]);

      const logEntry: LLMCallLog = {
        prompt_name: 'composite_test',
        prompt_version: '1.0.0',
        model: 'gpt-4o-mini',
        tier: 'fast',
        latency_ms: 55,
        success: true,
        created_at: new Date().toISOString(),
      };

      await composite(logEntry);

      expect(sink1Logs).toHaveLength(1);
      expect(sink2Logs).toHaveLength(1);
      expect(sink1Logs[0].prompt_name).toBe('composite_test');
    });
  });

  describe('OpenAIProvider Adapter', () => {
    it('throws LLMProviderError if API key is missing', async () => {
      const originalApiKey = process.env.LLM_API_KEY;
      const originalOpenAIApiKey = process.env.OPENAI_API_KEY;
      delete process.env.LLM_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = new OpenAIProvider({ apiKey: '' });

      await expect(
        provider.generateText({
          tier: 'fast',
          system: 'test',
          user: 'test',
        }),
      ).rejects.toThrowError(LLMProviderError);

      process.env.LLM_API_KEY = originalApiKey;
      process.env.OPENAI_API_KEY = originalOpenAIApiKey;
    });

    it('calls fetch with bearer authorization and returns parsed text', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: '{"hello":"world"}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const provider = new OpenAIProvider({ apiKey: 'test-key-123' });
      const result = await provider.generateJSON({
        tier: 'fast',
        system: 'System prompt',
        user: 'User prompt',
        schema: z.object({ hello: z.string() }),
      });

      expect(result).toEqual({ hello: 'world' });
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const [url, requestInit] = mockFetch.mock.calls[0];
      expect(url).toContain('https://api.openai.com/v1/chat/completions');
      expect(requestInit.headers.Authorization).toBe('Bearer test-key-123');
      const body = JSON.parse(requestInit.body);
      expect(body.response_format).toEqual({ type: 'json_object' });
    });
  });

  describe('Provider Factory', () => {
    it('returns MockProvider when provider is mock or unspecified', () => {
      const provider1 = getLLMProvider({ provider: 'mock' });
      expect(provider1).toBeInstanceOf(MockProvider);

      const provider2 = getLLMProvider({});
      expect(provider2).toBeInstanceOf(MockProvider);
    });

    it('returns OpenAIProvider when provider is openai', () => {
      const provider = getLLMProvider({ provider: 'openai', apiKey: 'test' });
      expect(provider).toBeInstanceOf(OpenAIProvider);
    });
  });
});
