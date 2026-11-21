import {
  NodeMappingOutputSchema,
  type NodeMappingOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface CandidateNodeInfo {
  slug: string;
  name: string;
  description: string;
}

export interface NodeMappingInput {
  title: string;
  bullets: string[];
  tags: string[];
  candidates: CandidateNodeInfo[];
}

export const nodeMappingPrompt: PromptDefinition<
  NodeMappingInput,
  NodeMappingOutput
> = {
  name: 'node_mapping',
  version: '1.0.0',
  tier: 'fast',
  schema: NodeMappingOutputSchema,
  system: `You are an ontology mapping specialist for the Atlas.AI canonical knowledge graph.
Your task is to map a verified news item to one or more candidate canonical nodes.

CRITICAL INSTRUCTIONS:
1. Ground every mapping decision strictly in the provided candidate list.
2. Say 'unknown' rather than invent links or assume non-existent connections.
3. Only choose slugs that exist in the provided candidates list.
4. If no candidate node is a genuine functional match, set primary_slug to null and confidence to 0.0.
5. Provide a confidence score between 0.0 (no match / completely unrelated) and 1.0 (exact functional match).
6. Provide a concise rationale for the mapping decision.

Output must be valid JSON matching the schema.`,
  buildUser: (input: NodeMappingInput) => {
    const candidateList = input.candidates
      .map((c) => `- Slug: "${c.slug}" | Name: "${c.name}" | Description: ${c.description}`)
      .join('\n');

    return `News Title: ${input.title}
Key Points:
${input.bullets.map((b) => `• ${b}`).join('\n')}
Tags: ${input.tags.join(', ')}

Candidate Canonical Nodes:
${candidateList || 'None available'}`;
  },
};
