import type { LLMTier, ProviderConfig } from '../types';
import { BaseLLMProvider } from './base';

export interface MockProviderConfig extends ProviderConfig {
  defaultResponses?: Record<string, unknown>;
}

export class MockProvider extends BaseLLMProvider {
  private responseQueue: string[] = [];
  private callHistory: Array<{
    tier: LLMTier;
    model: string;
    system: string;
    user: string;
    jsonMode?: boolean;
    promptName?: string;
  }> = [];

  constructor(config?: MockProviderConfig) {
    super(config, {
      fastModel: 'mock-fast-model',
      strongModel: 'mock-strong-model',
    });
  }

  /**
   * Enqueue one or more canned responses for subsequent executeCall invocations.
   * Useful for testing retry behavior (e.g. invalid response followed by valid response).
   */
  enqueueResponse(response: string | Record<string, unknown>): this {
    if (typeof response === 'string') {
      this.responseQueue.push(response);
    } else {
      this.responseQueue.push(JSON.stringify(response));
    }
    return this;
  }

  /**
   * Clear any enqueued responses and reset history.
   */
  reset(): void {
    this.responseQueue = [];
    this.callHistory = [];
  }

  getHistory(): ReadonlyArray<{
    tier: LLMTier;
    model: string;
    system: string;
    user: string;
    jsonMode?: boolean;
    promptName?: string;
  }> {
    return this.callHistory;
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
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  }> {
    this.callHistory.push(args);

    let text: string;

    if (this.responseQueue.length > 0) {
      text = this.responseQueue.shift()!;
    } else if (args.jsonMode) {
      text = JSON.stringify(
        this.getDeterministicFixture(args.user, args.system, args.promptName),
      );
    } else {
      text = 'Deterministic mock text response for Atlas.AI.';
    }

    return {
      text,
      usage: {
        prompt_tokens: 50,
        completion_tokens: 25,
        total_tokens: 75,
      },
    };
  }

  private getDeterministicFixture(
    user: string,
    system: string,
    promptName?: string,
  ): Record<string, unknown> {
    const combined = `${promptName || ''}\n${system}\n${user}`.toLowerCase();

    // 1. Node Mapping
    if (
      promptName === 'node_mapping' ||
      combined.includes('node_mapping') ||
      combined.includes('ontology mapping specialist')
    ) {
      return {
        candidate_slugs: ['cursor-ide', 'copilot-edits'],
        primary_slug: 'cursor-ide',
        confidence: 0.95,
        rationale: 'Direct reference to modern AI-assisted editor capabilities.',
      };
    }

    // 2. News Summary & Score (PRD 9.1)
    if (
      promptName === 'news_summary_and_score' ||
      combined.includes('news_summary') ||
      combined.includes('impact_score')
    ) {
      return {
        bullets: [
          'Anthropic introduced Claude 3.5 Sonnet with enhanced coding benchmarks.',
          'Features significant speed improvements for developer agentic loops.',
          'Adopt in test environments to evaluate code refactoring speedups.',
        ],
        impact_score: 8,
        impact_rationale:
          'Major capability improvement in state-of-the-art coding assistance.',
        tags: ['ai-assistants', 'llm', 'anthropic'],
        proposed_new_tool: null,
      };
    }

    // 3. Verdict Output (PRD 9.2)
    if (combined.includes('verdict') || combined.includes('insert_after_slugs')) {
      return {
        verdict: 'shield',
        new_node_slug: null,
        target_node_slug: 'cursor-ide',
        insert_after_slugs: [],
        reasoning: 'Stable, proven tool pattern with backward compatibility intact.',
        confidence: 0.92,
      };
    }

    // 4. Graph Change Draft
    if (combined.includes('graph change') || combined.includes('proposed_node')) {
      return {
        proposed_node: {
          slug: 'agentic-cli',
          name: 'Agentic CLI Assistant',
          description: 'Autonomous command line developer agent',
          node_type: 'tool',
          level: 2,
          area: 'ai-assistants',
        },
        proposed_edges: [
          {
            from_slug: 'terminal-basics',
            to_slug: 'agentic-cli',
          },
        ],
        supersedes_slugs: [],
        rationale: 'Represents a standalone autonomous CLI category addition.',
      };
    }

    // 5. Quickstart Guide (PRD 10.4)
    if (combined.includes('quickstart') || combined.includes('steps') || combined.includes('step_number')) {
      return {
        goal: 'Set up and execute your first prompt-driven refactor in under 20 minutes.',
        prerequisites: ['Node.js 20+', 'Git repository initialized'],
        steps: [
          {
            step_number: 1,
            title: 'Install package dependencies',
            instruction: 'Run pnpm install in your project root.',
            estimated_minutes: 3,
            code_snippet: 'pnpm install',
          },
          {
            step_number: 2,
            title: 'Configure environment variables',
            instruction: 'Copy .env.example to .env.local and populate credentials.',
            estimated_minutes: 4,
            code_snippet: 'cp .env.example .env.local',
          },
          {
            step_number: 3,
            title: 'Execute first workflow test',
            instruction: 'Run the test suite to verify connectivity and setup.',
            estimated_minutes: 5,
            code_snippet: 'pnpm test',
          },
        ],
        verification: 'Check that all 3 steps pass with zero exit codes.',
        common_pitfalls: [
          'Using Node 18 or older',
          'Omitting required environment keys',
        ],
        source_links: ['https://example.com/docs'],
      };
    }

    // 6. Personalization Annotation
    if (combined.includes('personalization') || combined.includes('relevance_note')) {
      return {
        node_slug: 'cursor-ide',
        relevance_note: 'Essential accelerator tailored to your working level in editors.',
        recommended_priority: 'high',
        tailored_tips: [
          'Leverage codebase indexing to ground multi-file refactors.',
          'Map keybindings for rapid inline diff review.',
        ],
      };
    }

    // Generic fallback valid JSON
    return {
      status: 'ok',
      mock: true,
      timestamp: new Date().toISOString(),
    };
  }
}
