/**
 * Manual smoke script for testing real LLM provider connectivity.
 * Usage: pnpm llm:smoke
 * Runs against real provider if LLM_API_KEY / OPENAI_API_KEY is present.
 */
import { newsSummaryPrompt } from './prompts/newsSummary';
import { OpenAIProvider } from './providers/openai';

async function main() {
  const apiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    console.log(
      '⚠️  [llm:smoke] Skipped: No LLM_API_KEY or OPENAI_API_KEY found in environment.',
    );
    console.log(
      'To run the live smoke test against OpenAI, provide LLM_API_KEY=<key> pnpm llm:smoke',
    );
    process.exit(0);
  }

  console.log('🚀 [llm:smoke] Running smoke test against OpenAI provider...');

  const provider = new OpenAIProvider({
    apiKey,
  });

  const sampleInput = {
    title: 'TypeScript 5.6 Released',
    source_url: 'https://devblogs.microsoft.com/typescript/announcing-typescript-5-6/',
    raw_text: `Today we are thrilled to announce the release of TypeScript 5.6!
This release introduces disallowed nullish and truthy checks to catch always-true or always-false comparisons,
iterator helper methods, and new build optimizations.`,
  };

  const userPrompt = newsSummaryPrompt.buildUser(sampleInput);

  try {
    const result = await provider.generateJSON({
      tier: newsSummaryPrompt.tier,
      system: newsSummaryPrompt.system,
      user: userPrompt,
      schema: newsSummaryPrompt.schema,
      promptName: newsSummaryPrompt.name,
      promptVersion: newsSummaryPrompt.version,
    });

    console.log('✅ [llm:smoke] Received and validated output successfully:');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('❌ [llm:smoke] Call failed:', err);
    process.exit(1);
  }
}

void main();
