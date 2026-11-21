import { z } from 'zod';
import {
  NodeTypeSchema,
  NodeStatusSchema,
  CanonicalStatusSchema,
  OriginSchema,
  VerdictTypeSchema,
} from './enums';

// ---------------------------------------------------------------------------
// Canonical graph — PRD Section 5 & 7
// ---------------------------------------------------------------------------

export const CanonicalNodeSchema = z.object({
  id: z.string().uuid(),
  domain_id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  node_type: NodeTypeSchema,
  level: z.number().int().min(0),
  area: z.string().min(1).default('general'),
  status: CanonicalStatusSchema.default('approved'),
  external_url: z.string().url().nullable().default(null),
  version_tag: z.string().nullable().default(null),
});
export type CanonicalNode = z.infer<typeof CanonicalNodeSchema>;

export const CanonicalEdgeSchema = z.object({
  id: z.string().uuid(),
  from_node: z.string().uuid(),
  to_node: z.string().uuid(),
});
export type CanonicalEdge = z.infer<typeof CanonicalEdgeSchema>;

/** The full canonical sub-graph for a domain. */
export const CanonicalGraphSchema = z.object({
  domain_id: z.string().uuid(),
  nodes: z.array(CanonicalNodeSchema),
  edges: z.array(CanonicalEdgeSchema),
});
export type CanonicalGraph = z.infer<typeof CanonicalGraphSchema>;

// ---------------------------------------------------------------------------
// Canonical graph seed format — PRD Appendix A & Prompt 3
// ---------------------------------------------------------------------------

export const CanonicalAreaSchema = z.enum([
  'editors-ides',
  'ai-assistants',
  'languages-frameworks',
  'testing',
  'deployment',
  'agents-automation',
]);
export type CanonicalArea = z.infer<typeof CanonicalAreaSchema>;

export const SeedNodeSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(''),
  type: NodeTypeSchema,
  level: z.number().int().min(0),
  area: z.string().min(1),
  status: CanonicalStatusSchema.default('approved'),
  external_url: z.string().url().nullable().optional(),
  version_tag: z.string().nullable().optional(),
  todo_note: z.string().optional(),
});
export type SeedNode = z.infer<typeof SeedNodeSchema>;

export const SeedEdgeSchema = z.tuple([z.string().min(1), z.string().min(1)]);
export type SeedEdge = z.infer<typeof SeedEdgeSchema>;

export const SeedSupersedesTupleSchema = z.union([
  z.tuple([z.string().min(1), z.string().min(1)]),
  z.tuple([z.string().min(1), z.string().min(1), z.string()]),
]);

export const SeedSupersedesObjectSchema = z.object({
  old_node: z.string().min(1),
  new_node: z.string().min(1),
  note: z.string().optional(),
});

export const SeedSupersedesSchema = z.union([
  SeedSupersedesTupleSchema,
  SeedSupersedesObjectSchema,
]);
export type SeedSupersedes = z.infer<typeof SeedSupersedesSchema>;

export const CanonicalGraphSeedSchema = z.object({
  domain: z.string().min(1),
  nodes: z.array(SeedNodeSchema),
  edges: z.array(SeedEdgeSchema),
  supersedes: z.array(SeedSupersedesSchema).default([]),
});
export type CanonicalGraphSeed = z.infer<typeof CanonicalGraphSeedSchema>;

// ---------------------------------------------------------------------------
// User roadmap — PRD Section 5 & 7
// ---------------------------------------------------------------------------

export const UserNodeSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  node_id: z.string().uuid(),
  status: NodeStatusSchema,
  origin: OriginSchema.default('baseline'),
  fast_track: z.boolean().default(false),
  replaced_node_id: z.string().uuid().nullable().default(null),
  completed_at: z.string().datetime().nullable().default(null),
  version: z.number().int().min(1).default(1),
  // Denormalized from canonical node — populated by queries, optional for pure logic
  canonical_node: CanonicalNodeSchema.optional(),
});
export type UserNode = z.infer<typeof UserNodeSchema>;

/**
 * A Roadmap is a snapshot of the canonical graph plus the user's per-node
 * state.  This is the primary input/output type for all graph operations.
 */
export const RoadmapSchema = z.object({
  user_id: z.string().uuid(),
  domain_id: z.string().uuid(),
  /** All canonical nodes visible to this user (approved only). */
  nodes: z.array(CanonicalNodeSchema),
  /** All canonical edges among those nodes. */
  edges: z.array(CanonicalEdgeSchema),
  /** Per-user progress rows — 1-to-1 with nodes in this roadmap. */
  user_nodes: z.array(UserNodeSchema),
});
export type Roadmap = z.infer<typeof RoadmapSchema>;

// ---------------------------------------------------------------------------
// News processing output — PRD Section 9.1
// ---------------------------------------------------------------------------

/** Exactly 3-element tuple validated in Zod. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const BulletsSchema = z.array(z.string().min(1)).length(3) as unknown as z.ZodType<
  [string, string, string]
>;

export const ProposedNewToolSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  supersedes_slugs: z.array(z.string()),
});
export type ProposedNewTool = z.infer<typeof ProposedNewToolSchema>;

/** Output schema for the fast-tier news processing prompt (PRD 9.1). */
export const NewsItemProcessingOutputSchema = z.object({
  bullets: BulletsSchema,
  impact_score: z.number().int().min(1).max(10),
  impact_rationale: z.string().min(1),
  tags: z.array(z.string()),
  proposed_new_tool: ProposedNewToolSchema.nullable(),
});
export type NewsItemProcessingOutput = z.infer<typeof NewsItemProcessingOutputSchema>;

// ---------------------------------------------------------------------------
// Verdict output — PRD Section 9.2
// ---------------------------------------------------------------------------

/** Output schema for the strong-tier verdict prompt (PRD 9.2). */
export const VerdictOutputSchema = z.object({
  verdict: VerdictTypeSchema,
  new_node_slug: z.string().nullable(),
  target_node_slug: z.string().nullable(),
  insert_after_slugs: z.array(z.string()),
  reasoning: z.string().max(400), // ~60 words max
  confidence: z.number().min(0).max(1),
});
export type VerdictOutput = z.infer<typeof VerdictOutputSchema>;

// ---------------------------------------------------------------------------
// Experience level map — PRD Section 8.1
// ---------------------------------------------------------------------------

export const LevelsByAreaSchema = z.record(
  z.string(),
  z.enum(['beginner', 'working', 'expert']),
);
export type LevelsByArea = z.infer<typeof LevelsByAreaSchema>;
