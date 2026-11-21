/**
 * @repo/graph — Pure TypeScript DAG library for roadmap operations.
 *
 * Rules:
 *   - No I/O, no network, no framework imports.
 *   - All functions are pure and immutable (inputs are never mutated).
 *   - Expected failures return typed Result objects; unexpected errors throw.
 */

import type {
  CanonicalNode,
  CanonicalEdge,
  CanonicalGraph,
  UserNode,
  Roadmap,
  LevelsByArea,
} from '@repo/schemas';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Build an adjacency map: nodeId -> Set of successor nodeIds. */
function buildAdj(edges: readonly CanonicalEdge[]): Map<string, Set<string>> {
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!adj.has(e.from_node)) adj.set(e.from_node, new Set());
    if (!adj.has(e.to_node)) adj.set(e.to_node, new Set());
    adj.get(e.from_node)!.add(e.to_node);
  }
  return adj;
}

/** Build a reverse-adjacency map: nodeId -> Set of predecessor nodeIds. */
function buildRevAdj(edges: readonly CanonicalEdge[]): Map<string, Set<string>> {
  const rev = new Map<string, Set<string>>();
  for (const e of edges) {
    if (!rev.has(e.from_node)) rev.set(e.from_node, new Set());
    if (!rev.has(e.to_node)) rev.set(e.to_node, new Set());
    rev.get(e.to_node)!.add(e.from_node);
  }
  return rev;
}

/** All ancestor node IDs of `startId` (transitive predecessors), excluding itself. */
function allAncestors(startId: string, revAdj: Map<string, Set<string>>): Set<string> {
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
function reachable(startId: string, adj: Map<string, Set<string>>): Set<string> {
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
// Result type
// ---------------------------------------------------------------------------

export type Ok<T> = { ok: true; value: T };
export type Err<E extends string> = { ok: false; error: E; detail?: string };
export type Result<T, E extends string> = Ok<T> | Err<E>;

function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}
function err<E extends string>(error: E, detail?: string): Err<E> {
  return { ok: false, error, detail };
}

// ---------------------------------------------------------------------------
// 1. wouldCreateCycle
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
// 2. validateAcyclic
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

// ---------------------------------------------------------------------------
// 3. topoLayers
// ---------------------------------------------------------------------------

/**
 * Assigns each node to a topological layer (0 = no prerequisites).
 * Returns a Map<nodeId, layer>. Nodes not reachable from any source are
 * placed in layer 0 (disconnected components are handled gracefully).
 * Throws if the graph is cyclic — call validateAcyclic first if unsure.
 */
export function topoLayers(
  nodes: readonly CanonicalNode[],
  edges: readonly CanonicalEdge[],
): Map<string, number> {
  const result = validateAcyclic(nodes, edges);
  if (!result.ok) {
    throw new Error(`topoLayers: ${result.error} — ${result.detail ?? ''}`);
  }
  // Every node must appear in the layer map
  const layers = result.value.layers;
  for (const n of nodes) {
    if (!layers.has(n.id)) layers.set(n.id, 0);
  }
  return layers;
}

// ---------------------------------------------------------------------------
// 4. availableNodes
// ---------------------------------------------------------------------------

/**
 * Returns the user_nodes from `roadmap` whose prerequisites are all
 * satisfied (status: known | completed | archived).
 *
 * PRD Section 8.1 step 3: "nodes whose prerequisites are all satisfied are
 * 'todo' and 'available'".
 *
 * The result includes nodes whose status is `todo` or `in_progress`
 * (i.e. not yet done and not locked).
 */
export function availableNodes(roadmap: Readonly<Roadmap>): UserNode[] {
  const satisfiedStatuses = new Set<string>(['known', 'completed', 'archived']);
  const userNodeByCanonicalId = new Map<string, UserNode>();
  for (const un of roadmap.user_nodes) {
    userNodeByCanonicalId.set(un.node_id, un);
  }

  // Build predecessor map among roadmap nodes
  const roadmapNodeIds = new Set(roadmap.nodes.map((n) => n.id));
  const revAdj = buildRevAdj(
    roadmap.edges.filter(
      (e) => roadmapNodeIds.has(e.from_node) && roadmapNodeIds.has(e.to_node),
    ),
  );

  const result: UserNode[] = [];
  for (const un of roadmap.user_nodes) {
    // Already satisfied — not "available to work on"
    if (satisfiedStatuses.has(un.status)) continue;

    const preds = revAdj.get(un.node_id) ?? new Set<string>();
    const allPrereqsSatisfied = [...preds].every((predId) => {
      const predUserNode = userNodeByCanonicalId.get(predId);
      return predUserNode ? satisfiedStatuses.has(predUserNode.status) : false;
    });

    if (allPrereqsSatisfied) {
      result.push(un);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// 5. generateBaselineRoadmap
// ---------------------------------------------------------------------------

export type GenerateBaselineError = 'CYCLE_IN_CANONICAL_GRAPH' | 'EMPTY_GRAPH';

export type GenerateBaselineResult = Result<Roadmap, GenerateBaselineError>;

/**
 * PRD Section 8.1 — baseline roadmap generation (pure, no DB).
 *
 * Steps:
 * 1. Only use `approved` canonical nodes.
 * 2. Mark `selectedKnownNodeIds` as `known`.
 * 3. For each area rated `expert`: mark ALL ancestors of expert-area nodes as `known`.
 *    For each area rated `working`: mark DIRECT predecessors as `known`.
 * 4. Remaining nodes where all predecessors are satisfied → `todo` (available).
 *    Others → `todo` (locked — no special status, availability is computed at read time).
 * 5. Prune to ~60 nodes: keep the target-path first (nodes with most dependents),
 *    then ancestors, then fill with available nodes.
 */
export function generateBaselineRoadmap(
  canonicalGraph: Readonly<CanonicalGraph>,
  selectedKnownNodeIds: readonly string[],
  levelsByArea: Readonly<LevelsByArea>,
  userId: string,
): GenerateBaselineResult {
  // Step 1: approved nodes only
  const approvedNodes = canonicalGraph.nodes.filter((n) => n.status === 'approved');
  if (approvedNodes.length === 0) return err('EMPTY_GRAPH');

  const approvedIds = new Set(approvedNodes.map((n) => n.id));
  const approvedEdges = canonicalGraph.edges.filter(
    (e) => approvedIds.has(e.from_node) && approvedIds.has(e.to_node),
  );

  // Validate acyclicity
  const acyclicResult = validateAcyclic(approvedNodes, approvedEdges);
  if (!acyclicResult.ok) return err('CYCLE_IN_CANONICAL_GRAPH');

  const revAdj = buildRevAdj(approvedEdges);

  // Step 2 & 3: determine known set
  const knownIds = new Set<string>(selectedKnownNodeIds.filter((id) => approvedIds.has(id)));

  // Group approved nodes by area (using node_type as a proxy for area grouping;
  // real area slugs come from the levelsByArea keys which map to node slugs)
  // PRD uses "area" loosely — we interpret area slugs as matching the beginning of node slugs.
  for (const [area, level] of Object.entries(levelsByArea)) {
    if (level === 'beginner') continue; // no bonus ancestors

    const areaNodes = approvedNodes.filter(
      (n) => n.area === area || n.slug.startsWith(area),
    );

    if (level === 'expert') {
      // All ancestors of expert nodes → known
      for (const n of areaNodes) {
        knownIds.add(n.id);
        for (const ancestorId of allAncestors(n.id, revAdj)) {
          knownIds.add(ancestorId);
        }
      }
    } else if (level === 'working') {
      // Only direct predecessors → known
      for (const n of areaNodes) {
        for (const predId of revAdj.get(n.id) ?? []) {
          knownIds.add(predId);
        }
      }
    }
  }

  // Step 4: build user_nodes
  const satisfiedStatuses = new Set(['known', 'completed', 'archived']);
  const userNodeByCanonicalId = new Map<string, UserNode>();

  // First pass: assign known
  for (const node of approvedNodes) {
    const status = knownIds.has(node.id) ? 'known' : 'todo';
    const un: UserNode = {
      id: crypto.randomUUID(),
      user_id: userId,
      node_id: node.id,
      status,
      origin: 'baseline',
      fast_track: false,
      replaced_node_id: null,
      completed_at: null,
      version: 1,
      canonical_node: node,
    };
    userNodeByCanonicalId.set(node.id, un);
  }

  // Step 5: prune to ~60 nodes
  const PRUNE_LIMIT = 60;
  let selectedNodes = approvedNodes;
  let selectedEdges = approvedEdges;

  if (approvedNodes.length > PRUNE_LIMIT) {
    const adj = buildAdj(approvedEdges);

    // Score nodes: more dependents = higher priority (keep the target path)
    const dependentCount = new Map<string, number>();
    for (const n of approvedNodes) {
      dependentCount.set(n.id, reachable(n.id, adj).size);
    }

    // Sort: known first, then by dependent count descending, then by level
    const sorted = [...approvedNodes].sort((a, b) => {
      const aKnown = knownIds.has(a.id) ? 1 : 0;
      const bKnown = knownIds.has(b.id) ? 1 : 0;
      if (aKnown !== bKnown) return bKnown - aKnown;
      const depDiff = (dependentCount.get(b.id) ?? 0) - (dependentCount.get(a.id) ?? 0);
      if (depDiff !== 0) return depDiff;
      return a.level - b.level;
    });

    const keptIds = new Set(sorted.slice(0, PRUNE_LIMIT).map((n) => n.id));
    selectedNodes = approvedNodes.filter((n) => keptIds.has(n.id));
    selectedEdges = approvedEdges.filter(
      (e) => keptIds.has(e.from_node) && keptIds.has(e.to_node),
    );

    // Remove user_nodes for pruned nodes
    for (const id of [...userNodeByCanonicalId.keys()]) {
      if (!keptIds.has(id)) userNodeByCanonicalId.delete(id);
    }
  }

  // Re-evaluate availability after pruning
  const finalRevAdj = buildRevAdj(selectedEdges);
  const finalUserNodes: UserNode[] = [];
  for (const node of selectedNodes) {
    const un = userNodeByCanonicalId.get(node.id)!;
    if (un.status === 'known') {
      finalUserNodes.push(un);
      continue;
    }
    // todo node: check if all predecessors within the pruned set are satisfied
    const preds = finalRevAdj.get(node.id) ?? new Set<string>();
    const allSatisfied = [...preds].every((predId) => {
      const predUn = userNodeByCanonicalId.get(predId);
      return predUn ? satisfiedStatuses.has(predUn.status) : false;
    });
    finalUserNodes.push({ ...un }); // available/locked distinction is computed at read time
    void allSatisfied; // availability is derived, not stored — see availableNodes()
  }

  return ok({
    user_id: userId,
    domain_id: canonicalGraph.domain_id,
    nodes: selectedNodes,
    edges: selectedEdges,
    user_nodes: finalUserNodes,
  });
}

// ---------------------------------------------------------------------------
// 6. applyInjection
// ---------------------------------------------------------------------------

export type ApplyInjectionError =
  | 'NODE_ALREADY_EXISTS'
  | 'WOULD_CREATE_CYCLE'
  | 'INSERT_AFTER_NODE_NOT_IN_ROADMAP';

export type ApplyInjectionResult = Result<Roadmap, ApplyInjectionError>;

/**
 * PRD Section 8.2 — applyInjection
 *
 * Adds `newNode` to the roadmap after the nodes specified by `insertAfterIds`
 * (prerequisite placement rule). Rejects if:
 *   - The node is already in the roadmap.
 *   - Any insertAfterIds node is not in the roadmap.
 *   - Adding the edges would create a cycle.
 */
export function applyInjection(
  roadmap: Readonly<Roadmap>,
  newCanonicalNode: CanonicalNode,
  insertAfterIds: readonly string[],
): ApplyInjectionResult {
  // Guard: node already in roadmap
  if (roadmap.nodes.some((n) => n.id === newCanonicalNode.id)) {
    return err('NODE_ALREADY_EXISTS', `Node ${newCanonicalNode.id} already in roadmap`);
  }

  const roadmapNodeIds = new Set(roadmap.nodes.map((n) => n.id));

  // Guard: insertAfterIds must all be in roadmap
  for (const afterId of insertAfterIds) {
    if (!roadmapNodeIds.has(afterId)) {
      return err(
        'INSERT_AFTER_NODE_NOT_IN_ROADMAP',
        `Node ${afterId} not in roadmap`,
      );
    }
  }

  // Build proposed new edges (insertAfterIds → newNode)
  const newEdges: CanonicalEdge[] = insertAfterIds.map((afterId) => ({
    id: crypto.randomUUID(),
    from_node: afterId,
    to_node: newCanonicalNode.id,
  }));

  // Check cycles with new edges added
  const candidateEdges = [...roadmap.edges, ...newEdges];
  const candidateNodes = [...roadmap.nodes, newCanonicalNode];
  const cycleCheck = validateAcyclic(candidateNodes, candidateEdges);
  if (!cycleCheck.ok) {
    return err('WOULD_CREATE_CYCLE', 'Injection would create a cycle');
  }

  // Build new user_node
  const newUserNode: UserNode = {
    id: crypto.randomUUID(),
    user_id: roadmap.user_id,
    node_id: newCanonicalNode.id,
    status: 'todo',
    origin: 'injection',
    fast_track: false,
    replaced_node_id: null,
    completed_at: null,
    version: 1,
    canonical_node: newCanonicalNode,
  };

  return ok({
    ...roadmap,
    nodes: [...roadmap.nodes, newCanonicalNode],
    edges: candidateEdges,
    user_nodes: [...roadmap.user_nodes, newUserNode],
  });
}

// ---------------------------------------------------------------------------
// 7. applyOverride
// ---------------------------------------------------------------------------

export type ApplyOverrideError =
  | 'OLD_NODE_NOT_IN_ROADMAP'
  | 'NEW_NODE_ALREADY_IN_ROADMAP'
  | 'WOULD_CREATE_CYCLE';

export type ApplyOverrideResult = Result<Roadmap, ApplyOverrideError>;

export * from './validate';

/**
 * PRD Section 8.2 — applyOverride
 *
 * - Archives the old user_node (status → 'archived'), never deletes it.
 * - Adds `newCanonicalNode` as a user_node with status='todo',
 *   fast_track=true, replaced_node_id=oldNodeId.
 * - Re-points prerequisite edges: any edges that pointed TO oldNodeId's
 *   dependents FROM oldNodeId are supplemented with equivalent edges from
 *   newCanonicalNode.id, so downstream nodes stay unlocked.
 * - Keeps old canonical node in the graph (archived in user_nodes only).
 */
export function applyOverride(
  roadmap: Readonly<Roadmap>,
  oldNodeId: string,
  newCanonicalNode: CanonicalNode,
): ApplyOverrideResult {
  // Guard: old node must be in roadmap
  const oldUserNode = roadmap.user_nodes.find((un) => un.node_id === oldNodeId);
  if (!oldUserNode) {
    return err('OLD_NODE_NOT_IN_ROADMAP', `Node ${oldNodeId} not in roadmap`);
  }

  // Guard: new node must NOT already be in roadmap
  if (roadmap.nodes.some((n) => n.id === newCanonicalNode.id)) {
    return err('NEW_NODE_ALREADY_IN_ROADMAP', `Node ${newCanonicalNode.id} already in roadmap`);
  }

  // Find edges where oldNodeId is a prerequisite (from_node = oldNodeId)
  // These edges go TO downstream nodes — we supplement them with new edges
  // from newCanonicalNode so downstream nodes stay unlocked.
  const downstreamEdges = roadmap.edges.filter((e) => e.from_node === oldNodeId);
  const supplementalEdges: CanonicalEdge[] = downstreamEdges.map((e) => ({
    id: crypto.randomUUID(),
    from_node: newCanonicalNode.id,
    to_node: e.to_node,
  }));

  // Also add an edge from oldNodeId → newCanonicalNode? No — the new node
  // replaces the old one; it doesn't depend on it. We just add the new node
  // at the same prerequisite level (same incoming edges as oldNodeId).
  const incomingToOld = roadmap.edges.filter((e) => e.to_node === oldNodeId);
  const inheritedIncomingEdges: CanonicalEdge[] = incomingToOld.map((e) => ({
    id: crypto.randomUUID(),
    from_node: e.from_node,
    to_node: newCanonicalNode.id,
  }));

  const candidateEdges = [
    ...roadmap.edges,
    ...supplementalEdges,
    ...inheritedIncomingEdges,
  ];
  const candidateNodes = [...roadmap.nodes, newCanonicalNode];

  // Validate no cycle introduced
  const cycleCheck = validateAcyclic(candidateNodes, candidateEdges);
  if (!cycleCheck.ok) {
    return err('WOULD_CREATE_CYCLE', 'Override would create a cycle');
  }

  // Archive old user_node
  const updatedUserNodes: UserNode[] = roadmap.user_nodes.map((un) => {
    if (un.node_id !== oldNodeId) return un;
    return {
      ...un,
      status: 'archived',
      version: un.version + 1,
    };
  });

  // Add new user_node
  const newUserNode: UserNode = {
    id: crypto.randomUUID(),
    user_id: roadmap.user_id,
    node_id: newCanonicalNode.id,
    status: 'todo',
    origin: 'override',
    fast_track: true,
    replaced_node_id: oldNodeId,
    completed_at: null,
    version: 1,
    canonical_node: newCanonicalNode,
  };

  return ok({
    ...roadmap,
    nodes: candidateNodes,
    edges: candidateEdges,
    user_nodes: [...updatedUserNodes, newUserNode],
  });
}

// ---------------------------------------------------------------------------
// 8. mergeRoadmapWithBaseline
// ---------------------------------------------------------------------------

/**
 * PRD Section 11.5 & Prompt 7:
 * Re-runs baseline generation with updated known stack and levels WITHOUT losing
 * completed, in-progress, or archived state.
 *
 * Invariant: Completed or archived nodes are NEVER deleted or reverted to todo.
 * Pure and immutable (inputs are never mutated).
 */
export function mergeRoadmapWithBaseline(
  currentRoadmap: Readonly<Roadmap>,
  selectedKnownNodeIds: readonly string[],
  levelsByArea: Readonly<LevelsByArea>,
  canonicalGraphOverride?: Readonly<CanonicalGraph>,
): GenerateBaselineResult {
  const canonicalGraph: CanonicalGraph = canonicalGraphOverride ?? {
    domain_id: currentRoadmap.domain_id,
    nodes: currentRoadmap.nodes,
    edges: currentRoadmap.edges,
  };

  const baselineResult = generateBaselineRoadmap(
    canonicalGraph,
    selectedKnownNodeIds,
    levelsByArea,
    currentRoadmap.user_id,
  );

  if (!baselineResult.ok) {
    return baselineResult;
  }

  const baselineRoadmap = baselineResult.value;

  // Existing user_nodes map: nodeId -> UserNode
  const existingByNodeId = new Map<string, UserNode>();
  for (const un of currentRoadmap.user_nodes) {
    existingByNodeId.set(un.node_id, un);
  }

  // Preserve completed, in_progress, and archived nodes
  const mergedUserNodes: UserNode[] = [];
  const processedNodeIds = new Set<string>();

  for (const baseUn of baselineRoadmap.user_nodes) {
    processedNodeIds.add(baseUn.node_id);
    const existing = existingByNodeId.get(baseUn.node_id);

    if (
      existing &&
      (existing.status === 'completed' ||
        existing.status === 'archived' ||
        existing.status === 'in_progress')
    ) {
      // Retain existing progress & completion timestamp
      mergedUserNodes.push({
        ...baseUn,
        id: existing.id,
        status: existing.status,
        completed_at: existing.completed_at,
        origin: existing.origin,
        fast_track: existing.fast_track,
        replaced_node_id: existing.replaced_node_id,
        version: existing.version + 1,
      });
    } else {
      // Newly known or updated todo
      mergedUserNodes.push({
        ...baseUn,
        id: existing ? existing.id : baseUn.id,
        version: existing ? existing.version + 1 : baseUn.version,
      });
    }
  }

  // Any completed, in_progress, or archived nodes that were not in baselineRoadmap must be preserved!
  const additionalNodes: CanonicalNode[] = [];
  const existingNodesById = new Map<string, CanonicalNode>();
  for (const n of currentRoadmap.nodes) {
    existingNodesById.set(n.id, n);
  }

  const baselineNodeIds = new Set(baselineRoadmap.nodes.map((n) => n.id));

  for (const un of currentRoadmap.user_nodes) {
    if (
      !processedNodeIds.has(un.node_id) &&
      (un.status === 'completed' || un.status === 'archived' || un.status === 'in_progress')
    ) {
      mergedUserNodes.push({
        ...un,
        version: un.version + 1,
      });
      processedNodeIds.add(un.node_id);

      if (!baselineNodeIds.has(un.node_id)) {
        const canonical = existingNodesById.get(un.node_id);
        if (canonical) {
          additionalNodes.push(canonical);
          baselineNodeIds.add(un.node_id);
        }
      }
    }
  }

  // Also include any edges among the preserved nodes
  const mergedNodeIds = new Set(mergedUserNodes.map((un) => un.node_id));
  const mergedEdges = canonicalGraph.edges.filter(
    (e) => mergedNodeIds.has(e.from_node) && mergedNodeIds.has(e.to_node),
  );

  return ok({
    user_id: currentRoadmap.user_id,
    domain_id: currentRoadmap.domain_id,
    nodes: [...baselineRoadmap.nodes, ...additionalNodes],
    edges: mergedEdges,
    user_nodes: mergedUserNodes,
  });
}
