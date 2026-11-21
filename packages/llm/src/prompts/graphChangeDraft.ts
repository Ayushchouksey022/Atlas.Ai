import {
  GraphChangeDraftOutputSchema,
  type GraphChangeDraftOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface GraphChangeDraftInput {
  toolName: string;
  category: string;
  description: string;
  sourceExcerpt: string;
  existingNodeSlugs: string[];
}

export const graphChangeDraftPrompt: PromptDefinition<
  GraphChangeDraftInput,
  GraphChangeDraftOutput
> = {
  name: 'graph_change_draft',
  version: '1.0.0',
  tier: 'strong',
  schema: GraphChangeDraftOutputSchema,
  system: `You are an expert curriculum architect and knowledge graph curator for Atlas.AI.
Your task is to draft a proposed new canonical node and connecting prerequisite edges for the editorial queue.

CRITICAL INSTRUCTIONS:
1. Ground all proposed attributes and relationships strictly in the provided source material.
2. Say 'unknown' rather than invent version numbers, release dates, commands, or unsupported features.
3. Node slug must be lowercase alphanumeric with hyphens (kebab-case).
4. Area must be one of: 'editors-ides', 'ai-assistants', 'languages-frameworks', 'testing', 'deployment', 'agents-automation'.
5. Level must be an integer from 0 to 4 consistent with prerequisites (level > prerequisite levels).
6. Edges must link to valid existing node slugs or from the newly proposed node.
7. Include any known tools that this new advancement supersedes.
8. Provide a clear editorial rationale explaining why this node belongs in the canonical graph.

Output must be valid JSON matching the schema.`,
  buildUser: (input: GraphChangeDraftInput) => {
    return `Proposed Advancement:
Name: ${input.toolName}
Category: ${input.category}
Summary: ${input.description}

Source Evidence:
${input.sourceExcerpt.trim()}

Existing Canonical Node Slugs (Reference for Prerequisite Edges):
${input.existingNodeSlugs.slice(0, 30).join(', ')}${
      input.existingNodeSlugs.length > 30 ? '... (and more)' : ''
    }`;
  },
};
