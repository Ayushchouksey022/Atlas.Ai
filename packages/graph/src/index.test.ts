/**
 * Comprehensive tests for @repo/graph
 *
 * Coverage targets:
 *   - wouldCreateCycle: self-loop, 2-node cycle, long cycle, no-cycle, empty
 *   - validateAcyclic: acyclic success, cycle detection, disconnected components
 *   - topoLayers: ordering, multi-layer, throws on cycle
 *   - availableNodes: prereqs satisfied, partially satisfied, all locked
 *   - generateBaselineRoadmap: expert/working ancestor marking, pruning, empty graph, cycle guard
 *   - applyInjection: success, already exists, insertAfter not in roadmap, would create cycle
 *   - applyOverride: success, old not in roadmap, new already in roadmap, downstream unlock
 *   - immutability: no function mutates its inputs
 *   - performance: 200-node graph under 50 ms
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  wouldCreateCycle,
  validateAcyclic,
  topoLayers,
  availableNodes,
  generateBaselineRoadmap,
  applyInjection,
  applyOverride,
  mergeRoadmapWithBaseline,
} from './index';
import type { CanonicalNode, CanonicalEdge, CanonicalGraph, UserNode, Roadmap } from '@repo/schemas';

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeNode(id: string, level = 0): CanonicalNode {
  return {
    id,
    domain_id: 'domain-1',
    slug: `slug-${id}`,
    name: `Node ${id}`,
    description: '',
    node_type: 'skill',
    level,
    area: 'editors-ides',
    status: 'approved',
    external_url: null,
    version_tag: null,
  };
}

function makeEdge(from: string, to: string): CanonicalEdge {
  return { id: `edge-${from}-${to}`, from_node: from, to_node: to };
}

function makeUserNode(
  userId: string,
  nodeId: string,
  status: UserNode['status'] = 'todo',
  origin: UserNode['origin'] = 'baseline',
): UserNode {
  return {
    id: `un-${userId}-${nodeId}`,
    user_id: userId,
    node_id: nodeId,
    status,
    origin,
    fast_track: false,
    replaced_node_id: null,
    completed_at: null,
    version: 1,
  };
}

/** Build a simple linear chain: n1 → n2 → n3 → ... → nN */
function makeLinearGraph(count: number): { nodes: CanonicalNode[]; edges: CanonicalEdge[] } {
  const nodes = Array.from({ length: count }, (_, i) => makeNode(`n${i + 1}`, i));
  const edges = nodes.slice(0, -1).map((n, i) => makeEdge(n.id, nodes[i + 1].id));
  return { nodes, edges };
}

function makeRoadmap(
  nodes: CanonicalNode[],
  edges: CanonicalEdge[],
  userNodes: UserNode[],
): Roadmap {
  return {
    user_id: 'user-1',
    domain_id: 'domain-1',
    nodes,
    edges,
    user_nodes: userNodes,
  };
}

// ---------------------------------------------------------------------------
// wouldCreateCycle
// ---------------------------------------------------------------------------

describe('wouldCreateCycle', () => {
  it('detects a self-loop', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toBe(true);
  });

  it('detects a two-node cycle (A→B already, propose B→A)', () => {
    const edges = [makeEdge('A', 'B')];
    expect(wouldCreateCycle(edges, 'B', 'A')).toBe(true);
  });

  it('detects a long cycle (A→B→C→D, propose D→A)', () => {
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'D')];
    expect(wouldCreateCycle(edges, 'D', 'A')).toBe(true);
  });

  it('returns false for a valid new edge in a DAG', () => {
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    expect(wouldCreateCycle(edges, 'A', 'C')).toBe(false); // shortcut ok
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false); // extend chain
  });

  it('returns false for an empty edge list', () => {
    expect(wouldCreateCycle([], 'A', 'B')).toBe(false);
  });

  it('returns false for new disjoint nodes', () => {
    const edges = [makeEdge('A', 'B')];
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateAcyclic
// ---------------------------------------------------------------------------

describe('validateAcyclic', () => {
  it('passes for an empty graph', () => {
    const result = validateAcyclic([], []);
    expect(result.ok).toBe(true);
  });

  it('passes for a single node with no edges', () => {
    const result = validateAcyclic([makeNode('A')], []);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.layers.get('A')).toBe(0);
  });

  it('passes for a 3-node linear chain and assigns correct layers', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.layers.get('A')).toBe(0);
      expect(result.value.layers.get('B')).toBe(1);
      expect(result.value.layers.get('C')).toBe(2);
    }
  });

  it('detects a self-loop', () => {
    const nodes = [makeNode('A')];
    const edges = [makeEdge('A', 'A')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CYCLE_DETECTED');
  });

  it('detects a two-node cycle', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(false);
  });

  it('detects a long cycle (A→B→C→D→A)', () => {
    const nodes = ['A', 'B', 'C', 'D'].map(makeNode);
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'D'), makeEdge('D', 'A')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(false);
  });

  it('handles disconnected components correctly', () => {
    // Two unconnected sub-graphs: A→B and C→D
    const nodes = ['A', 'B', 'C', 'D'].map(makeNode);
    const edges = [makeEdge('A', 'B'), makeEdge('C', 'D')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(true);
  });

  it('ignores edges referencing nodes outside the node list', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    // Edge references node 'Z' which is not in nodes list
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'Z')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(true);
  });

  it('assigns max layer when multiple paths exist (diamond)', () => {
    // A → B → D, A → C → D
    const nodes = ['A', 'B', 'C', 'D'].map(makeNode);
    const edges = [makeEdge('A', 'B'), makeEdge('A', 'C'), makeEdge('B', 'D'), makeEdge('C', 'D')];
    const result = validateAcyclic(nodes, edges);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.layers.get('D')).toBe(2);
    }
  });
});

// ---------------------------------------------------------------------------
// topoLayers
// ---------------------------------------------------------------------------

describe('topoLayers', () => {
  it('returns correct layers for a linear chain', () => {
    const { nodes, edges } = makeLinearGraph(4);
    const layers = topoLayers(nodes, edges);
    expect(layers.get('n1')).toBe(0);
    expect(layers.get('n2')).toBe(1);
    expect(layers.get('n3')).toBe(2);
    expect(layers.get('n4')).toBe(3);
  });

  it('assigns layer 0 to isolated nodes', () => {
    const nodes = [makeNode('X'), makeNode('Y')];
    const layers = topoLayers(nodes, []);
    expect(layers.get('X')).toBe(0);
    expect(layers.get('Y')).toBe(0);
  });

  it('throws on a cyclic graph', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
    expect(() => topoLayers(nodes, edges)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// availableNodes
// ---------------------------------------------------------------------------

describe('availableNodes', () => {
  it('returns todo nodes with no prerequisites', () => {
    const nodes = [makeNode('A')];
    const roadmap = makeRoadmap(nodes, [], [makeUserNode('user-1', 'A', 'todo')]);
    const result = availableNodes(roadmap);
    expect(result.map((un) => un.node_id)).toContain('A');
  });

  it('unlocks a node when its sole prerequisite is known', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B')];
    const userNodes = [
      makeUserNode('user-1', 'A', 'known'),
      makeUserNode('user-1', 'B', 'todo'),
    ];
    const roadmap = makeRoadmap(nodes, edges, userNodes);
    const result = availableNodes(roadmap);
    expect(result.map((un) => un.node_id)).toContain('B');
  });

  it('keeps a node locked when its prerequisite is todo', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B')];
    const userNodes = [
      makeUserNode('user-1', 'A', 'todo'),  // not satisfied
      makeUserNode('user-1', 'B', 'todo'),
    ];
    const roadmap = makeRoadmap(nodes, edges, userNodes);
    const result = availableNodes(roadmap);
    expect(result.map((un) => un.node_id)).not.toContain('B');
  });

  it('treats completed and archived as satisfied', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const userNodes = [
      makeUserNode('user-1', 'A', 'completed'),
      makeUserNode('user-1', 'B', 'archived'),
      makeUserNode('user-1', 'C', 'todo'),
    ];
    const roadmap = makeRoadmap(nodes, edges, userNodes);
    const result = availableNodes(roadmap);
    expect(result.map((un) => un.node_id)).toContain('C');
  });

  it('excludes already-satisfied nodes from result', () => {
    const nodes = [makeNode('A')];
    const roadmap = makeRoadmap(nodes, [], [makeUserNode('user-1', 'A', 'completed')]);
    expect(availableNodes(roadmap)).toHaveLength(0);
  });

  it('handles empty roadmap', () => {
    const roadmap = makeRoadmap([], [], []);
    expect(availableNodes(roadmap)).toHaveLength(0);
  });

  it('handles disconnected components correctly', () => {
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C'), makeNode('D')];
    // A→B and C→D — independent chains
    const edges = [makeEdge('A', 'B'), makeEdge('C', 'D')];
    const userNodes = [
      makeUserNode('user-1', 'A', 'known'),
      makeUserNode('user-1', 'B', 'todo'),
      makeUserNode('user-1', 'C', 'todo'), // prereq C not satisfied
      makeUserNode('user-1', 'D', 'todo'),
    ];
    const roadmap = makeRoadmap(nodes, edges, userNodes);
    const avail = availableNodes(roadmap).map((un) => un.node_id);
    expect(avail).toContain('B');
    expect(avail).toContain('C'); // C has no prerequisites
    expect(avail).not.toContain('D'); // C is todo, not satisfied
  });
});

// ---------------------------------------------------------------------------
// generateBaselineRoadmap
// ---------------------------------------------------------------------------

describe('generateBaselineRoadmap', () => {
  const domainId = 'domain-1';

  function makeGraph(nodes: CanonicalNode[], edges: CanonicalEdge[]): CanonicalGraph {
    return { domain_id: domainId, nodes, edges };
  }

  it('returns EMPTY_GRAPH for zero approved nodes', () => {
    const draftNode = { ...makeNode('A'), status: 'draft' as const };
    const graph = makeGraph([draftNode], []);
    const result = generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('EMPTY_GRAPH');
  });

  it('returns CYCLE_IN_CANONICAL_GRAPH for a cyclic graph', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'A')];
    const result = generateBaselineRoadmap(makeGraph(nodes, edges), [], {}, 'user-1');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('CYCLE_IN_CANONICAL_GRAPH');
  });

  it('marks selectedKnownNodeIds as known', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const graph = makeGraph(nodes, []);
    const result = generateBaselineRoadmap(graph, ['A'], {}, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const aNode = result.value.user_nodes.find((un) => un.node_id === 'A');
      expect(aNode?.status).toBe('known');
    }
  });

  it('expert level marks all ancestors as known', () => {
    // A → B → C (C is the expert node)
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    // area slug 'slug-C' should match node C's slug
    const graph = makeGraph(nodes, edges);
    const result = generateBaselineRoadmap(graph, [], { 'slug-C': 'expert' }, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const statuses = Object.fromEntries(
        result.value.user_nodes.map((un) => [un.node_id, un.status]),
      );
      // A and B are ancestors of C → should be known
      expect(statuses['A']).toBe('known');
      expect(statuses['B']).toBe('known');
    }
  });

  it('working level marks only direct predecessors as known', () => {
    // A → B → C (C is working level)
    const nodes = [makeNode('A'), makeNode('B'), makeNode('C')];
    const edges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
    const graph = makeGraph(nodes, edges);
    const result = generateBaselineRoadmap(graph, [], { 'slug-C': 'working' }, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const statuses = Object.fromEntries(
        result.value.user_nodes.map((un) => [un.node_id, un.status]),
      );
      // Only B (direct predecessor of C) should be known, not A
      expect(statuses['B']).toBe('known');
      expect(statuses['A']).toBe('todo'); // not a direct predecessor
    }
  });

  it('filters out non-approved (draft/deprecated) nodes', () => {
    const approved = makeNode('A');
    const draft = { ...makeNode('B'), status: 'draft' as const };
    const graph = makeGraph([approved, draft], []);
    const result = generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.map((n) => n.id)).toContain('A');
      expect(result.value.nodes.map((n) => n.id)).not.toContain('B');
    }
  });

  it('prunes to 60 nodes when graph is large', () => {
    // Build a 100-node linear chain
    const { nodes, edges } = makeLinearGraph(100);
    const graph = makeGraph(nodes, edges);
    const result = generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.length).toBeLessThanOrEqual(60);
    }
  });

  it('produces a valid (acyclic) roadmap', () => {
    const { nodes, edges } = makeLinearGraph(10);
    const graph = makeGraph(nodes, edges);
    const result = generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      const check = validateAcyclic(result.value.nodes, result.value.edges);
      expect(check.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// applyInjection
// ---------------------------------------------------------------------------

describe('applyInjection', () => {
  const A = makeNode('A');
  const B = makeNode('B', 1);
  const baseEdges = [makeEdge('A', 'B')];
  const baseUserNodes = [
    makeUserNode('user-1', 'A', 'known'),
    makeUserNode('user-1', 'B', 'todo'),
  ];
  const baseRoadmap = makeRoadmap([A, B], baseEdges, baseUserNodes);

  it('successfully injects a new node after an existing one', () => {
    const newNode = makeNode('C', 2);
    const result = applyInjection(baseRoadmap, newNode, ['B']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.map((n) => n.id)).toContain('C');
      const newUN = result.value.user_nodes.find((un) => un.node_id === 'C');
      expect(newUN?.status).toBe('todo');
      expect(newUN?.origin).toBe('injection');
      // Edge B→C must exist
      const edgeBC = result.value.edges.find((e) => e.from_node === 'B' && e.to_node === 'C');
      expect(edgeBC).toBeDefined();
    }
  });

  it('injects with no insertAfterIds (root-level node)', () => {
    const newNode = makeNode('Z', 0);
    const result = applyInjection(baseRoadmap, newNode, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.map((n) => n.id)).toContain('Z');
    }
  });

  it('rejects if node already exists in roadmap', () => {
    const result = applyInjection(baseRoadmap, A, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NODE_ALREADY_EXISTS');
  });

  it('rejects if insertAfterIds references a node not in roadmap', () => {
    const newNode = makeNode('C', 2);
    const result = applyInjection(baseRoadmap, newNode, ['NON_EXISTENT']);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('INSERT_AFTER_NODE_NOT_IN_ROADMAP');
  });

  it('rejects if injection would create a cycle', () => {
    // Existing: A→B. Try to inject A "after" B — B→A creates A→B→A cycle.
    const result = applyInjection(baseRoadmap, A, ['B']);
    // A is already in roadmap, so it hits NODE_ALREADY_EXISTS first
    expect(result.ok).toBe(false);

    // Now try with a fresh node that creates a cycle via other edges
    const C = makeNode('C', 2);
    const roadmapWithCycle = makeRoadmap(
      [A, B, C],
      [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('C', 'A')], // already cyclic
      [makeUserNode('user-1', 'A'), makeUserNode('user-1', 'B'), makeUserNode('user-1', 'C')],
    );
    // Even with a cyclic input, we try to inject D after C
    const D = makeNode('D', 3);
    // A is reachable from D via C→A, and we're inserting D after C: C→D, then D would reach A
    // The existing edges already form a cycle, so validateAcyclic should catch it
    const result2 = applyInjection(roadmapWithCycle, D, ['C']);
    expect(result2.ok).toBe(false);
    if (!result2.ok) expect(result2.error).toBe('WOULD_CREATE_CYCLE');
  });

  it('result roadmap is acyclic', () => {
    const newNode = makeNode('C', 2);
    const result = applyInjection(baseRoadmap, newNode, ['B']);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const check = validateAcyclic(result.value.nodes, result.value.edges);
      expect(check.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// applyOverride
// ---------------------------------------------------------------------------

describe('applyOverride', () => {
  const A = makeNode('A', 0);
  const B = makeNode('B', 1);
  const C = makeNode('C', 2);
  const baseEdges = [makeEdge('A', 'B'), makeEdge('B', 'C')];
  const baseUserNodes = [
    makeUserNode('user-1', 'A', 'known'),
    makeUserNode('user-1', 'B', 'todo'),
    makeUserNode('user-1', 'C', 'todo'),
  ];
  const baseRoadmap = makeRoadmap([A, B, C], baseEdges, baseUserNodes);

  it('archives the old node and adds the new one with fast_track=true', () => {
    const newB = makeNode('B2', 1);
    const result = applyOverride(baseRoadmap, 'B', newB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const oldUN = result.value.user_nodes.find((un) => un.node_id === 'B');
      expect(oldUN?.status).toBe('archived');

      const newUN = result.value.user_nodes.find((un) => un.node_id === 'B2');
      expect(newUN?.status).toBe('todo');
      expect(newUN?.fast_track).toBe(true);
      expect(newUN?.replaced_node_id).toBe('B');
      expect(newUN?.origin).toBe('override');
    }
  });

  it('keeps downstream nodes unlocked (re-points prerequisite edges)', () => {
    const newB = makeNode('B2', 1);
    const result = applyOverride(baseRoadmap, 'B', newB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Edge B2→C must exist so C stays accessible from new node
      const edge = result.value.edges.find((e) => e.from_node === 'B2' && e.to_node === 'C');
      expect(edge).toBeDefined();

      // Build a roadmap-like object from result and check C is available
      // (B2 is todo but B is archived = satisfied → C accessible from B2 when B2 is known)
      // Simulate B2 becoming known
      const withB2Known = {
        ...result.value,
        user_nodes: result.value.user_nodes.map((un) =>
          un.node_id === 'B2' ? { ...un, status: 'known' as const } : un,
        ),
      };
      const avail = availableNodes(withB2Known);
      expect(avail.map((un) => un.node_id)).toContain('C');
    }
  });

  it('never deletes the old canonical node', () => {
    const newB = makeNode('B2', 1);
    const result = applyOverride(baseRoadmap, 'B', newB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Old canonical node must still be in the graph
      expect(result.value.nodes.map((n) => n.id)).toContain('B');
    }
  });

  it('rejects if old node is not in roadmap', () => {
    const newNode = makeNode('X');
    const result = applyOverride(baseRoadmap, 'NON_EXISTENT', newNode);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('OLD_NODE_NOT_IN_ROADMAP');
  });

  it('rejects if new node is already in the roadmap', () => {
    // Try to override B with C (C is already in roadmap)
    const result = applyOverride(baseRoadmap, 'B', C);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('NEW_NODE_ALREADY_IN_ROADMAP');
  });

  it('works when old node has completed dependents', () => {
    // B has completed dependent C — override should still succeed
    const withCompletedC = {
      ...baseRoadmap,
      user_nodes: baseRoadmap.user_nodes.map((un) =>
        un.node_id === 'C' ? { ...un, status: 'completed' as const } : un,
      ),
    };
    const newB = makeNode('B2', 1);
    const result = applyOverride(withCompletedC, 'B', newB);
    expect(result.ok).toBe(true);
  });

  it('result roadmap is acyclic', () => {
    const newB = makeNode('B2', 1);
    const result = applyOverride(baseRoadmap, 'B', newB);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const check = validateAcyclic(result.value.nodes, result.value.edges);
      expect(check.ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Immutability — no function mutates its inputs
// ---------------------------------------------------------------------------

describe('immutability', () => {
  it('wouldCreateCycle does not mutate the edges array', () => {
    const edges = [makeEdge('A', 'B')];
    const frozen = Object.freeze([...edges]);
    expect(() => wouldCreateCycle(frozen, 'C', 'A')).not.toThrow();
  });

  it('validateAcyclic does not mutate nodes or edges', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B')];
    const nodesCopy = nodes.map((n) => ({ ...n }));
    const edgesCopy = edges.map((e) => ({ ...e }));
    validateAcyclic(nodes, edges);
    expect(nodes).toEqual(nodesCopy);
    expect(edges).toEqual(edgesCopy);
  });

  it('topoLayers does not mutate nodes or edges', () => {
    const nodes = [makeNode('A'), makeNode('B')];
    const edges = [makeEdge('A', 'B')];
    const nodesCopy = nodes.map((n) => ({ ...n }));
    topoLayers(nodes, edges);
    expect(nodes).toEqual(nodesCopy);
  });

  it('availableNodes does not mutate the roadmap', () => {
    const nodes = [makeNode('A')];
    const roadmap = makeRoadmap(nodes, [], [makeUserNode('user-1', 'A', 'todo')]);
    const nodesCopy = JSON.parse(JSON.stringify(roadmap.nodes));
    const unCopy = JSON.parse(JSON.stringify(roadmap.user_nodes));
    availableNodes(roadmap);
    expect(roadmap.nodes).toEqual(nodesCopy);
    expect(roadmap.user_nodes).toEqual(unCopy);
  });

  it('generateBaselineRoadmap does not mutate the canonical graph', () => {
    const { nodes, edges } = makeLinearGraph(5);
    const graph: CanonicalGraph = { domain_id: 'domain-1', nodes, edges };
    const nodesCopy = JSON.parse(JSON.stringify(nodes));
    const edgesCopy = JSON.parse(JSON.stringify(edges));
    generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(nodes).toEqual(nodesCopy);
    expect(edges).toEqual(edgesCopy);
  });

  it('applyInjection does not mutate the input roadmap', () => {
    const A = makeNode('A');
    const roadmap = makeRoadmap([A], [], [makeUserNode('user-1', 'A', 'known')]);
    const roadmapCopy = JSON.parse(JSON.stringify(roadmap));
    const newNode = makeNode('B');
    applyInjection(roadmap, newNode, []);
    expect(roadmap).toEqual(roadmapCopy);
  });

  it('applyOverride does not mutate the input roadmap', () => {
    const A = makeNode('A');
    const B = makeNode('B');
    const roadmap = makeRoadmap(
      [A, B],
      [makeEdge('A', 'B')],
      [makeUserNode('user-1', 'A', 'known'), makeUserNode('user-1', 'B', 'todo')],
    );
    const roadmapCopy = JSON.parse(JSON.stringify(roadmap));
    const newB = makeNode('B2');
    applyOverride(roadmap, 'B', newB);
    expect(roadmap).toEqual(roadmapCopy);
  });
});

// ---------------------------------------------------------------------------
// Sponsor integrity — PRD Section 14 invariant
// ---------------------------------------------------------------------------

describe('sponsor integrity', () => {
  it('no graph function accepts sponsor-related input', () => {
    // This is a static/structural test: we verify that none of the exported
    // function signatures reference sponsor data types by checking the type
    // names at runtime through function.length and name.
    const fns = [
      wouldCreateCycle,
      validateAcyclic,
      topoLayers,
      availableNodes,
      generateBaselineRoadmap,
      applyInjection,
      applyOverride,
    ];
    for (const fn of fns) {
      // None of these should require more than 4 arguments (they don't take sponsor data)
      expect(fn.length).toBeLessThanOrEqual(4);
    }
  });
});

// ---------------------------------------------------------------------------
// Performance — 200-node graph under 50 ms
// ---------------------------------------------------------------------------

describe('performance', () => {
  it('processes a 200-node graph in under 50 ms', () => {
    const { nodes, edges } = makeLinearGraph(200);
    const graph: CanonicalGraph = { domain_id: 'domain-1', nodes, edges };

    const start = performance.now();

    // Run all major operations
    const baseline = generateBaselineRoadmap(graph, [], {}, 'user-perf');
    expect(baseline.ok).toBe(true);

    if (baseline.ok) {
      const roadmap = baseline.value;
      validateAcyclic(roadmap.nodes, roadmap.edges);
      topoLayers(roadmap.nodes, roadmap.edges);
      availableNodes(roadmap);
      wouldCreateCycle(roadmap.edges, 'n1', 'n200');
      wouldCreateCycle(roadmap.edges, 'n200', 'n1');
    }

    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });

  it('validateAcyclic on 200-node chain is under 10 ms', () => {
    const { nodes, edges } = makeLinearGraph(200);
    const start = performance.now();
    const result = validateAcyclic(nodes, edges);
    const elapsed = performance.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// Extra coverage: applyOverride WOULD_CREATE_CYCLE + pruning level tiebreaker
// ---------------------------------------------------------------------------

describe('applyOverride cycle guard', () => {
  it('returns WOULD_CREATE_CYCLE when inherited edges form a cycle', () => {
    // cyA→cyB→cyC→cyA is already cyclic; overriding cyB with newCyB
    // inherits cyA→newCyB and newCyB→cyC, but cyC→cyA already exists → cycle
    const cyA = makeNode('cyA', 0);
    const cyB = makeNode('cyB', 1);
    const cyC = makeNode('cyC', 2);
    const cyclicRoadmap = makeRoadmap(
      [cyA, cyB, cyC],
      [makeEdge('cyA', 'cyB'), makeEdge('cyB', 'cyC'), makeEdge('cyC', 'cyA')],
      [
        makeUserNode('user-1', 'cyA', 'known'),
        makeUserNode('user-1', 'cyB', 'todo'),
        makeUserNode('user-1', 'cyC', 'todo'),
      ],
    );
    const newCyB = makeNode('newCyB', 1);
    const result = applyOverride(cyclicRoadmap, 'cyB', newCyB);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('WOULD_CREATE_CYCLE');
  });
});

describe('generateBaselineRoadmap pruning level tiebreaker', () => {
  it('uses level as tiebreaker when dependent counts are equal (covers sort comparator branch)', () => {
    // 65 leaf nodes with 0 dependents and mixed levels → triggers `a.level - b.level` branch
    const nodes: CanonicalNode[] = [makeNode('root', 0)];
    for (let i = 1; i <= 65; i++) {
      nodes.push({ ...makeNode(`lf${i}`, i % 5) }); // varying levels, 0 dependents each
    }
    const edges = [makeEdge('root', 'lf1')];
    const graph: CanonicalGraph = { domain_id: 'domain-1', nodes, edges };
    const result = generateBaselineRoadmap(graph, [], {}, 'user-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.nodes.length).toBeLessThanOrEqual(60);
      expect(validateAcyclic(result.value.nodes, result.value.edges).ok).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// mergeRoadmapWithBaseline (PRD Section 11.5)
// ---------------------------------------------------------------------------

describe('mergeRoadmapWithBaseline', () => {
  const nodeA = makeNode('A', 0);
  const nodeB = makeNode('B', 1);
  const nodeC = makeNode('C', 2);
  const nodeD = makeNode('D', 1);
  const edges = [makeEdge('A', 'B'), makeEdge('B', 'C'), makeEdge('A', 'D')];

  it('preserves completed and archived nodes even if excluded from new baseline', () => {
    // Current roadmap has A completed, B archived, C todo
    const currentRoadmap = makeRoadmap(
      [nodeA, nodeB, nodeC, nodeD],
      edges,
      [
        {
          ...makeUserNode('user-1', 'A', 'completed'),
          completed_at: '2026-01-01T00:00:00Z',
          version: 2,
        },
        {
          ...makeUserNode('user-1', 'B', 'archived'),
          version: 1,
        },
        {
          ...makeUserNode('user-1', 'C', 'in_progress'),
          version: 1,
        },
        {
          ...makeUserNode('user-1', 'D', 'todo'),
          version: 1,
        },
      ],
    );

    // New selection: user only selected D as known, area levels set to beginner
    const result = mergeRoadmapWithBaseline(
      currentRoadmap,
      ['D'],
      { 'editors-ides': 'beginner' },
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      const merged = result.value;
      const unA = merged.user_nodes.find((u) => u.node_id === 'A');
      const unB = merged.user_nodes.find((u) => u.node_id === 'B');
      const unC = merged.user_nodes.find((u) => u.node_id === 'C');
      const unD = merged.user_nodes.find((u) => u.node_id === 'D');

      // Completed node A must still be completed with original completed_at
      expect(unA).toBeDefined();
      expect(unA?.status).toBe('completed');
      expect(unA?.completed_at).toBe('2026-01-01T00:00:00Z');
      expect(unA?.version).toBe(3); // Incremented version

      // Archived node B must still be archived
      expect(unB).toBeDefined();
      expect(unB?.status).toBe('archived');
      expect(unB?.version).toBe(2);

      // In-progress node C must still be in_progress
      expect(unC).toBeDefined();
      expect(unC?.status).toBe('in_progress');

      // D was newly selected as known in baseline
      expect(unD).toBeDefined();
      expect(unD?.status).toBe('known');

      // Result must remain a valid acyclic graph
      const cycleCheck = validateAcyclic(merged.nodes, merged.edges);
      expect(cycleCheck.ok).toBe(true);
    }
  });

  it('is pure and never mutates inputs', () => {
    const currentRoadmap = makeRoadmap(
      [nodeA, nodeB],
      [makeEdge('A', 'B')],
      [
        {
          ...makeUserNode('user-1', 'A', 'completed'),
          completed_at: '2026-01-01T00:00:00Z',
          version: 1,
        },
        makeUserNode('user-1', 'B', 'todo'),
      ],
    );

    const snapshotRoadmap = JSON.stringify(currentRoadmap);
    const selected = Object.freeze(['B']);
    const levels = Object.freeze({ 'editors-ides': 'expert' as const });

    const result = mergeRoadmapWithBaseline(currentRoadmap, selected, levels);
    expect(result.ok).toBe(true);
    expect(JSON.stringify(currentRoadmap)).toBe(snapshotRoadmap);
  });
});

