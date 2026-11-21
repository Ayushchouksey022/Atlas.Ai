import { describe, it, expect } from 'vitest';
import {
  computeGraphLayout,
  cullViewport,
  type EnrichedRoadmapNode,
} from './graphLayout';
import type { CanonicalEdge } from '@repo/schemas';

describe('computeGraphLayout — Pure DAG Layout Engine', () => {
  const mockNodes: EnrichedRoadmapNode[] = [
    {
      id: 'node-0',
      domain_id: '00000000-0000-0000-0000-000000000001',
      slug: 'root-foundation',
      name: 'Root Foundation',
      description: 'Foundational concept',
      node_type: 'skill',
      level: 0,
      area: 'editors-ides',
      status: 'completed',
      external_url: null,
      version_tag: null,
    },
    {
      id: 'node-1',
      domain_id: '00000000-0000-0000-0000-000000000001',
      slug: 'mid-skill-a',
      name: 'Mid Skill A',
      description: 'Mid layer skill',
      node_type: 'tool',
      level: 1,
      area: 'ai-assistants',
      status: 'available',
      external_url: null,
      version_tag: null,
    },
    {
      id: 'node-2',
      domain_id: '00000000-0000-0000-0000-000000000001',
      slug: 'mid-skill-b',
      name: 'Mid Skill B',
      description: 'Mid layer skill',
      node_type: 'skill',
      level: 1,
      area: 'languages-frameworks',
      status: 'locked',
      external_url: null,
      version_tag: null,
    },
    {
      id: 'node-3',
      domain_id: '00000000-0000-0000-0000-000000000001',
      slug: 'advanced-workflow',
      name: 'Advanced Workflow',
      description: 'Top layer workflow',
      node_type: 'workflow',
      level: 2,
      area: 'agents-automation',
      status: 'locked',
      external_url: null,
      version_tag: null,
    },
  ];

  const mockEdges: CanonicalEdge[] = [
    { id: 'edge-0', from_node: 'node-0', to_node: 'node-1' },
    { id: 'edge-1', from_node: 'node-0', to_node: 'node-2' },
    { id: 'edge-2', from_node: 'node-1', to_node: 'node-3' },
    { id: 'edge-3', from_node: 'node-2', to_node: 'node-3' },
  ];

  it('handles empty graphs gracefully', () => {
    const layout = computeGraphLayout([], []);
    expect(layout.nodes).toEqual([]);
    expect(layout.edges).toEqual([]);
    expect(layout.bounds).toEqual({ width: 0, height: 0 });
    expect(layout.layersCount).toBe(0);
  });

  it('computes horizontal left-to-right layout for web/tablet', () => {
    const layout = computeGraphLayout(mockNodes, mockEdges, {
      orientation: 'horizontal',
      nodeWidth: 200,
      nodeHeight: 80,
      layerGap: 100,
      nodeGap: 40,
      padding: 50,
    });

    expect(layout.nodes.length).toBe(4);
    expect(layout.edges.length).toBe(4);
    expect(layout.layersCount).toBe(3); // Layer 0 (node-0), Layer 1 (node-1, node-2), Layer 2 (node-3)

    const rootPos = layout.nodeMap.get('node-0')!;
    const midAPos = layout.nodeMap.get('node-1')!;
    const midBPos = layout.nodeMap.get('node-2')!;
    const topPos = layout.nodeMap.get('node-3')!;

    // In horizontal layout, X increases by layer
    expect(rootPos.x).toBe(50);
    expect(midAPos.x).toBe(50 + 1 * (200 + 100)); // 350
    expect(midBPos.x).toBe(350);
    expect(topPos.x).toBe(50 + 2 * (200 + 100)); // 650

    // In horizontal layout, nodes in the same layer have different Y positions
    expect(midAPos.y).not.toBe(midBPos.y);

    // Edges start from right edge of fromNode and end at left edge of toNode
    const edge0 = layout.edges.find((e) => e.fromNodeId === 'node-0' && e.toNodeId === 'node-1')!;
    expect(edge0.startX).toBe(rootPos.x + rootPos.width);
    expect(edge0.endX).toBe(midAPos.x);
    expect(edge0.pathData).toContain('M 250');
  });

  it('computes vertical top-to-bottom layout for mobile phones', () => {
    const layout = computeGraphLayout(mockNodes, mockEdges, {
      orientation: 'vertical',
      nodeWidth: 180,
      nodeHeight: 70,
      layerGap: 80,
      nodeGap: 20,
      padding: 30,
    });

    const rootPos = layout.nodeMap.get('node-0')!;
    const midAPos = layout.nodeMap.get('node-1')!;
    const topPos = layout.nodeMap.get('node-3')!;

    // In vertical layout, Y increases by layer
    expect(rootPos.y).toBe(30);
    expect(midAPos.y).toBe(30 + 1 * (70 + 80)); // 180
    expect(topPos.y).toBe(30 + 2 * (70 + 80)); // 330

    // Edges start from bottom of fromNode and end at top of toNode
    const edge0 = layout.edges.find((e) => e.fromNodeId === 'node-0' && e.toNodeId === 'node-1')!;
    expect(edge0.startY).toBe(rootPos.y + rootPos.height);
    expect(edge0.endY).toBe(midAPos.y);
  });

  it('performs viewport culling accurately', () => {
    const layout = computeGraphLayout(mockNodes, mockEdges, {
      orientation: 'horizontal',
      padding: 50,
    });

    // Viewport only looking at the left side (x from 0 to 300)
    const viewport = {
      x: 0,
      y: 0,
      width: 300,
      height: 400,
      scale: 1,
    };

    const { visibleNodes, visibleEdges } = cullViewport(layout, viewport, 20);

    // node-0 is at x: 50, so it's inside
    expect(visibleNodes.some((n) => n.node.id === 'node-0')).toBe(true);

    // node-3 is at x: 650+, so it should be culled
    expect(visibleNodes.some((n) => n.node.id === 'node-3')).toBe(false);

    // Edges connected to visible nodes are kept
    expect(visibleEdges.length).toBeGreaterThan(0);
  });
});
