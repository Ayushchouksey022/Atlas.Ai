import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared enums — PRD Section 5
// ---------------------------------------------------------------------------

export const NodeTypeSchema = z.enum(['skill', 'tool', 'workflow']);
export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NodeStatusSchema = z.enum([
  'known',
  'todo',
  'in_progress',
  'completed',
  'archived',
]);
export type NodeStatus = z.infer<typeof NodeStatusSchema>;

export const CanonicalStatusSchema = z.enum(['draft', 'approved', 'deprecated']);
export type CanonicalStatus = z.infer<typeof CanonicalStatusSchema>;

export const OriginSchema = z.enum(['baseline', 'injection', 'override']);
export type Origin = z.infer<typeof OriginSchema>;

export const VerdictTypeSchema = z.enum(['shield', 'injection', 'override']);
export type VerdictType = z.infer<typeof VerdictTypeSchema>;

export const UserVerdictStateSchema = z.enum([
  'precomputed',
  'previewed',
  'confirmed',
  'dismissed',
  'applied',
  'failed',
]);
export type UserVerdictState = z.infer<typeof UserVerdictStateSchema>;

export const ExperienceLevelSchema = z.enum(['beginner', 'working', 'expert']);
export type ExperienceLevel = z.infer<typeof ExperienceLevelSchema>;
