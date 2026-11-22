import type {
  CanonicalNode,
  CanonicalEdge,
} from '@repo/schemas';

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

export type Ok<T> = { ok: true; value: T };
export type Err<E extends string> = { ok: false; error: E; detail?: string };
export type Result<T, E extends string> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}
export function err<E extends string>(error: E, detail?: string): Err<E> {
  return { ok: false, error, detail };
}

// ---------------------------------------------------------------------------
// Graph traversal helpers
// ---------------------------------------------------------------------------

/** Build an adjacency map: nodeId -> Set of successor nodeIds. */
export function buildAdj(edges: readonly CanonicalEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from_node)) adj.set(e.from_node, new Set());
    if (!adj.has(e.to_node)) adj.set(e.to_node, new Set());
    adj.get(e.from_node)!.add(e.to_node);
  }
  return adj;
}

/** Build a reverse-adjacency map: nodeId -> Set of predecessor nodeIds. */
export function buildRevAdj(edges: readonly CanonicalEdge[]): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!rev.has(e.from_node)) rev.set(e.from_node, new Set());
    if (!rev.has(e.to_node)) rev.set(e.to_node, new Set());
    rev.get(e.to_node)!.add(e.from_node);
  }
  return rev;
}

/** All ancestor node IDs of `startId` (transitive predecessors), excluding itself. */
export function allAncestors(startId: string, revAdj: Map<string, Set<string>>): Set<string> {
  const result = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const pred of revAdj.get(cur) ?? []) {
      if (!result.has(pred)) {
        result.add(pred);
        stack.push(pred);
      }
    }
  }
  return result;
}

/** DFS-based reachability: all nodes reachable from `startId` (excluding itself). */
export function reachable(startId: string, adj: Map<string, Set<string>>): Set<string> {
  const result = new Set<string>();
  const stack = [startId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const next of adj.get(cur) ?? []) {
      if (!result.has(next)) {
        result.add(next);
        stack.push(next);
      }
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// wouldCreateCycle
// ---------------------------------------------------------------------------

/**
 * Returns true if adding the edge from→to into the existing edge set would
 * create a cycle (including self-loops).
 *
 * PRD invariant: "The canonical graph and every user roadmap are acyclic."
 */
export function wouldCreateCycle(
  edges: readonly CanonicalEdge[],
  from: string,
  to: string,
): boolean {
  // Self-loop is always a cycle
  if (from === to) return true;
  // If `from` is reachable from `to`, adding from→to creates a cycle
  const adj = buildAdj(edges);
  return reachable(to, adj).has(from);
}

// ---------------------------------------------------------------------------
// validateAcyclic
// ---------------------------------------------------------------------------

export type ValidateAcyclicError = 'CYCLE_DETECTED';

export type ValidateAcyclicResult = Result<
  { layers: Map<string, number> },
  ValidateAcyclicError
>;

/**
 * Validates that the graph defined by `nodes` and `edges` is acyclic.
 * Uses Kahn's algorithm (topological sort via in-degree).
 * Returns the topological layers on success, or the offending cycle path.
 */
export function validateAcyclic(
  nodes: readonly CanonicalNode[],
  edges: readonly CanonicalEdge[],
): ValidateAcyclicResult {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const inDegree = new Map<string, number>();
  const adj = new Map<string, string[]>();

  for (const id of nodeIds) {
    inDegree.set(id, 0);
    adj.set(id, []);
  }

  for (const e of edges) {
    // Skip edges referencing nodes not in the node list
    if (!nodeIds.has(e.from_node) || !nodeIds.has(e.to_node)) continue;
    adj.get(e.from_node)!.push(e.to_node);
    inDegree.set(e.to_node, (inDegree.get(e.to_node) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const layers = new Map<string, number>();
  // Initialize all source nodes (in-degree 0) to layer 0
  for (const id of queue) {
    layers.set(id, 0);
  }
  let visited = 0;

  while (queue.length) {
    const cur = queue.shift()!;
    visited++;
    const curLayer = layers.get(cur) ?? 0;

    for (const next of adj.get(cur) ?? []) {
      layers.set(next, Math.max(layers.get(next) ?? 0, curLayer + 1));
      const newDeg = (inDegree.get(next) ?? 1) - 1;
      inDegree.set(next, newDeg);
      if (newDeg === 0) queue.push(next);
    }
  }

  if (visited !== nodeIds.size) {
    return err('CYCLE_DETECTED', 'Graph contains at least one cycle');
  }
  return ok({ layers });
}
