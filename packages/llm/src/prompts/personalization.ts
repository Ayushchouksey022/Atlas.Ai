import {
  PersonalizationAnnotationOutputSchema,
  type PersonalizationAnnotationOutput,
} from '@repo/schemas';
import type { PromptDefinition } from '../types';

export interface PersonalizationAnnotationInput {
  node: {
    slug: string;
    name: string;
    description: string;
    area: string;
    level: number;
    node_type: string;
  };
  user_profile: {
    experience_levels: Record<string, string>;
    known_nodes?: string[];
  };
}

export const personalizationPrompt: PromptDefinition<
  PersonalizationAnnotationInput,
  PersonalizationAnnotationOutput
> = {
  name: 'personalization_annotation',
  version: '1.0.0',
  tier: 'fast',
  schema: PersonalizationAnnotationOutputSchema,
  system: `You are an expert engineering mentor and curriculum specialist for Atlas.AI.
Your task is to generate personalized learning notes, priority, and actionable tips for a roadmap node based on an engineer's existing stack and experience level.

CRITICAL INSTRUCTIONS:
1. Ground every claim strictly in the provided node metadata and developer background.
2. Say 'unknown' rather than invent versions, flags, CLI options, or unverified claims.
3. Tailor the advice directly to the user's experience in this area and adjacent skills.
4. If the user is beginner in this area, prioritize foundational mental models and safe onboarding.
5. If the user is working or expert, highlight differences, advanced productivity shortcuts, or migration nuances from tools they already know.
6. Provide a concise 'relevance_note' explaining why this node matters to their personal trajectory.
7. Recommend a priority: 'high', 'medium', or 'low'.
8. Provide 1-3 concrete, high-signal 'tailored_tips'.

Output must be valid JSON matching the schema.`,
  buildUser: (input: PersonalizationAnnotationInput) => {
    return `Roadmap Node:
- Slug: ${input.node.slug}
- Name: ${input.node.name}
- Type: ${input.node.node_type}
- Area: ${input.node.area}
- Level: ${input.node.level}
- Description: ${input.node.description}

User Profile:
- Experience Levels: ${JSON.stringify(input.user_profile.experience_levels, null, 2)}
- Known/Completed Nodes: ${
      input.user_profile.known_nodes && input.user_profile.known_nodes.length > 0
        ? input.user_profile.known_nodes.join(', ')
        : 'None specified'
    }

Generate the personalized annotation.`;
  },
};
