import {
  VerdictOutputSchema,
  type VerdictOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface VerdictInput {
  title: string;
  bullets: string[];
  impact_score: number;
  tags: string[];
  candidateNodes: Array<{ slug: string; name: string }>;
  userRoadmapSlice: Array<{ slug: string; status: string }>;
  approvedSupersedes: Array<{ old_slug: string; new_slug: string }>;
}

export const verdictPrompt: PromptDefinition<VerdictInput, VerdictOutput> = {
  name: 'verdict_analysis',
  version: '1.0.0',
  tier: 'strong',
  schema: VerdictOutputSchema,
  system: `You are the core Red Button Verdict differential reasoning engine for Atlas.AI.
Analyze how an incoming software development advancement impacts a specific developer's roadmap slice.

CRITICAL INSTRUCTIONS:
1. Ground analysis strictly in the provided text, user roadmap slice, and approved supersedes links.
2. Say 'unknown' rather than invent capabilities, versions, flags, or unverified claims.
3. Verdict Definitions (PRD Section 9.2):
   - 'shield': The advancement is irrelevant to the developer's current roadmap, impact score is below 6, or does not warrant graph change. Roadmap remains unchanged.
   - 'injection': A high-impact breakthrough tool or skill that should be inserted as a new learning node. Set 'new_node_slug' and 'insert_after_slugs'.
   - 'override': An advancement that renders an existing roadmap node obsolete via an approved supersedes link. Set 'target_node_slug' (the node being replaced) and 'new_node_slug' (the replacement).
4. Strict Rules:
   - 'reasoning' must be concise and under 60 words (maximum 400 characters).
   - 'confidence' must be a float between 0.0 and 1.0.
   - If confidence is below 0.6 or evidence is insufficient, default to 'shield'.

Output must be valid JSON matching the schema.`,
  buildUser: (input: VerdictInput) => {
    const candidateStr = input.candidateNodes
      .map((c) => `- ${c.slug} ("${c.name}")`)
      .join('\n');

    const sliceStr = input.userRoadmapSlice
      .map((r) => `- ${r.slug}: [${r.status}]`)
      .join('\n');

    const supersedesStr = input.approvedSupersedes
      .map((s) => `- ${s.old_slug} is superseded by ${s.new_slug}`)
      .join('\n');

    return `News Item:
Title: ${input.title}
Impact Score: ${input.impact_score}/10
Key Points:
${input.bullets.map((b) => `• ${b}`).join('\n')}
Tags: ${input.tags.join(', ')}

Mapped Candidate Nodes:
${candidateStr || 'None'}

User Roadmap Slice (Active & Completed Nodes):
${sliceStr || 'Empty roadmap'}

Approved Supersedes Relations in Knowledge Graph:
${supersedesStr || 'None'}`;
  },
};
