import type {
  CanonicalNode,
  CanonicalEdge,
} from '@repo/schemas';
import { wouldCreateCycle } from './cycle';

export interface ProposedEdgePayload {
  from_node?: string;
  to_node?: string;
  from_slug?: string;
  to_slug?: string;
  relationship?: 'prerequisite' | 'recommended';
}

export interface ProposedNodePayload {
  slug: string;
  name: string;
  description?: string;
  category?: 'tool' | 'skill' | 'workflow';
  node_type?: 'tool' | 'skill' | 'workflow';
  area: string;
  level: number;
  external_url?: string | null;
}

export interface ProposedGraphChangePayload {
  proposed_node?: ProposedNodePayload;
  proposed_edges?: ProposedEdgePayload[];
  supersedes_slugs?: string[];
  from_node?: string;
  to_node?: string;
  old_node?: string;
  new_node?: string;
  [key: string]: unknown;
}

export interface ProposedGraphChangeRecord {
  id: string;
  news_item_id?: string | null;
  change_type: 'add_node' | 'add_edge' | 'add_supersedes' | 'deprecate_node';
  payload: ProposedGraphChangePayload;
  status: 'pending' | 'approved' | 'rejected';
}

export interface ChangeValidationResult {
  valid: boolean;
  error?: string;
  cycleDetected?: boolean;
  message?: string;
}

/**
 * Validates a proposed graph change against the current canonical graph state.
 * Specifically checks for cycle creation, duplicate slugs, or missing references.
 * PRD Section 11.6: "approving an add_node/add_edge/add_supersedes change writes to the
 * canonical graph, running the cycle check first and refusing if a cycle would result."
 */
export function validateProposedChange(
  change: ProposedGraphChangeRecord,
  currentNodes: readonly CanonicalNode[],
  currentEdges: readonly CanonicalEdge[],
): ChangeValidationResult {
  const nodeMapById = new Map<string, CanonicalNode>();
  const nodeMapBySlug = new Map<string, CanonicalNode>();

  for (const n of currentNodes) {
    nodeMapById.set(n.id, n);
    nodeMapBySlug.set(n.slug, n);
  }

  // 1. ADD_NODE
  if (change.change_type === 'add_node') {
    const payload = change.payload;
    const proposedNode = payload.proposed_node;

    if (!proposedNode || !proposedNode.slug || !proposedNode.name) {
      return {
        valid: false,
        error: 'INVALID_PAYLOAD',
        message: 'Proposed node must contain a slug and a name.',
      };
    }

    // Check slug collision
    if (nodeMapBySlug.has(proposedNode.slug)) {
      return {
        valid: false,
        error: 'DUPLICATE_SLUG',
        message: `A canonical node with slug "${proposedNode.slug}" already exists.`,
      };
    }

    // Check proposed edges for cycles
    const proposedEdges = payload.proposed_edges || [];
    const simulatedEdges = [...currentEdges];
    const tempNodeId = `temp-${proposedNode.slug}`;

    for (const pe of proposedEdges) {
      // Resolve from and to IDs
      const fromId = pe.from_node || (pe.from_slug ? (pe.from_slug === proposedNode.slug ? tempNodeId : nodeMapBySlug.get(pe.from_slug)?.id) : null);
      const toId = pe.to_node || (pe.to_slug ? (pe.to_slug === proposedNode.slug ? tempNodeId : nodeMapBySlug.get(pe.to_slug)?.id) : null);

      if (!fromId || !toId) {
        continue;
      }

      if (wouldCreateCycle(simulatedEdges, fromId, toId)) {
        return {
          valid: false,
          error: 'CYCLE_DETECTED',
          cycleDetected: true,
          message: `Approving this node would create a cycle via edge ${fromId} -> ${toId}.`,
        };
      }

      simulatedEdges.push({
        id: `temp-edge-${simulatedEdges.length}`,
        from_node: fromId,
        to_node: toId,
      });
    }

    return { valid: true };
  }

  // 2. ADD_EDGE
  if (change.change_type === 'add_edge') {
    const fromId = change.payload.from_node;
    const toId = change.payload.to_node;

    if (!fromId || !toId) {
      return {
        valid: false,
        error: 'MISSING_EDGE_NODES',
        message: 'Edge requires valid from_node and to_node identifiers.',
      };
    }

    if (fromId === toId) {
      return {
        valid: false,
        error: 'CYCLE_DETECTED',
        cycleDetected: true,
        message: 'Self-loops are forbidden; from_node cannot equal to_node.',
      };
    }

    if (wouldCreateCycle(currentEdges, fromId, toId)) {
      const fromName = nodeMapById.get(fromId)?.name || fromId;
      const toName = nodeMapById.get(toId)?.name || toId;
      return {
        valid: false,
        error: 'CYCLE_DETECTED',
        cycleDetected: true,
        message: `Cycle detected: adding edge "${fromName}" -> "${toName}" would create a circular dependency.`,
      };
    }

    return { valid: true };
  }

  // 3. ADD_SUPERSEDES
  if (change.change_type === 'add_supersedes') {
    const oldId = change.payload.old_node;
    const newId = change.payload.new_node;

    if (!oldId || !newId) {
      return {
        valid: false,
        error: 'MISSING_SUPERSEDES_NODES',
        message: 'Supersedes link requires old_node and new_node identifiers.',
      };
    }

    if (oldId === newId) {
      return {
        valid: false,
        error: 'INVALID_SUPERSEDES',
        message: 'A node cannot supersede itself.',
      };
    }

    return { valid: true };
  }

  // 4. DEPRECATE_NODE
  if (change.change_type === 'deprecate_node') {
    return { valid: true };
  }

  return { valid: true };
}

/**
 * Computes field diff between a node and proposed updates.
 */
export function computeNodeDiff(
  original: CanonicalNode,
  updated: Partial<CanonicalNode>,
): Array<{ field: string; from: unknown; to: unknown }> {
  const diffs: Array<{ field: string; from: unknown; to: unknown }> = [];

  for (const key of Object.keys(updated) as Array<keyof CanonicalNode>) {
    if (updated[key] !== undefined && updated[key] !== original[key]) {
      diffs.push({
        field: key,
        from: original[key],
        to: updated[key],
      });
    }
  }

  return diffs;
}
