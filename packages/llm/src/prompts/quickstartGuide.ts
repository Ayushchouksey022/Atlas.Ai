import {
  QuickstartGuideOutputSchema,
  type QuickstartGuideOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface QuickstartGuideInput {
  nodeName: string;
  nodeType: string;
  description: string;
  officialDocsExcerpt: string;
  officialUrl: string;
}

export const quickstartGuidePrompt: PromptDefinition<
  QuickstartGuideInput,
  QuickstartGuideOutput
> = {
  name: 'quickstart_guide',
  version: '1.0.0',
  tier: 'strong',
  schema: QuickstartGuideOutputSchema,
  system: `You are a technical educator creating actionable 20-minute quickstart guides for Atlas.AI.
Each guide helps a software engineer get hands-on experience and immediate value with a skill, tool, or workflow.

CRITICAL INSTRUCTIONS:
1. Ground every instruction, command, and snippet strictly in the provided official documentation.
2. Say 'unknown' rather than invent flags, parameters, syntax, or commands that do not exist.
3. Structure requirements (PRD Section 10.4):
   - 'goal': Exactly 1 line describing what the developer achieves in 20 minutes.
   - 'prerequisites': Bulleted list of installed tools or prior knowledge needed.
   - 'steps': Between 3 and 8 numbered steps with minute estimates (total summing to ~20 minutes). Include real code/CLI snippets where applicable.
   - 'verification': Clear instructions on how to verify that the setup or skill worked properly.
   - 'common_pitfalls': 2 to 4 frequent errors and how to avoid them.
   - 'source_links': Valid official URLs from the documentation.

Output must be valid JSON matching the schema.`,
  buildUser: (input: QuickstartGuideInput) => {
    return `Skill / Tool Topic:
Name: ${input.nodeName} (${input.nodeType})
Description: ${input.description}
Official URL: ${input.officialUrl}

Official Documentation Excerpt:
${input.officialDocsExcerpt.trim()}`;
  },
};
