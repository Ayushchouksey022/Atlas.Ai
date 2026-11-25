import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Screen, Badge, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { RoadmapGraphCanvas } from '../../src/components/RoadmapGraphCanvas';
import { NodeDetailSheet } from '../../src/components/NodeDetailSheet';
import {
  SKILL_JOURNEYS,
  loadJourneyProgress,
  saveMilestoneStatus,
  getEnrichedJourneyNodes,
  type SkillJourney,
} from '../../src/lib/skillJourneys';
import type { EnrichedRoadmapNode } from '../../src/lib/graphLayout';

export default function RoadmapScreen() {
  const { theme, spacing, typography, radii, minTouchTarget } = useTheme();
  const { user } = useAuth();
  const userId = user?.id || 'demo-user-default';
  const params = useLocalSearchParams<{ highlight?: string; journey?: string }>();

  // 1. Active Skill Journey Selection
  const [activeJourneyId, setActiveJourneyId] = useState<string>(
    params.journey || 'video-editing-ai',
  );

  // 2. View Mode: 'pathway' (step-by-step cards) or 'graph' (flowchart)
  const [viewMode, setViewMode] = useState<'pathway' | 'graph'>('pathway');

  // 3. User progress storage (milestoneId -> status)
  const [userProgress, setUserProgress] = useState<Record<string, string>>(() =>
    loadJourneyProgress(userId),
  );

  // 4. Modal inspection state
  const [selectedNode, setSelectedNode] = useState<EnrichedRoadmapNode | null>(null);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(params.highlight || null);
  const [celebrationToast, setCelebrationToast] = useState<string | null>(null);
  const lastHandledHighlight = useRef<string | null>(null);

  // Active Journey Object
  const activeJourney = useMemo<SkillJourney>(() => {
    return (
      SKILL_JOURNEYS.find((j) => j.id === activeJourneyId) ||
      SKILL_JOURNEYS[0]
    );
  }, [activeJourneyId]);

  // Enriched nodes for the active journey based on user progress
  const enrichedNodes = useMemo<EnrichedRoadmapNode[]>(() => {
    return getEnrichedJourneyNodes(activeJourney, userProgress);
  }, [activeJourney, userProgress]);

  // Compute Journey Stats
  const stats = useMemo(() => {
    let completed = 0;
    let available = 0;
    let inProgress = 0;
    let locked = 0;

    for (const node of enrichedNodes) {
      if (node.status === 'completed') completed++;
      else if (node.status === 'available') available++;
      else if (node.status === 'in_progress') inProgress++;
      else if (node.status === 'locked') locked++;
    }

    const total = enrichedNodes.length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { completed, available, inProgress, locked, total, percent };
  }, [enrichedNodes]);

  // Prerequisite map for the selected node
  const selectedNodePrerequisites = useMemo<EnrichedRoadmapNode[]>(() => {
    if (!selectedNode) return [];
    const milestone = activeJourney.milestones.find((m) => m.id === selectedNode.id);
    if (!milestone) return [];
    const prereqSet = new Set(milestone.prerequisites);
    return enrichedNodes.filter((n) => prereqSet.has(n.id));
  }, [selectedNode, activeJourney, enrichedNodes]);

  // Sync active journey from navigation params
  useEffect(() => {
    if (params.journey && params.journey !== activeJourneyId) {
      setActiveJourneyId(params.journey);
    }
  }, [params.journey, activeJourneyId]);

  // Auto-highlight node if passed in params (does not force modal popup open)
  useEffect(() => {
    if (params.highlight && lastHandledHighlight.current !== params.highlight) {
      lastHandledHighlight.current = params.highlight;
      // Reload latest local storage progress in case verdict was just applied
      const freshProgress = loadJourneyProgress(userId);
      setUserProgress(freshProgress);

      const match = enrichedNodes.find((n) => n.id === params.highlight || n.slug === params.highlight);
      if (match) {
        setHighlightedNodeId(match.id);
      }
    }
  }, [params.highlight, enrichedNodes, userId]);

  // Handle Mark as Completed / Status change
  const handleUpdateStatus = async (nodeId: string, newStatus: string) => {
    const updated = saveMilestoneStatus(userId, nodeId, newStatus);
    setUserProgress({ ...updated });

    const milestone = activeJourney.milestones.find((m) => m.id === nodeId);
    const milestoneName = milestone?.name || 'Milestone';

    if (newStatus === 'completed') {
      setCelebrationToast(`🎉 "${milestoneName}" completed! Next step unlocked.`);
      setTimeout(() => {
        setCelebrationToast(null);
      }, 4500);
    } else {
      setCelebrationToast(null);
    }

    // Update currently inspected node
    if (selectedNode && selectedNode.id === nodeId) {
      setSelectedNode((prev) =>
        prev
          ? {
              ...prev,
              status: newStatus as any,
              completed_at: newStatus === 'completed' ? new Date().toISOString() : null,
            }
          : null,
      );
    }
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        {/* Celebration Toast */}
        {celebrationToast && (
          <View style={styles.toastContainer}>
            <Text style={styles.toastText}>{celebrationToast}</Text>
            <TouchableOpacity onPress={() => setCelebrationToast(null)}>
              <Text style={styles.toastClose}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 1. Skill Journey Selector Tabs */}
        <View style={styles.journeyTabsWrapper}>
          <Text style={[styles.sectionHeading, { color: theme.textSecondary }]}>
            SELECT A SKILL JOURNEY
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.journeyPillsRow}
          >
            {SKILL_JOURNEYS.map((journey) => {
              const isSelected = journey.id === activeJourney.id;
              const jNodes = getEnrichedJourneyNodes(journey, userProgress);
              const jCompleted = jNodes.filter((n) => n.status === 'completed').length;
              const isDone = jCompleted === journey.milestones.length;

              return (
                <TouchableOpacity
                  key={journey.id}
                  testID={`journey-tab-${journey.id}`}
                  onPress={() => {
                    setActiveJourneyId(journey.id);
                    setHighlightedNodeId(null);
                  }}
                  style={[
                    styles.journeyPill,
                    {
                      backgroundColor: isSelected ? journey.color : theme.surface,
                      borderColor: isSelected ? journey.color : theme.border,
                    },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: isSelected }}
                >
                  <Text style={styles.pillIcon}>{journey.icon}</Text>
                  <Text
                    style={[
                      styles.pillTitle,
                      { color: isSelected ? '#ffffff' : theme.text },
                    ]}
                  >
                    {journey.title}
                  </Text>
                  <View
                    style={[
                      styles.pillBadge,
                      {
                        backgroundColor: isSelected
                          ? 'rgba(255, 255, 255, 0.25)'
                          : isDone
                            ? 'rgba(22, 163, 74, 0.15)'
                            : theme.surfaceSubtle,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillBadgeText,
                        { color: isSelected ? '#ffffff' : isDone ? theme.success : theme.textMuted },
                      ]}
                    >
                      {isDone ? '✓ Done' : `${jCompleted}/${journey.milestones.length}`}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 2. Active Journey Hero Header */}
        <View
          style={[
            styles.heroCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderTopColor: activeJourney.color,
            },
          ]}
        >
          <View style={styles.heroTopRow}>
            <View style={styles.heroTitleGroup}>
              <View style={styles.titleWithIcon}>
                <Text style={styles.heroIcon}>{activeJourney.icon}</Text>
                <View>
                  <Text style={[styles.heroTitle, { color: theme.text }]}>
                    {activeJourney.title}
                  </Text>
                  <Text style={[styles.heroTagline, { color: theme.textSecondary }]}>
                    {activeJourney.tagline}
                  </Text>
                </View>
              </View>
            </View>

            {/* View Mode Toggle */}
            <View style={[styles.viewModeToggle, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <TouchableOpacity
                onPress={() => setViewMode('pathway')}
                style={[
                  styles.toggleBtn,
                  viewMode === 'pathway' && { backgroundColor: theme.surface, elevation: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    { color: viewMode === 'pathway' ? theme.primary : theme.textSecondary, fontWeight: viewMode === 'pathway' ? '700' : '500' },
                  ]}
                >
                  📋 Pathway
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setViewMode('graph')}
                style={[
                  styles.toggleBtn,
                  viewMode === 'graph' && { backgroundColor: theme.surface, elevation: 1 },
                ]}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    { color: viewMode === 'graph' ? theme.primary : theme.textSecondary, fontWeight: viewMode === 'graph' ? '700' : '500' },
                  ]}
                >
                  🗺️ Flowchart
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Progress Bar */}
          <View style={styles.progressSection}>
            <View style={styles.progressInfoRow}>
              <Text style={[styles.progressLabel, { color: theme.text }]}>
                {stats.completed} of {stats.total} Milestones Completed
              </Text>
              <Text style={[styles.progressPercent, { color: activeJourney.color }]}>
                {stats.percent}% Complete
              </Text>
            </View>
            <View style={[styles.progressBarTrack, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressBarFill,
                  {
                    width: `${stats.percent}%`,
                    backgroundColor: activeJourney.color,
                  },
                ]}
              />
            </View>
          </View>

          {/* Stats Chips */}
          <View style={styles.statChipsRow}>
            <View style={[styles.statChip, { backgroundColor: 'rgba(22, 163, 74, 0.1)', borderColor: '#16a34a' }]}>
              <Text style={[styles.statChipText, { color: '#15803d' }]}>
                ✅ {stats.completed} Completed
              </Text>
            </View>
            <View style={[styles.statChip, { backgroundColor: 'rgba(59, 130, 246, 0.1)', borderColor: '#3b82f6' }]}>
              <Text style={[styles.statChipText, { color: '#2563eb' }]}>
                🟢 {stats.available} Ready to Learn
              </Text>
            </View>
            {stats.locked > 0 && (
              <View style={[styles.statChip, { backgroundColor: 'rgba(100, 116, 139, 0.1)', borderColor: '#94a3b8' }]}>
                <Text style={[styles.statChipText, { color: '#64748b' }]}>
                  🔒 {stats.locked} Locked
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* 3. Pathway View (Step-by-Step Clean Milestones) */}
        {viewMode === 'pathway' ? (
          <View style={styles.pathwayContainer}>
            {enrichedNodes.map((node, index) => {
              const milestone = activeJourney.milestones.find((m) => m.id === node.id)!;
              const isCompleted = node.status === 'completed';
              const isAvailable = node.status === 'available';
              const isInProgress = node.status === 'in_progress';
              const isLocked = node.status === 'locked';
              const isLast = index === enrichedNodes.length - 1;

              return (
                <View key={node.id} style={styles.stepRow}>
                  {/* Left Column: Number Bubble & Connector Line */}
                  <View style={styles.stepIndicatorCol}>
                    <TouchableOpacity
                      onPress={() => {
                        if (isAvailable || isInProgress) {
                          void handleUpdateStatus(node.id, 'completed');
                        } else if (isCompleted) {
                          void handleUpdateStatus(node.id, 'available');
                        }
                      }}
                      style={[
                        styles.stepCircle,
                        isCompleted && { backgroundColor: theme.success, borderColor: theme.success },
                        isAvailable && { backgroundColor: activeJourney.color, borderColor: activeJourney.color },
                        isInProgress && { backgroundColor: '#3b82f6', borderColor: '#3b82f6' },
                        isLocked && { backgroundColor: theme.surfaceSubtle, borderColor: theme.border },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Step ${index + 1}: ${node.name}`}
                    >
                      <Text style={[styles.stepCircleText, isLocked && { color: theme.textMuted }]}>
                        {isCompleted ? '✓' : isLocked ? '🔒' : index + 1}
                      </Text>
                    </TouchableOpacity>
                    {!isLast && (
                      <View
                        style={[
                          styles.stepConnector,
                          {
                            backgroundColor: isCompleted ? theme.success : theme.border,
                          },
                        ]}
                      />
                    )}
                  </View>

                  {/* Right Column: Step Milestone Card */}
                  <View style={styles.stepCardCol}>
                    <TouchableOpacity
                      activeOpacity={0.9}
                      onPress={() => setSelectedNode(node)}
                      style={[
                        styles.milestoneCard,
                        {
                          backgroundColor: theme.surface,
                          borderColor: isCompleted
                            ? theme.success
                            : isAvailable
                              ? activeJourney.color
                              : theme.border,
                        },
                        highlightedNodeId === node.id && {
                          borderWidth: 2.5,
                          borderColor: activeJourney.color,
                        },
                      ]}
                    >
                      {/* Card Header: Step Pill + Badge */}
                      <View style={styles.cardHeaderRow}>
                        <View style={styles.stepPill}>
                          <Text style={[styles.stepPillText, { color: activeJourney.color }]}>
                            STEP {index + 1}
                          </Text>
                          <Text style={[styles.stepDot, { color: theme.textMuted }]}>•</Text>
                          <Text style={[styles.stepAreaText, { color: theme.textSecondary }]}>
                            {node.area}
                          </Text>
                        </View>

                        {isCompleted ? (
                          <Badge label="✅ Completed" variant="success" />
                        ) : isInProgress ? (
                          <Badge label="⏳ In Progress" variant="primary" />
                        ) : isAvailable ? (
                          <Badge label="🟢 Ready to Learn" variant="outline" />
                        ) : (
                          <Badge label="🔒 Locked" variant="warning" />
                        )}
                      </View>

                      {/* Milestone Title & Description */}
                      <Text style={[styles.milestoneTitle, { color: theme.text }]}>
                        {node.name}
                      </Text>
                      <Text style={[styles.milestoneDesc, { color: theme.textSecondary }]}>
                        {node.description}
                      </Text>

                      {/* Tools & Time Meta */}
                      <View style={styles.metaRow}>
                        <View style={styles.toolsList}>
                          {milestone.tools.map((tool) => (
                            <View
                              key={tool}
                              style={[styles.toolTag, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}
                            >
                              <Text style={[styles.toolTagText, { color: theme.text }]}>
                                {tool}
                              </Text>
                            </View>
                          ))}
                        </View>
                        <Text style={[styles.durationText, { color: theme.textMuted }]}>
                          ⏱️ ~{milestone.duration_minutes}m
                        </Text>
                      </View>

                      {/* Bottom Action Row */}
                      <View style={[styles.cardFooter, { borderTopColor: theme.border }]}>
                        {isAvailable || isInProgress ? (
                          <View style={styles.actionButtonsRow}>
                            <TouchableOpacity
                              testID={`complete-step-${node.id}`}
                              onPress={() => void handleUpdateStatus(node.id, 'completed')}
                              style={[
                                styles.quickCompleteBtn,
                                { backgroundColor: theme.success },
                              ]}
                            >
                              <Text style={styles.quickCompleteText}>✓ Mark as Completed</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                              onPress={() => setSelectedNode(node)}
                              style={[
                                styles.viewGuideBtn,
                                { borderColor: theme.border, backgroundColor: theme.surfaceSubtle },
                              ]}
                            >
                              <Text style={[styles.viewGuideText, { color: theme.text }]}>
                                View Guide & Details 📖
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : isCompleted ? (
                          <View style={styles.completedFooterRow}>
                            <Text style={[styles.completedNotice, { color: theme.success }]}>
                              ✓ Mastered & Completed
                            </Text>
                            <TouchableOpacity
                              onPress={() => void handleUpdateStatus(node.id, 'available')}
                              style={styles.undoBtn}
                            >
                              <Text style={[styles.undoText, { color: theme.textMuted }]}>
                                ↩ Mark Incomplete
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <View style={styles.lockedFooterRow}>
                            <Text style={[styles.lockedNotice, { color: theme.textMuted }]}>
                              🔒 Complete previous step to unlock
                            </Text>
                            <TouchableOpacity
                              onPress={() => setSelectedNode(node)}
                              style={styles.inspectBtn}
                            >
                              <Text style={[styles.inspectText, { color: theme.primary }]}>
                                View Requirements
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          /* 4. Graph Flowchart View (Clean 5-6 node visual flow) */
          <View style={[styles.graphWrapper, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.graphNoticeBar}>
              <Text style={[styles.graphNoticeText, { color: theme.textSecondary }]}>
                Prerequisite flow for <Text style={{ fontWeight: '700' }}>{activeJourney.title}</Text>. Click any milestone to open details.
              </Text>
            </View>
            <RoadmapGraphCanvas
              nodes={enrichedNodes}
              edges={activeJourney.edges}
              showLegacy={false}
              onSelectNode={(node) => setSelectedNode(node)}
              selectedNodeId={selectedNode?.id}
            />
          </View>
        )}
      </ScrollView>

      {/* Node Detail Sheet & Guide Modal */}
      <NodeDetailSheet
        node={selectedNode}
        visible={Boolean(selectedNode)}
        onClose={() => setSelectedNode(null)}
        prerequisites={selectedNodePrerequisites}
        onUpdateStatus={handleUpdateStatus}
        onSelectNode={(nodeId) => {
          const match = enrichedNodes.find((n) => n.id === nodeId);
          if (match) setSelectedNode(match);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContainer: {
    paddingBottom: 48,
  },
  toastContainer: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  toastText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  toastClose: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 12,
  },
  journeyTabsWrapper: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  journeyPillsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 4,
  },
  journeyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    gap: 8,
  },
  pillIcon: {
    fontSize: 18,
  },
  pillTitle: {
    fontSize: 14,
    fontWeight: '600',
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  pillBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderTopWidth: 4,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: 12,
  },
  heroTitleGroup: {
    flex: 1,
    minWidth: 260,
  },
  titleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroIcon: {
    fontSize: 34,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  heroTagline: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  viewModeToggle: {
    flexDirection: 'row',
    borderRadius: 20,
    borderWidth: 1,
    padding: 3,
  },
  toggleBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  toggleBtnText: {
    fontSize: 12,
  },
  progressSection: {
    marginTop: 20,
  },
  progressInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '700',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  statChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
    flexWrap: 'wrap',
  },
  statChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  statChipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  pathwayContainer: {
    paddingHorizontal: 16,
    marginTop: 20,
  },
  stepRow: {
    flexDirection: 'row',
  },
  stepIndicatorCol: {
    alignItems: 'center',
    width: 44,
    marginRight: 12,
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  stepCircleText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '800',
  },
  stepConnector: {
    width: 3,
    flex: 1,
    minHeight: 30,
    marginVertical: 4,
  },
  stepCardCol: {
    flex: 1,
    paddingBottom: 20,
  },
  milestoneCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  stepDot: {
    fontSize: 12,
  },
  stepAreaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  milestoneTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  milestoneDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
    gap: 8,
  },
  toolsList: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  toolTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  toolTagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  durationText: {
    fontSize: 12,
    fontWeight: '500',
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  actionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  quickCompleteBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickCompleteText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  viewGuideBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
  },
  viewGuideText: {
    fontSize: 13,
    fontWeight: '600',
  },
  completedFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  completedNotice: {
    fontSize: 13,
    fontWeight: '700',
  },
  undoBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  undoText: {
    fontSize: 12,
    fontWeight: '500',
  },
  lockedFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lockedNotice: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  inspectBtn: {
    paddingVertical: 4,
  },
  inspectText: {
    fontSize: 12,
    fontWeight: '600',
  },
  graphWrapper: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    height: 480,
  },
  graphNoticeBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  graphNoticeText: {
    fontSize: 12,
  },
});
