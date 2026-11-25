import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  PanResponder,
  Platform,
} from 'react-native';
import { useTheme, Badge } from '../design-system';
import {
  computeGraphLayout,
  cullViewport,
  type EnrichedRoadmapNode,
  type NodePosition,
  type EdgePath,
  type GraphLayout,
} from '../lib/graphLayout';
import type { CanonicalEdge } from '@repo/schemas';

export interface RoadmapGraphCanvasProps {
  nodes: EnrichedRoadmapNode[];
  edges: CanonicalEdge[];
  showLegacy: boolean;
  onSelectNode: (node: EnrichedRoadmapNode) => void;
  selectedNodeId?: string | null;
  onOpenBenchmark?: () => void;
  onToggleLegacy?: () => void;
}

export const RoadmapGraphCanvas: React.FC<RoadmapGraphCanvasProps> = ({
  nodes,
  edges,
  showLegacy,
  onSelectNode,
  selectedNodeId,
  onOpenBenchmark,
  onToggleLegacy,
}) => {
  const { theme, spacing, radii } = useTheme();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  // Orientation: horizontal on tablets/web (>= 768px), vertical on mobile (< 768px)
  const isHorizontal = windowWidth >= 768;

  // Transform state for pan and zoom
  const [scale, setScale] = useState(1.0);
  const [panX, setPanX] = useState(40);
  const [panY, setPanY] = useState(40);

  // Drag tracking ref
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0, initialPanX: 0, initialPanY: 0 });

  // 1. Filter nodes based on Legacy toggle
  const activeNodes = useMemo(() => {
    if (showLegacy) return nodes;
    return nodes.filter((n) => n.status !== 'archived');
  }, [nodes, showLegacy]);

  const activeNodeIds = useMemo(() => {
    return new Set(activeNodes.map((n) => n.id));
  }, [activeNodes]);

  const activeEdges = useMemo(() => {
    return edges.filter(
      (e) => activeNodeIds.has(e.from_node) && activeNodeIds.has(e.to_node),
    );
  }, [edges, activeNodeIds]);

  // 2. Compute Layout (Memoized)
  const layout: GraphLayout = useMemo(() => {
    return computeGraphLayout(activeNodes, activeEdges, {
      orientation: isHorizontal ? 'horizontal' : 'vertical',
      nodeWidth: isHorizontal ? 210 : 180,
      nodeHeight: isHorizontal ? 84 : 76,
      layerGap: isHorizontal ? 120 : 80,
      nodeGap: isHorizontal ? 32 : 24,
      padding: 50,
    });
  }, [activeNodes, activeEdges, isHorizontal]);

  // 3. Viewport Culling
  const viewportWidth = windowWidth;
  const viewportHeight = Math.max(windowHeight - 200, 500);

  const { visibleNodes, visibleEdges } = useMemo(() => {
    return cullViewport(
      layout,
      {
        x: panX,
        y: panY,
        width: viewportWidth,
        height: viewportHeight,
        scale,
      },
      150,
    );
  }, [layout, panX, panY, viewportWidth, viewportHeight, scale]);

  // 4. Pan gesture handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      initialPanX: panX,
      initialPanY: panY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPanX(dragStartRef.current.initialPanX + dx);
    setPanY(dragStartRef.current.initialPanY + dy);
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Touch pan responder for React Native
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current.initialPanX = panX;
        dragStartRef.current.initialPanY = panY;
      },
      onPanResponderMove: (_evt, gestureState) => {
        setPanX(dragStartRef.current.initialPanX + gestureState.dx);
        setPanY(dragStartRef.current.initialPanY + gestureState.dy);
      },
    }),
  ).current;

  // Zoom controls
  const zoomIn = () => setScale((s) => Math.min(2.5, Number((s + 0.2).toFixed(1))));
  const zoomOut = () => setScale((s) => Math.max(0.3, Number((s - 0.2).toFixed(1))));

  const fitToScreen = useCallback(() => {
    if (layout.bounds.width === 0 || layout.bounds.height === 0) return;
    const scaleX = (viewportWidth - 100) / layout.bounds.width;
    const scaleY = (viewportHeight - 100) / layout.bounds.height;
    const fittedScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.35), 1.2);
    setScale(Number(fittedScale.toFixed(2)));
    setPanX(40);
    setPanY(40);
  }, [layout.bounds, viewportWidth, viewportHeight]);

  const centerOnNode = useCallback(
    (nodeId: string) => {
      const pos = layout.nodeMap.get(nodeId);
      if (!pos) return;
      const targetPanX = viewportWidth / 2 - pos.centerX * scale;
      const targetPanY = viewportHeight / 2 - pos.centerY * scale;
      setPanX(targetPanX);
      setPanY(targetPanY);
    },
    [layout.nodeMap, viewportWidth, viewportHeight, scale],
  );

  // Status visual attributes
  const getNodeVisuals = (node: EnrichedRoadmapNode) => {
    const isSelected = node.id === selectedNodeId;

    switch (node.status) {
      case 'completed':
        return {
          border: isSelected ? theme.primary : theme.success,
          bg: theme.surface,
          statusLabel: 'Completed',
          icon: '✅',
          opacity: 1,
        };
      case 'in_progress':
        return {
          border: isSelected ? theme.primary : '#3b82f6',
          bg: theme.surfaceSubtle,
          statusLabel: 'In Progress',
          icon: '⏳',
          opacity: 1,
        };
      case 'available':
        return {
          border: isSelected ? theme.primary : theme.border,
          bg: theme.surface,
          statusLabel: 'Available',
          icon: '🟢',
          opacity: 1,
        };
      case 'locked':
        return {
          border: theme.border,
          bg: theme.surfaceSubtle,
          statusLabel: 'Locked',
          icon: '🔒',
          opacity: 0.75,
        };
      case 'archived':
        return {
          border: theme.border,
          bg: theme.surfaceSubtle,
          statusLabel: 'Archived',
          icon: '📦',
          opacity: 0.45,
        };
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Floating Canvas Action Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.toolbarButtonGroup}>
          <TouchableOpacity
            testID="zoom-in-button"
            onPress={zoomIn}
            style={[styles.toolButton, { borderRightColor: theme.border }]}
            accessibilityLabel="Zoom In"
          >
            <Text style={[styles.toolButtonText, { color: theme.text }]}>＋</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="zoom-out-button"
            onPress={zoomOut}
            style={[styles.toolButton, { borderRightColor: theme.border }]}
            accessibilityLabel="Zoom Out"
          >
            <Text style={[styles.toolButtonText, { color: theme.text }]}>－</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="fit-screen-button"
            onPress={fitToScreen}
            style={[styles.toolButton, { borderRightColor: theme.border }]}
            accessibilityLabel="Fit to Screen"
          >
            <Text style={[styles.toolButtonText, { color: theme.text }]}>⤢ Fit</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolbarButtonGroup}>
          {onToggleLegacy && (
            <TouchableOpacity
              testID="legacy-toggle-button"
              onPress={onToggleLegacy}
              style={[
                styles.toolButton,
                {
                  backgroundColor: showLegacy ? theme.surfaceSubtle : 'transparent',
                  borderRightColor: theme.border,
                },
              ]}
              accessibilityLabel="Toggle Legacy View"
            >
              <Text style={[styles.toolButtonText, { color: showLegacy ? theme.primary : theme.textSecondary }]}>
                📦 Legacy: {showLegacy ? 'ON' : 'OFF'}
              </Text>
            </TouchableOpacity>
          )}

          {onOpenBenchmark && (
            <TouchableOpacity
              testID="open-benchmark-button"
              onPress={onOpenBenchmark}
              style={styles.toolButton}
              accessibilityLabel="Open 200-Node Benchmark"
            >
              <Text style={[styles.toolButtonText, { color: theme.primary, fontWeight: '700' }]}>
                ⚡ Benchmark
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Main Interactive Graph Viewport */}
      <View
        style={[styles.canvasViewport, { height: viewportHeight }]}
        {...(Platform.OS === 'web'
          ? ({
              onMouseDown: handleMouseDown,
              onMouseMove: handleMouseMove,
              onMouseUp: handleMouseUp,
            } as any)
          : panResponder.panHandlers)}
      >
        <View
          style={[
            styles.transformWrapper,
            {
              transform: [
                { translateX: panX },
                { translateY: panY },
                { scale },
              ],
              width: layout.bounds.width || 1000,
              height: layout.bounds.height || 800,
            },
          ]}
        >
          {/* 1. Render Edges (SVG on Web / Lines) */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: layout.bounds.width || 1000,
              height: layout.bounds.height || 800,
              pointerEvents: 'none',
              overflow: 'visible',
            }}
          >
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 1, 8 4, 0 7" fill={theme.border} />
              </marker>
              <marker
                id="arrowhead-active"
                markerWidth="8"
                markerHeight="8"
                refX="6"
                refY="4"
                orient="auto"
              >
                <polygon points="0 1, 8 4, 0 7" fill={theme.primary} />
              </marker>
            </defs>

            {visibleEdges.map((edge) => {
              const isTargetSelected = edge.toNodeId === selectedNodeId;
              return (
                <path
                  key={edge.id}
                  d={edge.pathData}
                  fill="none"
                  stroke={isTargetSelected ? theme.primary : theme.border}
                  strokeWidth={isTargetSelected ? 2.5 : 1.75}
                  strokeDasharray={edge.pathData.length > 500 ? '4 4' : undefined}
                  markerEnd={isTargetSelected ? 'url(#arrowhead-active)' : 'url(#arrowhead)'}
                  opacity={0.8}
                />
              );
            })}
          </svg>

          {/* 2. Render Nodes */}
          {visibleNodes.map((item) => {
            const { node, x, y, width, height } = item;
            const visuals = getNodeVisuals(node);
            const isSelected = node.id === selectedNodeId;

            return (
              <TouchableOpacity
                key={node.id}
                testID={`roadmap-node-${node.slug}`}
                onPress={() => onSelectNode(node)}
                activeOpacity={0.85}
                style={[
                  styles.nodeCard,
                  {
                    left: x,
                    top: y,
                    width,
                    height,
                    backgroundColor: visuals.bg,
                    borderColor: visuals.border,
                    borderWidth: isSelected ? 2.5 : 1.5,
                    opacity: visuals.opacity,
                    borderRadius: radii.md,
                    shadowColor: isSelected ? theme.primary : '#000000',
                    shadowOpacity: isSelected ? 0.25 : 0.05,
                  },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`${node.name}, Status ${visuals.statusLabel}, Type ${node.node_type}`}
                accessibilityHint="Double tap to open node details, update learning progress, or view quickstart guide."
              >
                {/* Node Header: Type & Status */}
                <View style={styles.nodeHeaderRow}>
                  <Text style={styles.nodeTypeIcon}>
                    {node.node_type === 'workflow'
                      ? '🔄'
                      : node.node_type === 'tool'
                        ? '🛠️'
                        : '⚡'}{' '}
                    <Text style={[styles.nodeTypeText, { color: theme.textSecondary }]}>
                      {node.node_type}
                    </Text>
                  </Text>

                  <View style={styles.nodeStatusBadge}>
                    <Text style={styles.statusIcon}>{visuals.icon}</Text>
                    {node.fast_track && (
                      <Text style={[styles.fastTrackStar, { color: theme.verdictOverride }]}>
                        ⚡
                      </Text>
                    )}
                  </View>
                </View>

                {/* Node Title */}
                <Text
                  numberOfLines={2}
                  style={[
                    styles.nodeTitle,
                    {
                      color: theme.text,
                      fontWeight: isSelected ? '800' : '600',
                    },
                  ]}
                >
                  {node.name}
                </Text>

                {/* Node Footer: Level & Status Label */}
                <View style={styles.nodeFooterRow}>
                  <Text style={[styles.nodeLevelText, { color: theme.textMuted }]}>
                    L{node.level} • {visuals.statusLabel}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  toolbar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    zIndex: 10,
  },
  toolbarButtonGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toolButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRightWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 44, // PRD Section 14: Minimum 44px touch target
    minWidth: 44,
  },
  toolButtonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  canvasViewport: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  transformWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  nodeCard: {
    position: 'absolute',
    padding: 10,
    justifyContent: 'space-between',
    elevation: 2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
  },
  nodeHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeTypeIcon: {
    fontSize: 11,
  },
  nodeTypeText: {
    fontSize: 10,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  nodeStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusIcon: {
    fontSize: 12,
  },
  fastTrackStar: {
    fontSize: 12,
    fontWeight: '900',
  },
  nodeTitle: {
    fontSize: 13,
    lineHeight: 17,
  },
  nodeFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeLevelText: {
    fontSize: 11,
    fontWeight: '500',
  },
});
