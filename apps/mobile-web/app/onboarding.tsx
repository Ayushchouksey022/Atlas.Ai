import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, Input, Badge, useTheme } from '../src/design-system';
import { useAuth } from '../src/lib/AuthProvider';
import {
  useOnboardingStore,
  CANONICAL_AREAS,
  type OnboardingStep,
} from '../src/lib/onboardingStore';
import {
  fetchApprovedCanonicalNodes,
  getBundledCanonicalGraph,
  createBaselineRoadmap,
} from '../src/lib/roadmapService';
import { trackEvent } from '../src/lib/events';
import type { CanonicalNode } from '@repo/schemas';

export default function OnboardingScreen() {
  const { theme, spacing, typography, radii, minTouchTarget } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();

  const store = useOnboardingStore();
  const [nodes, setNodes] = useState<CanonicalNode[]>(() => getBundledCanonicalGraph().nodes);
  const [loadingNodes, setLoadingNodes] = useState(false);

  // Attempt to restore existing state on mount (abandon midway & return)
  useEffect(() => {
    store.restore();
    let isMounted = true;
    void (async () => {
      try {
        const fetched = await fetchApprovedCanonicalNodes();
        if (isMounted) {
          setNodes(fetched);
          setLoadingNodes(false);
        }
      } catch {
        if (isMounted) setLoadingNodes(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Filter nodes based on search query and area filter
  const filteredNodes = useMemo(() => {
    let result = nodes;
    if (store.selectedAreaFilter) {
      result = result.filter((n) => n.area === store.selectedAreaFilter);
    }
    if (store.searchQuery.trim()) {
      const q = store.searchQuery.toLowerCase().trim();
      result = result.filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.slug.toLowerCase().includes(q) ||
          n.description.toLowerCase().includes(q),
      );
    }
    return result;
  }, [nodes, store.selectedAreaFilter, store.searchQuery]);

  // Group nodes by canonical area
  const nodesByArea = useMemo(() => {
    const map = new Map<string, CanonicalNode[]>();
    for (const area of CANONICAL_AREAS) {
      map.set(area.slug, []);
    }
    for (const node of filteredNodes) {
      const list = map.get(node.area) || [];
      list.push(node);
      map.set(node.area, list);
    }
    return map;
  }, [filteredNodes]);

  // Step 1: Start onboarding
  const handleStartOnboarding = async () => {
    store.startOnboarding();
    await trackEvent('onboarding_started', {
      domain: store.domainSlug,
      timestamp: new Date().toISOString(),
      user_id: user?.id,
    });
  };

  // Step 4: Generate baseline roadmap
  const handleGenerateRoadmap = async () => {
    store.setStep('generating');
    store.setIsGenerating(true);
    store.setGenerationError(null);

    const startedTime = store.startedAt || Date.now();

    try {
      await createBaselineRoadmap({
        domainId: store.domainId,
        domainSlug: store.domainSlug,
        selectedNodeIds: store.selectedNodeIds,
        levelsByArea: store.levelsByArea,
      });

      const durationSeconds = Math.round((Date.now() - startedTime) / 1000);

      // Track completion
      await trackEvent('onboarding_completed', {
        domain: store.domainSlug,
        duration_seconds: durationSeconds,
        selected_nodes_count: store.selectedNodeIds.length,
        levels: store.levelsByArea,
      });

      // Clear progress after success
      store.reset();

      // Navigate to app tabs
      router.replace('/(app)');
    } catch (err) {
      console.error('Roadmap generation error:', err);
      store.setIsGenerating(false);
      store.setGenerationError(
        (err as Error).message ||
          'Failed to generate roadmap. Please check your connection and retry.',
      );
    }
  };

  // Visual step progress
  const stepIndex: Record<OnboardingStep, number> = {
    goal: 1,
    picker: 2,
    levels: 3,
    generating: 4,
  };

  return (
    <Screen contentContainerStyle={styles.container}>
      {/* Top Header & Progress */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerRow}>
          <Text style={[styles.brandTitle, { color: theme.primary }]}>
            Atlas.AI • Onboarding
          </Text>
          <View style={styles.timerBadge}>
            <Text style={[styles.timerText, { color: theme.textSecondary }]}>
              Step {stepIndex[store.step]} of 4 • ⏱️ ~3-5 min
            </Text>
          </View>
        </View>

        {/* Progress Bar */}
        <View style={[styles.progressBarTrack, { backgroundColor: theme.surfaceSubtle }]}>
          <View
            style={[
              styles.progressBarFill,
              {
                backgroundColor: theme.primary,
                width: `${(stepIndex[store.step] / 4) * 100}%`,
              },
            ]}
          />
        </View>
      </View>

      {/* STEP 1: GOAL CARD */}
      {store.step === 'goal' && (
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <Card style={styles.stepCard}>
            <View style={styles.badgeRow}>
              <Badge label="Domain Goal" variant="primary" />
              <Badge label="AI-Assisted Engineering" variant="success" />
            </View>

            <Text style={[styles.stepTitle, { color: theme.text, ...typography.xxl }]}>
              {store.domainTitle}
            </Text>

            <Text style={[styles.stepSubtitle, { color: theme.textSecondary, marginBottom: spacing.lg }]}>
              Master modern software development with AI coding companions, agentic tools,
              context engineering, and automated testing pipelines.
            </Text>

            <View style={[styles.featuresBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.featuresHeader, { color: theme.text, ...typography.md }]}>
                What you'll get:
              </Text>
              <Text style={[styles.featureItem, { color: theme.textSecondary }]}>
                ⚡ <Text style={{ color: theme.text, fontWeight: '600' }}>Prerequisite-aware DAG:</Text> Only learn what makes sense next.
              </Text>
              <Text style={[styles.featureItem, { color: theme.textSecondary }]}>
                🛡️ <Text style={{ color: theme.text, fontWeight: '600' }}>AI Hype Shield:</Text> Filter noisy tool announcements from true paradigm shifts.
              </Text>
              <Text style={[styles.featureItem, { color: theme.textSecondary }]}>
                🔄 <Text style={{ color: theme.text, fontWeight: '600' }}>Injections & Overrides:</Text> Automatically inject breakthrough tools into your roadmap.
              </Text>
            </View>

            <Button
              testID="start-onboarding-button"
              title="Get Started (Start Onboarding)"
              onPress={handleStartOnboarding}
              style={{ marginTop: spacing.lg }}
            />
          </Card>
        </ScrollView>
      )}

      {/* STEP 2: STRUCTURED PICKER */}
      {store.step === 'picker' && (
        <View style={styles.pickerContainer}>
          <View style={styles.pickerHeaderSection}>
            <View style={styles.pickerTitleRow}>
              <View>
                <Text style={[styles.stepTitle, { color: theme.text, ...typography.xl }]}>
                  What tools & skills do you already use?
                </Text>
                <Text style={[styles.stepSubtitle, { color: theme.textSecondary }]}>
                  Select your current stack. We will mark them known so your roadmap targets what's next.
                </Text>
              </View>
              <Badge
                testID="selected-count-badge"
                label={`${store.selectedNodeIds.length} Selected`}
                variant={store.selectedNodeIds.length > 0 ? 'success' : 'outline'}
              />
            </View>

            {/* Search Input */}
            <Input
              testID="picker-search-input"
              placeholder="Search tools & concepts (e.g. VS Code, Git, Python, Unit Testing)..."
              value={store.searchQuery}
              onChangeText={store.setSearchQuery}
              containerStyle={{ marginVertical: spacing.sm }}
            />

            {/* Area Filter Chips */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.areaFiltersScroll}
            >
              <TouchableOpacity
                onPress={() => store.setSelectedAreaFilter(null)}
                style={[
                  styles.filterChip,
                  {
                    backgroundColor:
                      store.selectedAreaFilter === null
                        ? theme.primary
                        : theme.surfaceSubtle,
                    borderColor: theme.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    {
                      color:
                        store.selectedAreaFilter === null
                          ? '#ffffff'
                          : theme.text,
                    },
                  ]}
                >
                  All Areas
                </Text>
              </TouchableOpacity>
              {CANONICAL_AREAS.map((area) => (
                <TouchableOpacity
                  key={area.slug}
                  onPress={() =>
                    store.setSelectedAreaFilter(
                      store.selectedAreaFilter === area.slug ? null : area.slug,
                    )
                  }
                  style={[
                    styles.filterChip,
                    {
                      backgroundColor:
                        store.selectedAreaFilter === area.slug
                          ? theme.primary
                          : theme.surfaceSubtle,
                      borderColor: theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      {
                        color:
                          store.selectedAreaFilter === area.slug
                            ? '#ffffff'
                            : theme.text,
                      },
                    ]}
                  >
                    {area.icon} {area.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Node List Grouped by Area */}
          {loadingNodes ? (
            <View style={styles.centerSpinner}>
              <ActivityIndicator size="large" color={theme.primary} />
              <Text style={{ color: theme.textSecondary, marginTop: spacing.md }}>
                Loading canonical skills...
              </Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.nodeListScroll}>
              {CANONICAL_AREAS.map((area) => {
                const areaNodes = nodesByArea.get(area.slug) || [];
                if (areaNodes.length === 0) return null;
                const areaSelectedCount = areaNodes.filter((n) =>
                  store.selectedNodeIds.includes(n.id),
                ).length;

                return (
                  <View key={area.slug} style={styles.areaSection}>
                    <View style={styles.areaHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.areaTitle, { color: theme.text }]}>
                          {area.icon} {area.name}
                        </Text>
                        <Text style={[styles.areaSubtitle, { color: theme.textSecondary }]}>
                          {area.description} • {areaSelectedCount}/{areaNodes.length} selected
                        </Text>
                      </View>
                      <View style={styles.areaActionButtons}>
                        <TouchableOpacity
                          testID={`select-all-${area.slug}`}
                          onPress={() =>
                            store.selectAllInArea(
                              area.slug,
                              areaNodes.map((n) => n.id),
                            )
                          }
                          style={styles.textActionBtn}
                        >
                          <Text style={[styles.actionBtnText, { color: theme.primary }]}>
                            Select All
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          testID={`clear-${area.slug}`}
                          onPress={() =>
                            store.clearArea(areaNodes.map((n) => n.id))
                          }
                          style={styles.textActionBtn}
                        >
                          <Text style={[styles.actionBtnText, { color: theme.textMuted }]}>
                            Clear
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Nodes in this area */}
                    <View style={styles.nodesGrid}>
                      {areaNodes.map((node) => {
                        const isSelected = store.selectedNodeIds.includes(node.id);
                        return (
                          <TouchableOpacity
                            key={node.id}
                            testID={`node-card-${node.slug}`}
                            onPress={() => store.toggleNode(node.id)}
                            style={[
                              styles.nodeCard,
                              {
                                backgroundColor: isSelected
                                  ? theme.surfaceSubtle
                                  : theme.surface,
                                borderColor: isSelected
                                  ? theme.primary
                                  : theme.border,
                                borderWidth: isSelected ? 2 : 1,
                              },
                            ]}
                          >
                            <View style={styles.nodeCardHeader}>
                              <Text
                                style={[
                                  styles.nodeName,
                                  { color: theme.text, fontWeight: isSelected ? '700' : '500' },
                                ]}
                              >
                                {node.name}
                              </Text>
                              <View
                                style={[
                                  styles.checkCircle,
                                  {
                                    backgroundColor: isSelected
                                      ? theme.primary
                                      : 'transparent',
                                    borderColor: isSelected
                                      ? theme.primary
                                      : theme.border,
                                  },
                                ]}
                              >
                                {isSelected ? (
                                  <Text style={styles.checkMark}>✓</Text>
                                ) : null}
                              </View>
                            </View>

                            <Text
                              numberOfLines={2}
                              style={[styles.nodeDesc, { color: theme.textSecondary }]}
                            >
                              {node.description || 'Foundational concept'}
                            </Text>

                            <View style={styles.nodeMetaRow}>
                              <Badge
                                label={node.node_type}
                                variant={
                                  node.node_type === 'tool'
                                    ? 'warning'
                                    : node.node_type === 'workflow'
                                      ? 'success'
                                      : 'default'
                                }
                              />
                              <Text style={[styles.nodeLevelTag, { color: theme.textMuted }]}>
                                Level {node.level}
                              </Text>
                            </View>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Bottom Navigation Buttons */}
          <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
            <Button
              title="Back"
              variant="outline"
              onPress={() => store.setStep('goal')}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              testID="picker-next-button"
              title={
                store.selectedNodeIds.length === 0
                  ? 'Skip (Start from scratch)'
                  : `Next: Skill Levels (${store.selectedNodeIds.length})`
              }
              onPress={() => store.setStep('levels')}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      )}

      {/* STEP 3: LEVEL SELECTION PER AREA */}
      {store.step === 'levels' && (
        <View style={styles.levelsContainer}>
          <ScrollView contentContainerStyle={styles.levelsScroll}>
            <Card style={styles.levelsCard}>
              <Text style={[styles.stepTitle, { color: theme.text, ...typography.xl }]}>
                Self-Rate Your Experience by Area
              </Text>
              <Text style={[styles.stepSubtitle, { color: theme.textSecondary, marginBottom: spacing.lg }]}>
                This calibrates prerequisite satisfaction:{'\n'}
                • <Text style={{ fontWeight: '600', color: theme.text }}>Beginner:</Text> Starts from foundational nodes.{'\n'}
                • <Text style={{ fontWeight: '600', color: theme.text }}>Working:</Text> Direct prerequisites assumed known.{'\n'}
                • <Text style={{ fontWeight: '600', color: theme.text }}>Expert:</Text> All deep ancestral prerequisites marked known.
              </Text>

              {CANONICAL_AREAS.map((area) => {
                const currentLevel = store.levelsByArea[area.slug] || 'working';
                return (
                  <View
                    key={area.slug}
                    style={[styles.levelRowItem, { borderBottomColor: theme.border }]}
                  >
                    <View style={styles.areaInfoCol}>
                      <Text style={[styles.areaLevelName, { color: theme.text }]}>
                        {area.icon} {area.name}
                      </Text>
                      <Text style={[styles.areaLevelDesc, { color: theme.textSecondary }]}>
                        {area.description}
                      </Text>
                    </View>

                    {/* Segmented Selector */}
                    <View style={[styles.segmentedControl, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
                      {(['beginner', 'working', 'expert'] as const).map((lvl) => {
                        const isSelected = currentLevel === lvl;
                        return (
                          <TouchableOpacity
                            key={lvl}
                            testID={`level-${area.slug}-${lvl}`}
                            onPress={() => store.setLevel(area.slug, lvl)}
                            style={[
                              styles.segmentButton,
                              {
                                backgroundColor: isSelected
                                  ? theme.primary
                                  : 'transparent',
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.segmentText,
                                {
                                  color: isSelected ? '#ffffff' : theme.text,
                                  fontWeight: isSelected ? '700' : '500',
                                },
                              ]}
                            >
                              {lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
            </Card>
          </ScrollView>

          {/* Bottom Bar */}
          <View style={[styles.bottomBar, { borderTopColor: theme.border, backgroundColor: theme.surface }]}>
            <Button
              title="Back"
              variant="outline"
              onPress={() => store.setStep('picker')}
              style={{ flex: 1, marginRight: spacing.sm }}
            />
            <Button
              testID="generate-roadmap-button"
              title="Generate My Roadmap"
              onPress={handleGenerateRoadmap}
              style={{ flex: 2 }}
            />
          </View>
        </View>
      )}

      {/* STEP 4: GENERATING SCREEN */}
      {store.step === 'generating' && (
        <View style={styles.generatingContainer}>
          <Card style={styles.generatingCard}>
            <ActivityIndicator size="large" color={theme.primary} style={{ marginBottom: spacing.lg }} />
            <Text style={[styles.stepTitle, { color: theme.text, textAlign: 'center', ...typography.xl }]}>
              Synthesizing Your Baseline Roadmap...
            </Text>
            <Text
              style={[
                styles.stepSubtitle,
                { color: theme.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
              ]}
            >
              Computing topological layers, evaluating prerequisite dependencies, and optimizing your personalized 60-node path.
            </Text>

            <View style={[styles.generatingStepsBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
              <Text style={[styles.generatingStepLine, { color: theme.success }]}>
                ✓ Analyzing selected tools ({store.selectedNodeIds.length} items)
              </Text>
              <Text style={[styles.generatingStepLine, { color: theme.success }]}>
                ✓ Calibrating skill levels across 6 areas
              </Text>
              <Text style={[styles.generatingStepLine, { color: theme.primary }]}>
                ⏳ Pruning target-path & checking DAG acyclicity...
              </Text>
              <Text style={[styles.generatingStepLine, { color: theme.textMuted }]}>
                ○ Initializing user learning nodes
              </Text>
            </View>

            {store.generationError ? (
              <View style={[styles.errorBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.error }]}>
                <Text testID="generation-error-message" style={[styles.errorText, { color: theme.error }]}>
                  {store.generationError}
                </Text>
                <Button
                  testID="retry-generation-button"
                  title="Retry Generation"
                  onPress={handleGenerateRoadmap}
                  style={{ marginTop: spacing.md }}
                />
              </View>
            ) : null}
          </Card>
        </View>
      )}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  brandTitle: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '500',
  },
  progressBarTrack: {
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  scrollContent: {
    padding: 20,
    justifyContent: 'center',
    flexGrow: 1,
  },
  stepCard: {
    padding: 24,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  stepTitle: {
    fontWeight: '800',
    marginBottom: 8,
  },
  stepSubtitle: {
    lineHeight: 22,
  },
  featuresBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  featuresHeader: {
    fontWeight: '700',
    marginBottom: 4,
  },
  featureItem: {
    fontSize: 14,
    lineHeight: 20,
  },
  pickerContainer: {
    flex: 1,
  },
  pickerHeaderSection: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pickerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  areaFiltersScroll: {
    gap: 8,
    paddingVertical: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  centerSpinner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeListScroll: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  areaSection: {
    marginVertical: 12,
  },
  areaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  areaTitle: {
    fontSize: 16,
    fontWeight: '700',
  },
  areaSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  areaActionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  textActionBtn: {
    padding: 4,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  nodesGrid: {
    gap: 10,
  },
  nodeCard: {
    padding: 14,
    borderRadius: 10,
  },
  nodeCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  nodeName: {
    fontSize: 15,
    flex: 1,
    marginRight: 8,
  },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  nodeDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  nodeMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nodeLevelTag: {
    fontSize: 12,
  },
  bottomBar: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    alignItems: 'center',
  },
  levelsContainer: {
    flex: 1,
  },
  levelsScroll: {
    padding: 20,
    paddingBottom: 100,
  },
  levelsCard: {
    padding: 20,
  },
  levelRowItem: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  areaInfoCol: {
    flex: 1,
  },
  areaLevelName: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  areaLevelDesc: {
    fontSize: 13,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentText: {
    fontSize: 13,
  },
  generatingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  generatingCard: {
    width: '100%',
    maxWidth: 520,
    padding: 28,
    alignItems: 'center',
  },
  generatingStepsBox: {
    width: '100%',
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
  },
  generatingStepLine: {
    fontSize: 14,
    fontWeight: '500',
  },
  errorBox: {
    marginTop: 20,
    padding: 16,
    borderRadius: 10,
    borderWidth: 1,
    width: '100%',
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
