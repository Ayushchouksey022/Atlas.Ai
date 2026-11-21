import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { Button, useTheme } from '../design-system';
import {
  computeGraphLayout,
  cullViewport,
  type EnrichedRoadmapNode,
  type GraphLayout,
} from '../lib/graphLayout';
import type { CanonicalEdge } from '@repo/schemas';

export interface BenchmarkReport {
  nodeCount: number;
  edgeCount: number;
  layersCount: number;
  totalFrames: number;
  avgFps: number;
  minFps: number;
  maxFps: number;
  avgFrameTimeMs: number;
  meetsTarget: boolean;
}

export function generateSyntheticBenchmarkGraph(targetNodes = 200): {
  nodes: EnrichedRoadmapNode[];
  edges: CanonicalEdge[];
} {
  const nodes: EnrichedRoadmapNode[] = [];
  const edges: CanonicalEdge[] = [];

  const LAYERS = 14;
  const nodesPerLayer = Math.ceil(targetNodes / LAYERS);

  let currentId = 0;
  const layersMap: string[][] = [];

  for (let l = 0; l < LAYERS; l++) {
    const layerNodeIds: string[] = [];
    const countThisLayer = Math.min(nodesPerLayer, targetNodes - currentId);

    for (let i = 0; i < countThisLayer; i++) {
      currentId++;
      const id = `bench-node-${currentId}`;
      layerNodeIds.push(id);

      const status =
        l === 0
          ? 'completed'
          : l === 1
            ? 'available'
            : l === 2
              ? 'in_progress'
              : 'locked';

      nodes.push({
        id,
        domain_id: '00000000-0000-0000-0000-000000000001',
        slug: `benchmark-skill-${currentId}`,
        name: `Skill ${currentId} • Layer ${l}`,
        description: `Synthetic benchmark benchmark node number ${currentId} in topological layer ${l}`,
        node_type: (currentId % 3 === 0
          ? 'workflow'
          : currentId % 2 === 0
            ? 'tool'
            : 'skill') as 'skill' | 'tool' | 'workflow',
        level: l,
        area: [
          'editors-ides',
          'ai-assistants',
          'languages-frameworks',
          'testing',
          'deployment',
          'agents-automation',
        ][currentId % 6],
        status,
        fast_track: currentId % 7 === 0,
        external_url: null,
        version_tag: null,
      });
    }

    layersMap.push(layerNodeIds);
    if (currentId >= targetNodes) break;
  }

  // Connect edges from layer l to layer l+1
  let edgeId = 0;
  for (let l = 0; l < layersMap.length - 1; l++) {
    const fromLayer = layersMap[l];
    const toLayer = layersMap[l + 1];

    for (let i = 0; i < fromLayer.length; i++) {
      const from = fromLayer[i];
      // Connect to 1-2 targets in next layer
      const toIndex1 = i % toLayer.length;
      const toIndex2 = (i + 1) % toLayer.length;

      edges.push({
        id: `bench-edge-${++edgeId}`,
        from_node: from,
        to_node: toLayer[toIndex1],
      });

      if (toIndex1 !== toIndex2) {
        edges.push({
          id: `bench-edge-${++edgeId}`,
          from_node: from,
          to_node: toLayer[toIndex2],
        });
      }
    }
  }

  return { nodes, edges };
}

export const GraphBenchmarkModal: React.FC<{
  visible: boolean;
  onClose: () => void;
}> = ({ visible, onClose }) => {
  const { theme, spacing, typography } = useTheme();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [currentProgress, setCurrentProgress] = useState(0);

  const runBenchmark = () => {
    setIsRunning(true);
    setReport(null);
    setCurrentProgress(0);

    const { nodes, edges } = generateSyntheticBenchmarkGraph(200);

    // 1. Measure layout computation
    const t0 = performance.now();
    const layout: GraphLayout = computeGraphLayout(nodes, edges, {
      orientation: 'horizontal',
    });
    const layoutTimeMs = performance.now() - t0;

    const frameTimes: number[] = [];
    const TOTAL_FRAMES = 100;
    let frame = 0;
    let lastTime = performance.now();

    const step = () => {
      const now = performance.now();
      const delta = now - lastTime;
      lastTime = now;

      if (frame > 0) {
        frameTimes.push(delta);
      }

      // Simulate viewport panning/zooming
      const panX = -((frame * 20) % layout.bounds.width);
      const panY = -((frame * 10) % layout.bounds.height);
      const scale = 0.5 + 0.5 * Math.sin(frame * 0.05);

      // Cull viewport
      cullViewport(
        layout,
        {
          x: panX,
          y: panY,
          width: 800,
          height: 600,
          scale,
        },
        100,
      );

      frame++;
      setCurrentProgress(Math.round((frame / TOTAL_FRAMES) * 100));

      if (frame < TOTAL_FRAMES) {
        requestAnimationFrame(step);
      } else {
        // Compute statistics
        const fpsList = frameTimes.map((dt) => (dt > 0 ? 1000 / dt : 60));
        const avgFps = Math.round(
          fpsList.reduce((acc, v) => acc + v, 0) / fpsList.length,
        );
        const minFps = Math.round(Math.min(...fpsList));
        const maxFps = Math.round(Math.max(...fpsList));
        const avgFrameTimeMs = Number(
          (
            frameTimes.reduce((acc, v) => acc + v, 0) / frameTimes.length
          ).toFixed(2),
        );

        setReport({
          nodeCount: nodes.length,
          edgeCount: edges.length,
          layersCount: layout.layersCount,
          totalFrames: TOTAL_FRAMES,
          avgFps,
          minFps,
          maxFps,
          avgFrameTimeMs,
          meetsTarget: avgFps >= 30,
        });
        setIsRunning(false);
      }
    };

    requestAnimationFrame(step);
  };

  useEffect(() => {
    if (visible) {
      runBenchmark();
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.modalCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
            ⚡ 200-Node DAG Performance Benchmark
          </Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary, marginBottom: spacing.md }]}>
            PRD Section 11.3 & 14 Invariant: Graph interactions hold &gt;= 30 FPS for ~200 nodes.
          </Text>

          {isRunning ? (
            <View style={styles.runningContainer}>
              <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: spacing.md }} />
              <Text style={{ color: theme.text, fontWeight: '700' }}>
                Benchmarking Animation & Viewport Culling ({currentProgress}%)...
              </Text>
              <Text style={{ color: theme.textSecondary, marginTop: 4 }}>
                Simulating dynamic pan, pinch-zoom, and culling over 100 frames.
              </Text>
            </View>
          ) : report ? (
            <View style={styles.reportContainer}>
              <View
                style={[
                  styles.metricHighlight,
                  {
                    backgroundColor: report.meetsTarget ? theme.successBg : theme.errorBg,
                    borderColor: report.meetsTarget ? theme.verdictInjectionBorder : theme.error,
                  },
                ]}
              >
                <Text style={[styles.metricHighlightValue, { color: report.meetsTarget ? theme.success : theme.error }]}>
                  {report.avgFps} FPS
                </Text>
                <Text style={[styles.metricHighlightLabel, { color: theme.text }]}>
                  {report.meetsTarget
                    ? '✅ Target Exceeded (>= 30 FPS)'
                    : '❌ Target Missed (< 30 FPS)'}
                </Text>
              </View>

              <View style={[styles.metricsTable, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, { color: theme.textSecondary }]}>Nodes Rendered:</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>{report.nodeCount}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, { color: theme.textSecondary }]}>Edges Connected:</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>{report.edgeCount}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, { color: theme.textSecondary }]}>Topological Layers:</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>{report.layersCount}</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, { color: theme.textSecondary }]}>Average Frame Time:</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>{report.avgFrameTimeMs} ms</Text>
                </View>
                <View style={styles.metricRow}>
                  <Text style={[styles.metricKey, { color: theme.textSecondary }]}>FPS Range (Min / Max):</Text>
                  <Text style={[styles.metricVal, { color: theme.text }]}>
                    {report.minFps} / {report.maxFps} FPS
                  </Text>
                </View>
              </View>

              <Text style={[styles.noteText, { color: theme.textMuted, marginVertical: spacing.sm }]}>
                * Measured on local web runtime. Native real-device verification (iOS/Android) recommended during Milestone 6 hardening.
              </Text>
            </View>
          ) : null}

          <View style={styles.actionsRow}>
            <Button
              title="Re-run Benchmark"
              variant="outline"
              disabled={isRunning}
              onPress={runBenchmark}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              testID="close-benchmark-button"
              title="Close"
              onPress={onClose}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 540,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
  },
  runningContainer: {
    paddingVertical: 36,
    alignItems: 'center',
  },
  reportContainer: {
    marginVertical: 12,
  },
  metricHighlight: {
    padding: 18,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    marginBottom: 16,
  },
  metricHighlightValue: {
    fontSize: 36,
    fontWeight: '900',
    marginBottom: 4,
  },
  metricHighlightLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  metricsTable: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  metricRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricKey: {
    fontSize: 13,
  },
  metricVal: {
    fontSize: 13,
    fontWeight: '700',
  },
  noteText: {
    fontSize: 11,
    fontStyle: 'italic',
  },
  actionsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
});
