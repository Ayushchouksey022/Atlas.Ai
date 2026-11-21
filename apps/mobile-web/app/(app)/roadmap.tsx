import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Screen, Badge, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { useRoadmap } from '../../src/lib/useRoadmap';
import { RoadmapGraphCanvas } from '../../src/components/RoadmapGraphCanvas';
import { NodeDetailSheet } from '../../src/components/NodeDetailSheet';
import { GraphBenchmarkModal } from '../../src/components/GraphBenchmarkModal';
import { ConflictNotice } from '../../src/components/ConflictNotice';
import { useRealtimeSync } from '../../src/lib/realtimeSync';
import type { EnrichedRoadmapNode } from '../../src/lib/graphLayout';

export default function RoadmapScreen() {
  const { theme, spacing, typography } = useTheme();
  const { user, profile } = useAuth();
  const userId = user?.id || '00000000-0000-0000-0000-000000000099';

  const { data: roadmap, isLoading, error, updateStatus, refetch } = useRoadmap(userId);
  const { conflictNotice, setConflictNotice, clearConflictNotice } = useRealtimeSync(userId);

  // UI state
  const [selectedNode, setSelectedNode] = useState<EnrichedRoadmapNode | null>(null);
  const [showLegacy, setShowLegacy] = useState(false);
  const [showBenchmark, setShowBenchmark] = useState(false);

  // Prerequisites of the selected node
  const selectedNodePrerequisites = useMemo(() => {
    if (!selectedNode || !roadmap) return [];
    const prereqIds = roadmap.prereqMap.get(selectedNode.id) || [];
    const prereqIdSet = new Set(prereqIds);
    return roadmap.nodes.filter((n) => prereqIdSet.has(n.id));
  }, [selectedNode, roadmap]);

  const handleSelectNode = (node: EnrichedRoadmapNode) => {
    setSelectedNode(node);
  };

  const handleUpdateStatus = async (nodeId: string, newStatus: string) => {
    const res = await updateStatus({
      nodeId,
      newStatus,
      expectedVersion: selectedNode?.version,
    });

    if (res && res.conflict) {
      setConflictNotice(
        'Version conflict: Another session modified this node. The latest version was fetched.',
      );
      return;
    }

    // Update currently inspected node
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode((prev) =>
        prev
          ? {
              ...prev,
              status: (newStatus === 'known' ? 'completed' : newStatus) as any,
              completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
              version: (prev.version || 1) + 1,
            }
          : null,
      );
    }
  };

  return (
    <Screen contentContainerStyle={styles.container}>
      <ConflictNotice message={conflictNotice} onDismiss={clearConflictNotice} />

      {/* Top Learning Profile & Stats Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.headerTitleRow}>
          <View>
            <View style={styles.domainTagRow}>
              <Badge label="AI-Assisted Software Development" variant="primary" />
              <Badge label="Interactive DAG" variant="outline" />
            </View>
            <Text style={[styles.screenTitle, { color: theme.text, ...typography.xl }]}>
              {profile?.display_name ? `${profile.display_name}'s Roadmap` : 'Your Skill Roadmap'}
            </Text>
          </View>

          <Button
            testID="roadmap-benchmark-button"
            title="⚡ 200-Node FPS"
            variant="outline"
            size="sm"
            onPress={() => setShowBenchmark(true)}
          />
        </View>

        {/* Stats Row */}
        {roadmap ? (
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.success }]}>
                {roadmap.stats.completed}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Completed</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: '#3b82f6' }]}>
                {roadmap.stats.inProgress}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>In Progress</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.primary }]}>
                {roadmap.stats.available}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Available</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.textMuted }]}>
                {roadmap.stats.locked}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Locked</Text>
            </View>
            {roadmap.stats.archived > 0 && (
              <>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={[styles.statValue, { color: theme.textMuted }]}>
                    {roadmap.stats.archived}
                  </Text>
                  <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Legacy</Text>
                </View>
              </>
            )}
          </View>
        ) : null}
      </View>

      {/* Main Roadmap Area */}
      {isLoading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ color: theme.textSecondary, marginTop: spacing.md }}>
            Loading prerequisite graph...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centerBox}>
          <Text style={{ color: theme.error, marginBottom: spacing.md }}>
            Failed to load roadmap: {(error as Error).message}
          </Text>
          <Button title="Retry" onPress={() => refetch()} />
        </View>
      ) : roadmap ? (
        <View style={styles.graphContainer}>
          <RoadmapGraphCanvas
            nodes={roadmap.nodes}
            edges={roadmap.edges}
            showLegacy={showLegacy}
            onSelectNode={handleSelectNode}
            selectedNodeId={selectedNode?.id}
            onOpenBenchmark={() => setShowBenchmark(true)}
            onToggleLegacy={() => setShowLegacy((v) => !v)}
          />
        </View>
      ) : null}

      {/* Node Detail Sheet */}
      <NodeDetailSheet
        node={selectedNode}
        visible={selectedNode !== null}
        onClose={() => setSelectedNode(null)}
        prerequisites={selectedNodePrerequisites}
        onUpdateStatus={handleUpdateStatus}
        onSelectNode={(prereqId) => {
          const found = roadmap?.nodes.find((n) => n.id === prereqId);
          if (found) setSelectedNode(found);
        }}
      />

      {/* 200-Node Performance Benchmark Modal */}
      <GraphBenchmarkModal
        visible={showBenchmark}
        onClose={() => setShowBenchmark(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  domainTagRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 4,
  },
  screenTitle: {
    fontWeight: '800',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 16,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(150,150,150,0.2)',
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  graphContainer: {
    flex: 1,
    position: 'relative',
  },
});
