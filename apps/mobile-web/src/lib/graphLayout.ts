import { topoLayers } from '@repo/graph';
import type { CanonicalEdge, CanonicalNode } from '@repo/schemas';

export type NodeVisualStatus =
  | 'locked'
  | 'available'
  | 'in_progress'
  | 'completed'
  | 'archived';

export interface EnrichedRoadmapNode extends Omit<CanonicalNode, 'status'> {
  status: NodeVisualStatus;
  canonicalStatus?: CanonicalNode['status'];
  userNodeId?: string;
  fast_track?: boolean;
  completed_at?: string | null;
  version?: number;
}

export type LayoutOrientation = 'horizontal' | 'vertical';

export interface LayoutOptions {
  orientation?: LayoutOrientation;
  nodeWidth?: number;
  nodeHeight?: number;
  layerGap?: number;
  nodeGap?: number;
  padding?: number;
}

export interface NodePosition {
  node: EnrichedRoadmapNode;
  x: number;
  y: number;
  width: number;
  height: number;
  centerX: number;
  centerY: number;
  layer: number;
}

export interface EdgePath {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  pathData: string;
  arrowhead: {
    tipX: number;
    tipY: number;
    angleRad: number;
  };
}

export interface GraphLayout {
  nodes: NodePosition[];
  edges: EdgePath[];
  nodeMap: Map<string, NodePosition>;
  bounds: {
    width: number;
    height: number;
  };
  layersCount: number;
}

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  orientation: 'horizontal',
  nodeWidth: 200,
  nodeHeight: 80,
  layerGap: 120,
  nodeGap: 30,
  padding: 40,
};

/**
 * Pure function to compute deterministic DAG layout.
 * Uses topological layers from @repo/graph to position nodes in layers.
 * Horizontal: left-to-right (web & tablet).
 * Vertical: top-to-bottom (mobile phone portrait).
 */
export function computeGraphLayout(
  nodes: readonly EnrichedRoadmapNode[],
  edges: readonly CanonicalEdge[],
  userOptions?: LayoutOptions,
): GraphLayout {
  const options: Required<LayoutOptions> = {
    ...DEFAULT_OPTIONS,
    ...userOptions,
  };

  if (nodes.length === 0) {
    return {
      nodes: [],
      edges: [],
      nodeMap: new Map(),
      bounds: { width: 0, height: 0 },
      layersCount: 0,
    };
  }

  // 1. Compute topological layers
  let layerMap: Map<string, number>;
  try {
    layerMap = topoLayers(nodes as any, edges);
  } catch {
    // If fallback or cycle detected, fall back to node.level
    layerMap = new Map();
    for (const n of nodes) {
      layerMap.set(n.id, n.level ?? 0);
    }
  }

  // 2. Group nodes by layer
  const nodesByLayer = new Map<number, EnrichedRoadmapNode[]>();
  let maxLayer = 0;

  for (const node of nodes) {
    const layer = layerMap.get(node.id) ?? 0;
    if (layer > maxLayer) maxLayer = layer;
    if (!nodesByLayer.has(layer)) {
      nodesByLayer.set(layer, []);
    }
    nodesByLayer.get(layer)!.push(node);
  }

  const layersCount = maxLayer + 1;

  // Sort nodes within layers deterministically by area and name
  for (const layerNodes of nodesByLayer.values()) {
    layerNodes.sort((a, b) => {
      if (a.area !== b.area) return a.area.localeCompare(b.area);
      return a.name.localeCompare(b.name);
    });
  }

  // 3. Compute node positions
  const nodePositions: NodePosition[] = [];
  const nodeMap = new Map<string, NodePosition>();

  let maxX = 0;
  let maxY = 0;

  for (let l = 0; l <= maxLayer; l++) {
    const layerNodes = nodesByLayer.get(l) ?? [];

    for (let i = 0; i < layerNodes.length; i++) {
      const node = layerNodes[i];
      let x = 0;
      let y = 0;

      if (options.orientation === 'horizontal') {
        // Horizontal: X is layer, Y is position in layer
        x = options.padding + l * (options.nodeWidth + options.layerGap);
        y = options.padding + i * (options.nodeHeight + options.nodeGap);
      } else {
        // Vertical: Y is layer, X is position in layer
        x = options.padding + i * (options.nodeWidth + options.nodeGap);
        y = options.padding + l * (options.nodeHeight + options.layerGap);
      }

      const nodePos: NodePosition = {
        node,
        x,
        y,
        width: options.nodeWidth,
        height: options.nodeHeight,
        centerX: x + options.nodeWidth / 2,
        centerY: y + options.nodeHeight / 2,
        layer: l,
      };

      nodePositions.push(nodePos);
      nodeMap.set(node.id, nodePos);

      if (x + options.nodeWidth > maxX) maxX = x + options.nodeWidth;
      if (y + options.nodeHeight > maxY) maxY = y + options.nodeHeight;
    }
  }

  // 4. Compute edge paths
  const edgePaths: EdgePath[] = [];

  for (const edge of edges) {
    const from = nodeMap.get(edge.from_node);
    const to = nodeMap.get(edge.to_node);
    if (!from || !to) continue;

    let startX = 0;
    let startY = 0;
    let endX = 0;
    let endY = 0;
    let pathData = '';
    let angleRad = 0;

    if (options.orientation === 'horizontal') {
      // Connect right edge of `from` to left edge of `to`
      startX = from.x + from.width;
      startY = from.y + from.height / 2;
      endX = to.x;
      endY = to.y + to.height / 2;

      const deltaX = Math.max(Math.abs(endX - startX) * 0.5, 30);
      const cp1X = startX + deltaX;
      const cp1Y = startY;
      const cp2X = endX - deltaX;
      const cp2Y = endY;

      pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
      angleRad = Math.atan2(endY - cp2Y, endX - cp2X);
    } else {
      // Connect bottom edge of `from` to top edge of `to`
      startX = from.x + from.width / 2;
      startY = from.y + from.height;
      endX = to.x + to.width / 2;
      endY = to.y;

      const deltaY = Math.max(Math.abs(endY - startY) * 0.5, 30);
      const cp1X = startX;
      const cp1Y = startY + deltaY;
      const cp2X = endX;
      const cp2Y = endY - deltaY;

      pathData = `M ${startX} ${startY} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${endX} ${endY}`;
      angleRad = Math.atan2(endY - cp2Y, endX - cp2X);
    }

    edgePaths.push({
      id: edge.id,
      fromNodeId: edge.from_node,
      toNodeId: edge.to_node,
      startX,
      startY,
      endX,
      endY,
      pathData,
      arrowhead: {
        tipX: endX,
        tipY: endY,
        angleRad,
      },
    });
  }

  return {
    nodes: nodePositions,
    edges: edgePaths,
    nodeMap,
    bounds: {
      width: maxX + options.padding,
      height: maxY + options.padding,
    },
    layersCount,
  };
}

/**
 * Viewport culling helper: returns only nodes and edges that intersect the visible viewport
 * taking zoom scale and pan offset into account.
 */
export function cullViewport(
  layout: GraphLayout,
  viewport: { x: number; y: number; width: number; height: number; scale: number },
  margin = 150,
): { visibleNodes: NodePosition[]; visibleEdges: EdgePath[] } {
  const { x: panX, y: panY, width: vpW, height: vpH, scale } = viewport;

  // Viewport rect in graph coordinate space
  const left = -panX / scale - margin;
  const top = -panY / scale - margin;
  const right = (-panX + vpW) / scale + margin;
  const bottom = (-panY + vpH) / scale + margin;

  const visibleNodes = layout.nodes.filter((node) => {
    return (
      node.x + node.width >= left &&
      node.x <= right &&
      node.y + node.height >= top &&
      node.y <= bottom
    );
  });

  const visibleNodeIds = new Set(visibleNodes.map((n) => n.node.id));

  const visibleEdges = layout.edges.filter((edge) => {
    // Show edge if either connected node is visible or edge intersects viewport
    if (visibleNodeIds.has(edge.fromNodeId) || visibleNodeIds.has(edge.toNodeId)) {
      return true;
    }
    const minEdgeX = Math.min(edge.startX, edge.endX);
    const maxEdgeX = Math.max(edge.startX, edge.endX);
    const minEdgeY = Math.min(edge.startY, edge.endY);
    const maxEdgeY = Math.max(edge.startY, edge.endY);

    return (
      maxEdgeX >= left &&
      minEdgeX <= right &&
      maxEdgeY >= top &&
      minEdgeY <= bottom
    );
  });

  return { visibleNodes, visibleEdges };
}
