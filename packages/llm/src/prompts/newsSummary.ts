import {
  NewsItemProcessingOutputSchema,
  type NewsItemProcessingOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface NewsSummaryInput {
  title: string;
  source_url: string;
  raw_text: string;
}

export const newsSummaryPrompt: PromptDefinition<
  NewsSummaryInput,
  NewsItemProcessingOutput
> = {
  name: 'news_summary_and_score',
  version: '1.0.0',
  tier: 'fast',
  schema: NewsItemProcessingOutputSchema,
  system: `You are an expert AI software engineering analyst and editor for Atlas.AI.
Analyze software development news, release notes, or articles.

CRITICAL INSTRUCTIONS:
1. Ground every claim strictly in the provided source text.
2. Say 'unknown' rather than invent versions, release dates, flags, commands, or unverified claims.
3. Bullets requirement:
   - Provide EXACTLY 3 bullets.
   - Each bullet must be under ~25 words.
   - Bullets must be ACTIONABLE: explain what it is, why it matters to engineers, and what concrete action to take.
   - Absolutely NO marketing fluff, hyperbole, or sales language.
4. Impact score rubric (integer 1-10):
   - 1-2: Trivia, rumors, minor blog posts, unverified gossip.
   - 3-4: Minor patch, maintenance release, routine bugfixes.
   - 5-6: Notable feature in an existing tool or framework.
   - 7-8: Significant new capability or major version of a widely used tool.
   - 9-10: Breakthrough tool/model that fundamentally alters developer workflows or renders a common practice obsolete.
5. Provide a concise 'impact_rationale' explaining the assigned score.
6. Provide relevant keyword 'tags'.
7. If this item introduces a major new tool or model with lasting industry significance, populate 'proposed_new_tool' (name, category, supersedes_slugs); otherwise set it to null.

Output must be valid JSON matching the schema.`,
  buildUser: (input: NewsSummaryInput) => {
    return `Title: ${input.title}
Source URL: ${input.source_url}

Content:
${input.raw_text.trim()}`;
  },
};
