import type { LLMProvider } from '../../../packages/llm/src/index';
import { nodeMappingPrompt } from '../../../packages/llm/src/prompts/nodeMapping';

export interface CanonicalNodeMinimal {
  id: string;
  slug: string;
  name: string;
  description: string;
  area: string;
  node_type?: string;
  level?: number;
}

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'are', 'was',
  'were', 'will', 'been', 'which', 'what', 'when', 'where', 'who', 'how',
  'new', 'now', 'all', 'any', 'can', 'our', 'out', 'use', 'using', 'into',
]);

/**
 * Tokenize and normalize text into searchable keyword tokens.
 */
function extractTokens(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  return new Set(words);
}

/**
 * Stage 1 Candidate Retrieval:
 * Ranks canonical nodes by keyword and tag overlap against news item content.
 */
export function retrieveCandidateNodes(
  canonicalNodes: CanonicalNodeMinimal[],
  newsItem: {
    title: string;
    bullets: string[];
    tags: string[];
    raw_text?: string | null;
  },
  limit = 8,
): CanonicalNodeMinimal[] {
  const contentTokens = extractTokens(
    `${newsItem.title} ${newsItem.bullets.join(' ')} ${newsItem.tags.join(' ')} ${(newsItem.raw_text || '').slice(0, 1000)}`,
  );

  const tagTokens = new Set(
    newsItem.tags.flatMap((t) => t.toLowerCase().split(/[-_ ]/)),
  );

  const scored = canonicalNodes.map((node) => {
    let score = 0;
    const nodeSlugTokens = node.slug.toLowerCase().split('-');
    const nodeNameTokens = node.name.toLowerCase().split(/\s+/);
    const nodeAreaTokens = node.area.toLowerCase().split('-');

    // 1. Direct slug or name match
    for (const token of nodeSlugTokens) {
      if (contentTokens.has(token)) score += 5;
    }
    for (const token of nodeNameTokens) {
      if (contentTokens.has(token)) score += 4;
    }

    // 2. Area match
    for (const token of nodeAreaTokens) {
      if (tagTokens.has(token) || contentTokens.has(token)) score += 2;
    }

    // 3. Description overlap
    const descTokens = extractTokens(node.description || '');
    for (const dt of descTokens) {
      if (contentTokens.has(dt)) score += 1;
    }

    return { node, score };
  });

  return scored
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.node);
}

/**
 * Stage 2 LLM Pick:
 * Runs the node mapping prompt via @repo/llm fast tier to determine
 * exact candidate and primary canonical node matches.
 */
export async function pickMappedNodes(
  provider: LLMProvider,
  newsItem: {
    title: string;
    bullets: string[];
    tags: string[];
  },
  candidates: CanonicalNodeMinimal[],
): Promise<{
  primary_slug: string | null;
  candidate_slugs: string[];
  mapped_node_ids: string[];
}> {
  if (candidates.length === 0) {
    return {
      primary_slug: null,
      candidate_slugs: [],
      mapped_node_ids: [],
    };
  }

  const promptInput = {
    title: newsItem.title,
    bullets: newsItem.bullets,
    tags: newsItem.tags,
    candidates: candidates.map((c) => ({
      slug: c.slug,
      name: c.name,
      description: c.description || c.area,
    })),
  };

  const userPrompt = nodeMappingPrompt.buildUser(promptInput);

  const mappingResult = await provider.generateJSON({
    tier: nodeMappingPrompt.tier,
    system: nodeMappingPrompt.system,
    user: userPrompt,
    schema: nodeMappingPrompt.schema,
    promptName: nodeMappingPrompt.name,
    promptVersion: nodeMappingPrompt.version,
  });

  const slugToId = new Map<string, string>();
  for (const c of candidates) {
    slugToId.set(c.slug, c.id);
  }

  const mappedNodeIds: string[] = [];

  if (mappingResult.primary_slug && slugToId.has(mappingResult.primary_slug)) {
    mappedNodeIds.push(slugToId.get(mappingResult.primary_slug)!);
  }

  for (const slug of mappingResult.candidate_slugs || []) {
    const id = slugToId.get(slug);
    if (id && !mappedNodeIds.includes(id)) {
      mappedNodeIds.push(id);
    }
  }

  return {
    primary_slug: mappingResult.primary_slug,
    candidate_slugs: mappingResult.candidate_slugs || [],
    mapped_node_ids: mappedNodeIds,
  };
}
