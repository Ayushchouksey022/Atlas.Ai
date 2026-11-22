/**
 * @repo/graph — Verdict Engine & Deterministic Decision Rules
 * PRD Sections 8.2 & 9.2
 *
 * "The LLM proposes; deterministic code decides."
 *
 * Rules:
 *   1. Shield if domain mismatch OR impact_score < 6 OR new_node_slug is not an approved canonical node.
 *   2. Override only if an approved node_supersedes row links an existing non-archived user node to the new node.
 *   3. Injection only if the new node is approved, not already in the user's roadmap, and impact_score >= 7.
 *   4. If confidence < 0.6, downgrade to shield and flag the item for editor review.
 *   5. A verdict that references a node not in the canonical graph is invalid -> default to shield.
 *
 * Sponsorship invariant (PRD Section 14):
 *   Verdict functions accept NO sponsor-related input.
 */

import type {
  CanonicalNode,
  CanonicalEdge,
  UserNode,
  Roadmap,
  VerdictOutput,
} from '@repo/schemas';
import { wouldCreateCycle, validateAcyclic } from './cycle';

// ---------------------------------------------------------------------------
// Types & Context
// ---------------------------------------------------------------------------

export interface SupersedesRelation {
  old_node_id: string;
  new_node_id: string;
  old_slug?: string;
  new_slug?: string;
}

export interface VerdictContext {
  domainMatches: boolean;
  impactScore: number;
  canonicalNodes: readonly CanonicalNode[];
  canonicalEdges: readonly CanonicalEdge[];
  supersedes: readonly SupersedesRelation[];
  roadmap: Readonly<Roadmap>;
}

export type DowngradeReason =
  | 'DOMAIN_MISMATCH'
  | 'LOW_IMPACT_SCORE'
  | 'LOW_CONFIDENCE'
  | 'UNKNOWN_SLUG'
  | 'NODE_NOT_APPROVED'
  | 'TARGET_NOT_IN_ROADMAP'
  | 'TARGET_ALREADY_ARCHIVED'
  | 'NEW_NODE_ALREADY_IN_ROADMAP'
  | 'NO_APPROVED_SUPERSEDES_LINK'
  | 'INJECTION_IMPACT_TOO_LOW'
  | 'ALREADY_IN_ROADMAP'
  | 'WOULD_CREATE_CYCLE';

export interface DecidedVerdict {
  verdict: 'shield' | 'injection' | 'override';
  target_node_id: string | null;
  new_node_id: string | null;
  insert_after_node_ids: string[];
  reasoning: string;
  confidence: number;
  flagged_for_editor: boolean;
  downgraded_from?: 'injection' | 'override';
  downgrade_reason?: DowngradeReason;
}

// ---------------------------------------------------------------------------
// 1. computePlacement
// ---------------------------------------------------------------------------

export interface PlacementResult {
  insertAfterNodeIds: string[];
  wouldCycle: boolean;
}

/**
 * PRD Section 8.2 & 9.2:
 * "Placement rule: after the deepest satisfied prerequisite in the user's roadmap;
 * before any of its dependents. Reject if a cycle would result."
 */
export function computePlacement(
  newNodeId: string,
  canonicalEdges: readonly CanonicalEdge[],
  roadmap: Readonly<Roadmap>,
  preferredInsertAfterSlugs?: readonly string[],
): PlacementResult {
  const satisfiedStatuses = new Set(['known', 'completed', 'archived']);
  const roadmapNodeIds = new Set(roadmap.nodes.map((n) => n.id));
  const userNodeMap = new Map<string, UserNode>();
  for (const un of roadmap.user_nodes) {
    userNodeMap.set(un.node_id, un);
  }

  // 1. Direct or transitive prerequisites of newNodeId in canonicalEdges
  // Build reverse adjacency of canonicalEdges: to_node -> from_node
  const canRevAdj = new Map<string, Set<string>>();
  for (const e of canonicalEdges) {
    if (!canRevAdj.has(e.to_node)) canRevAdj.set(e.to_node, new Set());
    canRevAdj.get(e.to_node)!.add(e.from_node);
  }

  // Find all ancestors of newNodeId in canonicalEdges
  const ancestors = new Set<string>();
  const stack = [newNodeId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    for (const pred of canRevAdj.get(cur) ?? []) {
      if (!ancestors.has(pred)) {
        ancestors.add(pred);
        stack.push(pred);
      }
    }
  }

  // Filter to ancestors that are in user's roadmap and satisfied
  const satisfiedPrereqsInRoadmap = [...ancestors].filter((id) => {
    if (!roadmapNodeIds.has(id)) return false;
    const un = userNodeMap.get(id);
    return un ? satisfiedStatuses.has(un.status) : false;
  });

  // Find deepest satisfied prerequisites: those that have no other satisfied prerequisite reachable from them
  // Build forward adjacency among satisfiedPrereqs in canonicalEdges
  const canAdj = new Map<string, Set<string>>();
  for (const e of canonicalEdges) {
    if (!canAdj.has(e.from_node)) canAdj.set(e.from_node, new Set());
    canAdj.get(e.from_node)!.add(e.to_node);
  }

  const isAncestorOfAnotherSatisfied = new Set<string>();
  for (const a of satisfiedPrereqsInRoadmap) {
    const visited = new Set<string>();
    const dfs = [a];
    while (dfs.length > 0) {
      const cur = dfs.pop()!;
      for (const next of canAdj.get(cur) ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          if (satisfiedPrereqsInRoadmap.includes(next) && next !== a) {
            isAncestorOfAnotherSatisfied.add(a);
          }
          dfs.push(next);
        }
      }
    }
  }

  // Deepest satisfied prerequisites are the leaf-most satisfied ones
  const deepestSatisfied = satisfiedPrereqsInRoadmap.filter(
    (id) => !isAncestorOfAnotherSatisfied.has(id),
  );

  let chosenInsertAfterIds: string[] = [];

  // If preferred insert_after slugs are provided by LLM, check if they are valid & satisfied
  if (preferredInsertAfterSlugs && preferredInsertAfterSlugs.length > 0) {
    const slugToNode = new Map<string, CanonicalNode>();
    for (const n of roadmap.nodes) {
      slugToNode.set(n.slug, n);
    }

    const validPreferredIds: string[] = [];
    for (const slug of preferredInsertAfterSlugs) {
      const node = slugToNode.get(slug);
      if (node) {
        const un = userNodeMap.get(node.id);
        if (un && satisfiedStatuses.has(un.status)) {
          validPreferredIds.push(node.id);
        }
      }
    }

    if (validPreferredIds.length > 0) {
      chosenInsertAfterIds = validPreferredIds;
    }
  }

  // Fallback to deepest satisfied canonical prerequisites if none selected from LLM
  if (chosenInsertAfterIds.length === 0) {
    chosenInsertAfterIds = deepestSatisfied;
  }

  // Validate that proposed edges don't create cycles
  for (const afterId of chosenInsertAfterIds) {
    if (wouldCreateCycle(roadmap.edges, afterId, newNodeId)) {
      return { insertAfterNodeIds: [], wouldCycle: true };
    }
  }

  return { insertAfterNodeIds: chosenInsertAfterIds, wouldCycle: false };
}

// ---------------------------------------------------------------------------
// 2. decideVerdict
// ---------------------------------------------------------------------------

/**
 * Deterministically decides the final verdict based on LLM output and context.
 * The LLM proposes; deterministic code decides.
 */
export function decideVerdict(
  llmOutput: Readonly<VerdictOutput>,
  context: Readonly<VerdictContext>,
): DecidedVerdict {
  // Guard 1: Domain mismatch
  if (!context.domainMatches) {
    return {
      verdict: 'shield',
      target_node_id: null,
      new_node_id: null,
      insert_after_node_ids: [],
      reasoning: 'Advancement is outside the active domain of your roadmap.',
      confidence: llmOutput.confidence,
      flagged_for_editor: false,
      downgraded_from: llmOutput.verdict !== 'shield' ? llmOutput.verdict : undefined,
      downgrade_reason: 'DOMAIN_MISMATCH',
    };
  }

  // Guard 2: Impact score < 6
  if (context.impactScore < 6) {
    return {
      verdict: 'shield',
      target_node_id: null,
      new_node_id: null,
      insert_after_node_ids: [],
      reasoning: 'Impact score is below the threshold for roadmap updates (minimum 6 required).',
      confidence: llmOutput.confidence,
      flagged_for_editor: false,
      downgraded_from: llmOutput.verdict !== 'shield' ? llmOutput.verdict : undefined,
      downgrade_reason: 'LOW_IMPACT_SCORE',
    };
  }

  // Guard 3: Low confidence (< 0.6) downgrades to shield and flags for editor review
  if (llmOutput.confidence < 0.6) {
    return {
      verdict: 'shield',
      target_node_id: null,
      new_node_id: null,
      insert_after_node_ids: [],
      reasoning: llmOutput.reasoning || 'Confidence is below threshold (0.6); flagged for editorial review.',
      confidence: llmOutput.confidence,
      flagged_for_editor: true,
      downgraded_from: llmOutput.verdict !== 'shield' ? llmOutput.verdict : undefined,
      downgrade_reason: 'LOW_CONFIDENCE',
    };
  }

  // If the LLM already proposed shield, accept it directly
  if (llmOutput.verdict === 'shield') {
    return {
      verdict: 'shield',
      target_node_id: null,
      new_node_id: null,
      insert_after_node_ids: [],
      reasoning: llmOutput.reasoning,
      confidence: llmOutput.confidence,
      flagged_for_editor: false,
    };
  }

  // Index canonical nodes by slug and id
  const canonicalBySlug = new Map<string, CanonicalNode>();
  const canonicalById = new Map<string, CanonicalNode>();
  for (const n of context.canonicalNodes) {
    canonicalBySlug.set(n.slug, n);
    canonicalById.set(n.id, n);
  }

  // User nodes map
  const userNodeMap = new Map<string, UserNode>();
  for (const un of context.roadmap.user_nodes) {
    userNodeMap.set(un.node_id, un);
  }

  // -------------------------------------------------------------------------
  // Handle OVERRIDE
  // -------------------------------------------------------------------------
  if (llmOutput.verdict === 'override') {
    const targetSlug = llmOutput.target_node_slug;
    const newSlug = llmOutput.new_node_slug;

    // Must specify both target and new node slugs
    if (!targetSlug || !newSlug) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: 'Override proposal is missing target or replacement node slug.',
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'override',
        downgrade_reason: 'UNKNOWN_SLUG',
      };
    }

    const targetNode = canonicalBySlug.get(targetSlug);
    const newNode = canonicalBySlug.get(newSlug);

    // Rule 5: Unknown slugs -> default to shield
    if (!targetNode || !newNode) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: 'Target or replacement node does not exist in the canonical graph.',
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'override',
        downgrade_reason: 'UNKNOWN_SLUG',
      };
    }

    // New node must be approved
    if (newNode.status !== 'approved') {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Proposed replacement node (${newNode.name}) is not yet approved in canonical graph.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'override',
        downgrade_reason: 'NODE_NOT_APPROVED',
      };
    }

    // Target node must exist in user's roadmap
    const targetUserNode = userNodeMap.get(targetNode.id);
    if (!targetUserNode) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Target node (${targetNode.name}) is not in your roadmap.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: false,
        downgraded_from: 'override',
        downgrade_reason: 'TARGET_NOT_IN_ROADMAP',
      };
    }

    // Target node must NOT be archived
    if (targetUserNode.status === 'archived') {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Target node (${targetNode.name}) is already archived in your legacy roadmap.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: false,
        downgraded_from: 'override',
        downgrade_reason: 'TARGET_ALREADY_ARCHIVED',
      };
    }

    // New node must NOT already be active in user's roadmap
    const newUserNode = userNodeMap.get(newNode.id);
    if (newUserNode && newUserNode.status !== 'archived') {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Replacement node (${newNode.name}) is already present in your active roadmap.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: false,
        downgraded_from: 'override',
        downgrade_reason: 'NEW_NODE_ALREADY_IN_ROADMAP',
      };
    }

    // Approved node_supersedes link MUST exist linking targetNode -> newNode
    const hasApprovedSupersedes = context.supersedes.some(
      (s) => s.old_node_id === targetNode.id && s.new_node_id === newNode.id,
    );

    if (!hasApprovedSupersedes) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `No approved supersedes relationship exists between ${targetNode.name} and ${newNode.name}.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'override',
        downgrade_reason: 'NO_APPROVED_SUPERSEDES_LINK',
      };
    }

    // All override rules satisfied!
    return {
      verdict: 'override',
      target_node_id: targetNode.id,
      new_node_id: newNode.id,
      insert_after_node_ids: [],
      reasoning: llmOutput.reasoning,
      confidence: llmOutput.confidence,
      flagged_for_editor: false,
    };
  }

  // -------------------------------------------------------------------------
  // Handle INJECTION
  // -------------------------------------------------------------------------
  if (llmOutput.verdict === 'injection') {
    const newSlug = llmOutput.new_node_slug;

    if (!newSlug) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: 'Injection proposal is missing node slug.',
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'injection',
        downgrade_reason: 'UNKNOWN_SLUG',
      };
    }

    const newNode = canonicalBySlug.get(newSlug);

    // Rule 5: Unknown slug -> default to shield
    if (!newNode) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Proposed injection node (${newSlug}) does not exist in the canonical graph.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'injection',
        downgrade_reason: 'UNKNOWN_SLUG',
      };
    }

    // Node must be approved
    if (newNode.status !== 'approved') {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Proposed injection node (${newNode.name}) is not yet approved in canonical graph.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'injection',
        downgrade_reason: 'NODE_NOT_APPROVED',
      };
    }

    // Impact score must be >= 7
    if (context.impactScore < 7) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Injection requires an impact score of 7 or higher (current: ${context.impactScore}).`,
        confidence: llmOutput.confidence,
        flagged_for_editor: false,
        downgraded_from: 'injection',
        downgrade_reason: 'INJECTION_IMPACT_TOO_LOW',
      };
    }

    // Must NOT already be in user's roadmap
    const existingUserNode = userNodeMap.get(newNode.id);
    if (existingUserNode) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `${newNode.name} is already part of your roadmap.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: false,
        downgraded_from: 'injection',
        downgrade_reason: 'ALREADY_IN_ROADMAP',
      };
    }

    // Compute placement and check for cycles
    const placement = computePlacement(
      newNode.id,
      context.canonicalEdges,
      context.roadmap,
      llmOutput.insert_after_slugs,
    );

    if (placement.wouldCycle) {
      return {
        verdict: 'shield',
        target_node_id: null,
        new_node_id: null,
        insert_after_node_ids: [],
        reasoning: `Inserting ${newNode.name} would introduce a cyclic dependency in your roadmap.`,
        confidence: llmOutput.confidence,
        flagged_for_editor: true,
        downgraded_from: 'injection',
        downgrade_reason: 'WOULD_CREATE_CYCLE',
      };
    }

    // All injection rules satisfied!
    return {
      verdict: 'injection',
      target_node_id: null,
      new_node_id: newNode.id,
      insert_after_node_ids: placement.insertAfterNodeIds,
      reasoning: llmOutput.reasoning,
      confidence: llmOutput.confidence,
      flagged_for_editor: false,
    };
  }

  // Fallback default
  return {
    verdict: 'shield',
    target_node_id: null,
    new_node_id: null,
    insert_after_node_ids: [],
    reasoning: llmOutput.reasoning || 'No actionable graph mutation identified.',
    confidence: llmOutput.confidence,
    flagged_for_editor: false,
  };
}

// ---------------------------------------------------------------------------
// 3. Cache Key & Experience Bucket Helpers
// ---------------------------------------------------------------------------

/**
 * Computes an experience bucket string from profiles.experience JSON.
 * Returns 'beginner', 'working', or 'expert'.
 */
export function computeExperienceBucket(
  experience: Record<string, string> | null | undefined,
): 'beginner' | 'working' | 'expert' {
  if (!experience || typeof experience !== 'object') {
    return 'beginner';
  }

  const values = Object.values(experience);
  if (values.length === 0) return 'beginner';

  let expertCount = 0;
  let workingCount = 0;
  let beginnerCount = 0;

  for (const v of values) {
    if (v === 'expert') expertCount++;
    else if (v === 'working') workingCount++;
    else beginnerCount++;
  }

  if (expertCount > workingCount && expertCount > beginnerCount) {
    return 'expert';
  }
  if (workingCount >= expertCount && workingCount >= beginnerCount) {
    return 'working';
  }
  return 'beginner';
}

/**
 * Deterministic hash string generator for cross-platform (Node + Deno).
 */
function simpleSha256(str: string): string {
  // Use a fast FNV-1a + murmur style deterministic 64-char hex hash when crypto is unavailable,
  // or built-in crypto if available.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const nodeCrypto = require('node:crypto');
    if (nodeCrypto?.createHash) {
      return nodeCrypto.createHash('sha256').update(str).digest('hex');
    }
  } catch {
    // Fall back to pure JS deterministic hash
  }

  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${p1}${p2}${p1}${p2}`;
}

/**
 * PRD Section 7 & 10.2:
 * cache_key = hash(news_item_id + sorted relevant node ids + experience bucket)
 */
export function computeCacheKey(
  newsItemId: string,
  relevantNodeIds: readonly string[],
  experienceBucket: string,
): string {
  const sortedIds = [...relevantNodeIds].sort().join(',');
  const raw = `${newsItemId}|${sortedIds}|${experienceBucket}`;
  return simpleSha256(raw);
}
