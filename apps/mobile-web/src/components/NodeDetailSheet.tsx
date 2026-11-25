import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Badge, Button, useTheme } from '../design-system';
import type { EnrichedRoadmapNode } from '../lib/graphLayout';
import { canTransitionToStatus } from '../lib/roadmapRules';
import { supabase } from '../lib/supabase';
import { QuickstartGuideView, type GuideData } from './QuickstartGuideView';

export interface NodeDetailSheetProps {
  node: EnrichedRoadmapNode | null;
  visible: boolean;
  onClose: () => void;
  prerequisites: EnrichedRoadmapNode[];
  onUpdateStatus: (nodeId: string, newStatus: string) => Promise<void>;
  onSelectNode?: (nodeId: string) => void;
}

export const NodeDetailSheet: React.FC<NodeDetailSheetProps> = ({
  node,
  visible,
  onClose,
  prerequisites,
  onUpdateStatus,
  onSelectNode,
}) => {
  const { theme, spacing, typography, radii, minTouchTarget } = useTheme();
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  // Local status tracking so UI reflects completion immediately
  const [localStatus, setLocalStatus] = useState<string | null>(node?.status ?? null);

  React.useEffect(() => {
    if (node) {
      setLocalStatus(node.status);
      setErrorMessage(null);
      setSuccessBanner(null);
    }
  }, [node?.id, node?.status]);

  // Fetch quickstart guide for this canonical node (cached in TanStack Query)
  const { data: guide, isLoading: isLoadingGuide } = useQuery<GuideData | null>({
    queryKey: ['node_guide', node?.id],
    queryFn: async () => {
      if (!node?.id) return null;
      try {
        const { data, error } = await supabase
          .from('guides')
          .select('*')
          .eq('node_id', node.id)
          .maybeSingle();

        if (error || !data) return null;
        return data as unknown as GuideData;
      } catch {
        return null;
      }
    },
    enabled: Boolean(node?.id),
    staleTime: 60 * 1000,
  });

  if (!node) return null;

  const incompletePrereqs = prerequisites.filter(
    (p) => p.status !== 'completed' && p.status !== 'archived',
  );
  const prereqNames = incompletePrereqs.map((p) => p.name);

  const handleStatusChange = async (targetStatus: string) => {
    setErrorMessage(null);
    setSuccessBanner(null);
    const effectiveStatus = (localStatus || node.status) as any;
    const check = canTransitionToStatus(targetStatus, effectiveStatus, prereqNames);
    if (!check.allowed) {
      setErrorMessage(check.reason || 'This status transition is not permitted.');
      return;
    }

    try {
      setIsUpdating(true);
      setLocalStatus(targetStatus);
      await onUpdateStatus(node.id, targetStatus);
      setIsUpdating(false);
      if (targetStatus === 'completed') {
        setSuccessBanner('🎉 Milestone marked as completed! Next learning step unlocked.');
      }
    } catch (err) {
      setIsUpdating(false);
      setLocalStatus(node.status);
      setErrorMessage((err as Error).message || 'Failed to update status');
    }
  };

  const getStatusBadge = () => {
    const current = localStatus || node.status;
    switch (current) {
      case 'completed':
        return <Badge label="✅ Completed" variant="success" testID="sheet-status-badge" />;
      case 'in_progress':
        return <Badge label="⏳ In Progress" variant="primary" testID="sheet-status-badge" />;
      case 'available':
        return <Badge label="🟢 Available (To Do)" variant="outline" testID="sheet-status-badge" />;
      case 'locked':
        return <Badge label="🔒 Locked" variant="warning" testID="sheet-status-badge" />;
      case 'archived':
        return <Badge label="📦 Archived (Legacy)" variant="default" testID="sheet-status-badge" />;
      default:
        return <Badge label="🟢 Available" variant="outline" testID="sheet-status-badge" />;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropDismiss}
          activeOpacity={1}
          onPress={onClose}
        />
        <View
          style={[
            styles.sheetContainer,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
          {/* Header handle */}
          <View style={[styles.dragHandle, { backgroundColor: theme.border }]} />

          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                {getStatusBadge()}
                {node.fast_track && (
                  <Badge label="⚡ Fast Track" variant="warning" />
                )}
                <Badge
                  label={node.node_type}
                  variant={
                    node.node_type === 'tool'
                      ? 'warning'
                      : node.node_type === 'workflow'
                        ? 'success'
                        : 'outline'
                  }
                />
              </View>
              <Text
                testID="node-detail-title"
                style={[styles.nodeTitle, { color: theme.text, ...typography.xl }]}
              >
                {node.name}
              </Text>
              <Text style={[styles.nodeAreaText, { color: theme.textSecondary }]}>
                Area: {node.area} • Level {node.level}
              </Text>
            </View>

            <TouchableOpacity
              testID="close-detail-sheet-button"
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: theme.surfaceSubtle, minHeight: minTouchTarget, minWidth: minTouchTarget },
              ]}
              accessibilityLabel="Close detail sheet"
            >
              <Text style={[styles.closeIcon, { color: theme.text }]}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.scrollContent}>
            {/* Description */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Description</Text>
              <Text style={[styles.descriptionText, { color: theme.textSecondary }]}>
                {node.description || 'Foundational topic for software development.'}
              </Text>
            </View>

            {/* Success Banner */}
            {successBanner && (
              <View
                style={[
                  styles.successBox,
                  { backgroundColor: 'rgba(22, 163, 74, 0.1)', borderColor: '#16a34a' },
                ]}
              >
                <Text style={[styles.successText, { color: '#15803d' }]}>
                  {successBanner}
                </Text>
              </View>
            )}

            {/* Error / Locked Warning Banner */}
            {errorMessage ? (
              <View style={[styles.errorBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.error }]}>
                <Text testID="node-detail-error" style={[styles.errorText, { color: theme.error }]}>
                  {errorMessage}
                </Text>
              </View>
            ) : (localStatus || node.status) === 'locked' ? (
              <View style={[styles.warningBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.verdictOverrideBorder }]}>
                <Text style={[styles.warningText, { color: theme.verdictOverride }]}>
                  🔒 <Text style={{ fontWeight: '700' }}>Node Locked:</Text> You must satisfy all prerequisite concepts before marking this skill completed.
                </Text>
              </View>
            ) : null}

            {/* Prerequisites Section */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Prerequisites ({prerequisites.length})
              </Text>
              {prerequisites.length === 0 ? (
                <Text style={[styles.emptyPrereqText, { color: theme.textMuted }]}>
                  None — this is a foundational entry point.
                </Text>
              ) : (
                <View style={styles.prereqList}>
                  {prerequisites.map((p) => {
                    const isDone = p.status === 'completed' || p.status === 'archived';
                    return (
                      <TouchableOpacity
                        key={p.id}
                        testID={`prereq-item-${p.slug}`}
                        onPress={() => onSelectNode?.(p.id)}
                        style={[
                          styles.prereqCard,
                          {
                            backgroundColor: theme.surfaceSubtle,
                            borderColor: isDone ? theme.success : theme.border,
                          },
                        ]}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.prereqName, { color: theme.text }]}>
                            {p.name}
                          </Text>
                          <Text style={[styles.prereqArea, { color: theme.textMuted }]}>
                            {p.area} • Level {p.level}
                          </Text>
                        </View>
                        <Badge
                          label={isDone ? '✓ Met' : '⏳ Incomplete'}
                          variant={isDone ? 'success' : 'warning'}
                        />
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>

            {/* Status Controls */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>Learning Progress</Text>
              {isUpdating ? (
                <ActivityIndicator size="small" color={theme.primary} style={{ marginVertical: 12 }} />
              ) : (
                <View style={styles.statusButtonsGrid}>
                  {(localStatus || node.status) !== 'completed' ? (
                    <Button
                      testID="mark-completed-button"
                      title="✓ Mark as Completed"
                      variant="primary"
                      disabled={(localStatus || node.status) === 'locked'}
                      onPress={() => handleStatusChange('completed')}
                      style={{ marginBottom: spacing.sm }}
                    />
                  ) : (
                    <Button
                      testID="reset-todo-button"
                      title="↩ Mark as Incomplete (Undo)"
                      variant="outline"
                      onPress={() => handleStatusChange('available')}
                      style={{ marginBottom: spacing.sm }}
                    />
                  )}

                  {(localStatus || node.status) === 'available' && (
                    <Button
                      testID="mark-in-progress-button"
                      title="⏳ Set In Progress"
                      variant="secondary"
                      onPress={() => handleStatusChange('in_progress')}
                      style={{ marginBottom: spacing.sm }}
                    />
                  )}

                  {node.status !== 'archived' && (
                    <Button
                      testID="archive-node-button"
                      title="📦 Move to Legacy (Archive)"
                      variant="ghost"
                      onPress={() => handleStatusChange('archived')}
                    />
                  )}
                </View>
              )}
            </View>

            {/* 20-Minute Quickstart Guide (Prompt 13 / PRD 10.4) */}
            <QuickstartGuideView
              nodeId={node.id}
              nodeName={node.name}
              externalUrl={node.external_url}
              guide={guide}
              isLoading={isLoadingGuide}
            />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdropDismiss: {
    flex: 1,
  },
  sheetContainer: {
    maxHeight: '85%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
  },
  dragHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  nodeTitle: {
    fontWeight: '800',
    marginBottom: 2,
  },
  nodeAreaText: {
    fontSize: 13,
  },
  closeButton: {
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  closeIcon: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  section: {
    marginVertical: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 14,
    lineHeight: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
  },
  warningBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  warningText: {
    fontSize: 13,
    lineHeight: 18,
  },
  successBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 8,
  },
  successText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
  },
  emptyPrereqText: {
    fontSize: 13,
    fontStyle: 'italic',
  },
  prereqList: {
    gap: 8,
  },
  prereqCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  prereqName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  prereqArea: {
    fontSize: 12,
  },
  statusButtonsGrid: {
    marginTop: 6,
  },
  guideBox: {
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 14,
  },
  guideTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 4,
  },
  guideText: {
    fontSize: 13,
    lineHeight: 18,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
