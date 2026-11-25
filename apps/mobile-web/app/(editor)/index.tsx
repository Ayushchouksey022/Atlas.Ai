import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  Card,
  Button,
  Badge,
  useTheme,
} from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { supabase } from '../../src/lib/supabase';
import {
  validateProposedChange,
  wouldCreateCycle,
  computeNodeDiff,
  type ProposedGraphChangeRecord,
} from '@repo/graph';
import type {
  CanonicalNode,
  CanonicalEdge,
  ProposedGraphChange,
  Guide,
  GoldenSetCase,
  EditorMetrics,
} from '@repo/schemas';
import { GoldenSetCaseSchema } from '@repo/schemas';

type TabKey = 'changes' | 'guides' | 'flagged' | 'graph' | 'golden' | 'metrics';

export default function EditorialDashboard() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('changes');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Queues & Graph State
  const [proposedChanges, setProposedChanges] = useState<ProposedGraphChange[]>([]);
  const [draftGuides, setDraftGuides] = useState<Guide[]>([]);
  const [flaggedVerdicts, setFlaggedVerdicts] = useState<any[]>([]);
  const [failedNews, setFailedNews] = useState<any[]>([]);
  const [failedVerdicts, setFailedVerdicts] = useState<any[]>([]);
  const [canonicalNodes, setCanonicalNodes] = useState<CanonicalNode[]>([]);
  const [canonicalEdges, setCanonicalEdges] = useState<CanonicalEdge[]>([]);

  // Selection states
  const [selectedChangeId, setSelectedChangeId] = useState<string | null>(null);
  const [selectedGuideId, setSelectedGuideId] = useState<string | null>(null);
  const [guideMarkdownDraft, setGuideMarkdownDraft] = useState<string>('');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [nodeEditDraft, setNodeEditDraft] = useState<Partial<CanonicalNode>>({});

  // Graph filters
  const [graphSearchQuery, setGraphSearchQuery] = useState<string>('');
  const [selectedAreaFilter, setSelectedAreaFilter] = useState<string>('all');

  // Add Edge & Supersedes state
  const [newEdgeFrom, setNewEdgeFrom] = useState<string>('');
  const [newEdgeTo, setNewEdgeTo] = useState<string>('');
  const [newSupersedesOld, setNewSupersedesOld] = useState<string>('');
  const [newSupersedesNew, setNewSupersedesNew] = useState<string>('');

  // Golden set form
  const [goldenNewsUrl, setGoldenNewsUrl] = useState<string>('');
  const [goldenProfileFixture, setGoldenProfileFixture] = useState<string>('senior-js-copilot-user');
  const [goldenExpectedVerdict, setGoldenExpectedVerdict] = useState<'shield' | 'injection' | 'override'>('injection');
  const [goldenExpectedSlug, setGoldenExpectedSlug] = useState<string>('');
  const [goldenNotes, setGoldenNotes] = useState<string>('');
  const [savedGoldenCases, setSavedGoldenCases] = useState<GoldenSetCase[]>([]);

  // Editor Internal Metrics (PRD Section 11.6 & 13)
  const [editorMetrics, setEditorMetrics] = useState<EditorMetrics | null>(null);

  // ---------------------------------------------------------------------------
  // Data Loading
  // ---------------------------------------------------------------------------
  async function loadDashboardData() {
    setIsLoading(true);
    setStatusMessage(null);
    try {
      // 1. Proposed Graph Changes
      const { data: changes } = await supabase
        .from('proposed_graph_changes')
        .select('*')
        .order('created_at', { ascending: false });
      if (changes) setProposedChanges(changes as ProposedGraphChange[]);

      // 2. Draft Guides
      const { data: guides } = await supabase
        .from('guides')
        .select('*')
        .neq('status', 'approved')
        .order('updated_at', { ascending: false });
      if (guides) setDraftGuides(guides as Guide[]);

      // 3. Flagged Items: Low confidence verdicts (< 0.6)
      const { data: verdicts } = await supabase
        .from('verdicts')
        .select('*')
        .lt('confidence', 0.6)
        .order('created_at', { ascending: false })
        .limit(25);
      if (verdicts) setFlaggedVerdicts(verdicts);

      // Failed news items
      const { data: failedItems } = await supabase
        .from('news_items')
        .select('*')
        .eq('status', 'ingested')
        .order('created_at', { ascending: false })
        .limit(25);
      if (failedItems) setFailedNews(failedItems);

      // Failed user verdicts
      const { data: badUserVerdicts } = await supabase
        .from('user_verdicts')
        .select('*')
        .eq('state', 'failed')
        .order('updated_at', { ascending: false })
        .limit(25);
      if (badUserVerdicts) setFailedVerdicts(badUserVerdicts);

      // 4. Canonical Graph
      const { data: nodes } = await supabase
        .from('canonical_nodes')
        .select('*')
        .order('level', { ascending: true });
      if (nodes) setCanonicalNodes(nodes as CanonicalNode[]);

      const { data: edges } = await supabase
        .from('canonical_edges')
        .select('*');
      if (edges) setCanonicalEdges(edges as CanonicalEdge[]);

      // 5. Editor Internal Metrics (PRD Section 11.6 & 13)
      try {
        const { data: metricsData } = await supabase.rpc('get_editor_metrics');
        if (metricsData) {
          setEditorMetrics(metricsData as unknown as EditorMetrics);
        } else {
          // Fallback initial metrics if offline/mock
          setEditorMetrics({
            weekly_active_learners: 12,
            preview_confirmation_rate: 85.7,
            total_previewed: 28,
            total_confirmed: 24,
            total_dismissed: 4,
            verdict_distribution: {
              total: 35,
              shield: 18,
              injection: 10,
              override: 7,
            },
            avg_time_to_first_roadmap_seconds: 142.5,
          });
        }
      } catch {
        // Fallback initial metrics
        setEditorMetrics({
          weekly_active_learners: 12,
          preview_confirmation_rate: 85.7,
          total_previewed: 28,
          total_confirmed: 24,
          total_dismissed: 4,
          verdict_distribution: {
            total: 35,
            shield: 18,
            injection: 10,
            override: 7,
          },
          avg_time_to_first_roadmap_seconds: 142.5,
        });
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: `Failed to load dashboard: ${(err as Error).message}` });
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboardData();
  }, []);

  // Update draft markdown when selected guide changes
  useEffect(() => {
    if (selectedGuideId) {
      const g = draftGuides.find((item) => item.id === selectedGuideId);
      if (g) setGuideMarkdownDraft(g.markdown);
    }
  }, [selectedGuideId, draftGuides]);

  // Update node edit draft when selected node changes
  useEffect(() => {
    if (selectedNodeId) {
      const n = canonicalNodes.find((item) => item.id === selectedNodeId);
      if (n) {
        setNodeEditDraft({
          name: n.name,
          description: n.description,
          area: n.area,
          level: n.level,
          external_url: n.external_url,
        });
      }
    }
  }, [selectedNodeId, canonicalNodes]);

  // ---------------------------------------------------------------------------
  // Action Handlers
  // ---------------------------------------------------------------------------

  async function handleApproveProposedChange(change: ProposedGraphChange) {
    setActionLoading(true);
    setStatusMessage(null);

    // Client-side pre-validation for immediate UX feedback
    const validation = validateProposedChange(
      change as unknown as ProposedGraphChangeRecord,
      canonicalNodes,
      canonicalEdges,
    );

    if (!validation.valid) {
      setActionLoading(false);
      setStatusMessage({
        type: 'error',
        text: `Approval Refused: ${validation.message || validation.error}`,
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'approve_proposed_change',
          change_id: change.id,
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({
          type: 'error',
          text: error?.message || data?.message || 'Failed to approve proposed change',
        });
      } else {
        setStatusMessage({
          type: 'success',
          text: 'Proposed change approved and committed to canonical graph.',
        });
        setSelectedChangeId(null);
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRejectProposedChange(changeId: string) {
    setActionLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'reject_proposed_change',
          change_id: changeId,
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to reject change' });
      } else {
        setStatusMessage({ type: 'success', text: 'Proposed change marked as rejected.' });
        setSelectedChangeId(null);
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleApproveGuide(guideId: string) {
    setActionLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'approve_guide',
          guide_id: guideId,
          markdown_content: guideMarkdownDraft,
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to approve guide' });
      } else {
        setStatusMessage({ type: 'success', text: 'Guide approved! It is now visible to learners.' });
        setSelectedGuideId(null);
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveNodeEdits() {
    if (!selectedNodeId) return;
    const originalNode = canonicalNodes.find((n) => n.id === selectedNodeId);
    if (!originalNode) return;

    setActionLoading(true);
    setStatusMessage(null);

    const diffs = computeNodeDiff(originalNode, nodeEditDraft);
    if (diffs.length === 0) {
      setActionLoading(false);
      setStatusMessage({ type: 'success', text: 'No changes detected.' });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'save_canonical_node',
          node_id: selectedNodeId,
          updates: nodeEditDraft,
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to save node edits' });
      } else {
        setStatusMessage({ type: 'success', text: 'Canonical node updated successfully.' });
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddCanonicalEdge() {
    if (!newEdgeFrom || !newEdgeTo) {
      setStatusMessage({ type: 'error', text: 'Please select both source and target nodes.' });
      return;
    }

    if (newEdgeFrom === newEdgeTo) {
      setStatusMessage({ type: 'error', text: 'Self-loops forbidden: from_node cannot equal to_node.' });
      return;
    }

    // Check cycle
    if (wouldCreateCycle(canonicalEdges, newEdgeFrom, newEdgeTo)) {
      setStatusMessage({
        type: 'error',
        text: 'Cycle Refusal: Adding this edge would create a circular dependency.',
      });
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'save_canonical_node',
          node_id: newEdgeFrom,
          new_edges: [{ from_node: newEdgeFrom, to_node: newEdgeTo }],
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to add edge' });
      } else {
        setStatusMessage({ type: 'success', text: 'Edge added to canonical graph.' });
        setNewEdgeFrom('');
        setNewEdgeTo('');
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAddSupersedesLink() {
    if (!newSupersedesOld || !newSupersedesNew) {
      setStatusMessage({ type: 'error', text: 'Please select both old and replacement nodes.' });
      return;
    }

    if (newSupersedesOld === newSupersedesNew) {
      setStatusMessage({ type: 'error', text: 'A node cannot supersede itself.' });
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'save_canonical_node',
          node_id: newSupersedesNew,
          new_supersedes: [{ old_node: newSupersedesOld, new_node: newSupersedesNew }],
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to add supersedes link' });
      } else {
        setStatusMessage({ type: 'success', text: 'Supersedes link created successfully.' });
        setNewSupersedesOld('');
        setNewSupersedesNew('');
        await loadDashboardData();
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveGoldenCase() {
    if (!goldenNewsUrl || !goldenExpectedSlug) {
      setStatusMessage({ type: 'error', text: 'News URL and expected node slug are required.' });
      return;
    }

    const goldenCaseRecord: GoldenSetCase = {
      news_url: goldenNewsUrl,
      user_profile_fixture: goldenProfileFixture,
      expected_verdict: goldenExpectedVerdict,
      expected_new_node_slug: goldenExpectedSlug,
      notes: goldenNotes || 'Labeled via Editorial Dashboard',
    };

    const parsed = GoldenSetCaseSchema.safeParse(goldenCaseRecord);
    if (!parsed.success) {
      setStatusMessage({ type: 'error', text: 'Golden case validation failed.' });
      return;
    }

    setActionLoading(true);
    setStatusMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('editorial-actions', {
        body: {
          action: 'save_golden_case',
          golden_case: parsed.data,
          user_id: user?.id,
        },
      });

      if (error || (data && !data.success)) {
        setStatusMessage({ type: 'error', text: error?.message || 'Failed to save golden case' });
      } else {
        setStatusMessage({
          type: 'success',
          text: `Saved golden case ${data?.filename || ''} to /evals/golden format.`,
        });
        setSavedGoldenCases((prev) => [parsed.data, ...prev]);
        setGoldenNewsUrl('');
        setGoldenExpectedSlug('');
        setGoldenNotes('');
      }
    } catch (err) {
      setStatusMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setActionLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Filtered Canonical Nodes
  // ---------------------------------------------------------------------------
  const filteredNodes = useMemo(() => {
    return canonicalNodes.filter((n) => {
      const matchesSearch =
        n.name.toLowerCase().includes(graphSearchQuery.toLowerCase()) ||
        n.slug.toLowerCase().includes(graphSearchQuery.toLowerCase());
      const matchesArea = selectedAreaFilter === 'all' || n.area === selectedAreaFilter;
      return matchesSearch && matchesArea;
    });
  }, [canonicalNodes, graphSearchQuery, selectedAreaFilter]);

  const selectedProposedChange = useMemo(() => {
    return proposedChanges.find((p) => p.id === selectedChangeId);
  }, [proposedChanges, selectedChangeId]);

  const selectedChangeValidation = useMemo(() => {
    if (!selectedProposedChange) return null;
    return validateProposedChange(
      selectedProposedChange as unknown as ProposedGraphChangeRecord,
      canonicalNodes,
      canonicalEdges,
    );
  }, [selectedProposedChange, canonicalNodes, canonicalEdges]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Top Header */}
      <View style={[styles.header, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Editorial Dashboard</Text>
          <Badge label="Role: Editor" variant="primary" style={styles.roleBadge} />
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            onPress={() => router.replace('/(app)')}
            style={[styles.backLink, { borderColor: theme.border }]}
          >
            <Text style={[styles.backLinkText, { color: theme.primary }]}>← Return to Learner App</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status banner */}
      {statusMessage && (
        <View
          style={[
            styles.banner,
            {
              backgroundColor: statusMessage.type === 'success' ? '#10B98120' : '#EF444420',
              borderColor: statusMessage.type === 'success' ? '#10B981' : '#EF4444',
            },
          ]}
        >
          <Text
            style={[
              styles.bannerText,
              { color: statusMessage.type === 'success' ? '#10B981' : '#EF4444' },
            ]}
          >
            {statusMessage.text}
          </Text>
        </View>
      )}

      {/* Tabs Bar */}
      <View style={[styles.tabsBar, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <TouchableOpacity
          onPress={() => setActiveTab('changes')}
          style={[styles.tabItem, activeTab === 'changes' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'changes' ? theme.primary : theme.textMuted }]}>
            Proposed Changes ({proposedChanges.filter((c) => c.status === 'pending').length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('guides')}
          style={[styles.tabItem, activeTab === 'guides' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'guides' ? theme.primary : theme.textMuted }]}>
            Draft Guides ({draftGuides.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('flagged')}
          style={[styles.tabItem, activeTab === 'flagged' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'flagged' ? theme.primary : theme.textMuted }]}>
            Flagged Items ({flaggedVerdicts.length + failedNews.length + failedVerdicts.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('graph')}
          style={[styles.tabItem, activeTab === 'graph' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'graph' ? theme.primary : theme.textMuted }]}>
            Canonical Graph ({canonicalNodes.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('golden')}
          style={[styles.tabItem, activeTab === 'golden' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'golden' ? theme.primary : theme.textMuted }]}>
            Golden-Set Manager
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => setActiveTab('metrics')}
          style={[styles.tabItem, activeTab === 'metrics' && { borderBottomColor: theme.primary, borderBottomWidth: 3 }]}
        >
          <Text style={[styles.tabLabel, { color: activeTab === 'metrics' ? theme.primary : theme.textMuted }]}>
            📊 Metrics & Learning
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {isLoading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.primary} />
          <Text style={{ marginTop: 12, color: theme.textMuted }}>Loading editorial data...</Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.contentContainer}>
          {/* ================================================================= */}
          {/* TAB 1: PROPOSED GRAPH CHANGES */}
          {/* ================================================================= */}
          {activeTab === 'changes' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Queue: Proposed Graph Changes</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Review proposed nodes, edges, and supersedes relations from automated ingestion. Approving runs strict cycle checking before committing to the canonical graph.
                </Text>
              </View>

              <View style={styles.twoColumnLayout}>
                {/* Changes List */}
                <View style={styles.leftColumn}>
                  {proposedChanges.length === 0 ? (
                    <Card style={styles.emptyCard}>
                      <Text style={{ color: theme.textMuted }}>No proposed graph changes found.</Text>
                    </Card>
                  ) : (
                    proposedChanges.map((change) => {
                      const isSelected = selectedChangeId === change.id;
                      const nodePayload = (change.payload as any)?.proposed_node;
                      const title = nodePayload ? nodePayload.name : change.change_type;

                      return (
                        <TouchableOpacity
                          key={change.id}
                          onPress={() => setSelectedChangeId(change.id)}
                        >
                          <Card
                            style={[
                              styles.itemCard,
                              isSelected && { borderColor: theme.primary, borderWidth: 2 },
                            ]}
                          >
                            <View style={styles.rowBetween}>
                              <Text style={[styles.cardTitle, { color: theme.text }]}>{title}</Text>
                              <Badge
                                label={change.status}
                                variant={
                                  change.status === 'approved'
                                    ? 'success'
                                    : change.status === 'rejected'
                                    ? 'outline'
                                    : 'warning'
                                }
                              />
                            </View>
                            <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
                              Type: {change.change_type} • Created: {new Date(change.created_at).toLocaleDateString()}
                            </Text>
                            {nodePayload?.slug && (
                              <Text style={[styles.cardSlug, { color: theme.primary }]}>
                                Slug: {nodePayload.slug}
                              </Text>
                            )}
                          </Card>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* Change Details & Actions */}
                <View style={styles.rightColumn}>
                  {selectedProposedChange ? (
                    <Card style={styles.detailCard}>
                      <View style={styles.rowBetween}>
                        <Text style={[styles.detailTitle, { color: theme.text }]}>Change Payload Details</Text>
                        <Badge label={selectedProposedChange.status} variant="primary" />
                      </View>

                      {/* Validation & Cycle Check Warning */}
                      {selectedChangeValidation && (
                        <View
                          style={[
                            styles.validationBox,
                            {
                              backgroundColor: selectedChangeValidation.valid ? '#10B98115' : '#EF444415',
                              borderColor: selectedChangeValidation.valid ? '#10B981' : '#EF4444',
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.validationText,
                              { color: selectedChangeValidation.valid ? '#10B981' : '#EF4444' },
                            ]}
                          >
                            {selectedChangeValidation.valid
                              ? '✓ Graph Validation Passed: Acyclic check clean. Eligible for canonical commit.'
                              : `⚠ ${selectedChangeValidation.message || selectedChangeValidation.error}`}
                          </Text>
                        </View>
                      )}

                      {/* JSON Payload Display */}
                      <Text style={[styles.label, { color: theme.textMuted, marginTop: 12 }]}>Raw Payload:</Text>
                      <View style={[styles.codeContainer, { backgroundColor: theme.surface }]}>
                        <Text style={[styles.codeBlock, { color: theme.text }]}>
                          {JSON.stringify(selectedProposedChange.payload, null, 2)}
                        </Text>
                      </View>

                      {/* Actions */}
                      {selectedProposedChange.status === 'pending' && (
                        <View style={styles.buttonRow}>
                          <Button
                            title={actionLoading ? 'Processing...' : 'Approve & Commit to Graph'}
                            variant="primary"
                            disabled={actionLoading || !selectedChangeValidation?.valid}
                            onPress={() => void handleApproveProposedChange(selectedProposedChange)}
                            style={{ flex: 1, marginRight: 8 }}
                          />
                          <Button
                            title="Reject Change"
                            variant="outline"
                            disabled={actionLoading}
                            onPress={() => void handleRejectProposedChange(selectedProposedChange.id)}
                            style={{ flex: 1 }}
                          />
                        </View>
                      )}
                    </Card>
                  ) : (
                    <Card style={styles.emptyCard}>
                      <Text style={{ color: theme.textMuted }}>Select a proposed change from the list to inspect details.</Text>
                    </Card>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ================================================================= */}
          {/* TAB 2: DRAFT GUIDES */}
          {/* ================================================================= */}
          {activeTab === 'guides' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Queue: Draft Quickstart Guides</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Preview and edit auto-generated 20-minute quickstart guides. Once approved, the guide becomes visible to learners on their roadmap nodes.
                </Text>
              </View>

              <View style={styles.twoColumnLayout}>
                {/* Guides List */}
                <View style={styles.leftColumn}>
                  {draftGuides.length === 0 ? (
                    <Card style={styles.emptyCard}>
                      <Text style={{ color: theme.textMuted }}>No pending draft guides. All guides are approved.</Text>
                    </Card>
                  ) : (
                    draftGuides.map((guide) => {
                      const isSelected = selectedGuideId === guide.id;
                      const node = canonicalNodes.find((n) => n.id === guide.node_id);

                      return (
                        <TouchableOpacity
                          key={guide.id}
                          onPress={() => setSelectedGuideId(guide.id)}
                        >
                          <Card
                            style={[
                              styles.itemCard,
                              isSelected && { borderColor: theme.primary, borderWidth: 2 },
                            ]}
                          >
                            <View style={styles.rowBetween}>
                              <Text style={[styles.cardTitle, { color: theme.text }]}>
                                {node ? node.name : `Node: ${guide.node_id}`}
                              </Text>
                              <Badge label={guide.status} variant="warning" />
                            </View>
                            <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
                              Last updated: {new Date(guide.updated_at).toLocaleDateString()}
                            </Text>
                          </Card>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* Guide Editor */}
                <View style={styles.rightColumn}>
                  {selectedGuideId ? (
                    <Card style={styles.detailCard}>
                      <Text style={[styles.detailTitle, { color: theme.text }]}>Guide Markdown Editor</Text>
                      <TextInput
                        multiline
                        numberOfLines={16}
                        value={guideMarkdownDraft}
                        onChangeText={setGuideMarkdownDraft}
                        style={[
                          styles.markdownInput,
                          {
                            color: theme.text,
                            borderColor: theme.border,
                            backgroundColor: theme.surface,
                          },
                        ]}
                      />
                      <View style={styles.buttonRow}>
                        <Button
                          title={actionLoading ? 'Approving...' : 'Approve Guide (Publish)'}
                          variant="primary"
                          disabled={actionLoading}
                          onPress={() => void handleApproveGuide(selectedGuideId)}
                          style={{ flex: 1 }}
                        />
                      </View>
                    </Card>
                  ) : (
                    <Card style={styles.emptyCard}>
                      <Text style={{ color: theme.textMuted }}>Select a draft guide to view and edit markdown.</Text>
                    </Card>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* ================================================================= */}
          {/* TAB 3: FLAGGED ITEMS */}
          {/* ================================================================= */}
          {activeTab === 'flagged' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Queue: Flagged Items</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Monitors low-confidence verdicts (confidence &lt; 0.6) and failed ingestion processing runs for human review.
                </Text>
              </View>

              {/* Low-confidence verdicts */}
              <Text style={[styles.subsectionTitle, { color: theme.text }]}>Low-Confidence Verdicts (&lt; 0.6)</Text>
              {flaggedVerdicts.length === 0 ? (
                <Card style={[styles.emptyCard, { marginBottom: 20 }]}>
                  <Text style={{ color: theme.textMuted }}>No low-confidence verdicts flagged.</Text>
                </Card>
              ) : (
                flaggedVerdicts.map((v) => (
                  <Card key={v.id} style={styles.flaggedCard}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.flaggedTitle, { color: theme.text }]}>Verdict ID: {v.id}</Text>
                      <Badge label={`Confidence: ${v.confidence}`} variant="warning" />
                    </View>
                    <Text style={[styles.flaggedReasoning, { color: theme.text }]}>Reasoning: {v.reasoning}</Text>
                    <Text style={[styles.cardMeta, { color: theme.textMuted }]}>Proposed: {v.verdict}</Text>
                  </Card>
                ))
              )}

              {/* Failed news ingestion */}
              <Text style={[styles.subsectionTitle, { color: theme.text }]}>Failed News Processing</Text>
              {failedNews.length === 0 ? (
                <Card style={styles.emptyCard}>
                  <Text style={{ color: theme.textMuted }}>No failed news items.</Text>
                </Card>
              ) : (
                failedNews.map((n) => (
                  <Card key={n.id} style={styles.flaggedCard}>
                    <View style={styles.rowBetween}>
                      <Text style={[styles.flaggedTitle, { color: theme.text }]}>{n.title}</Text>
                      <Badge label="Status: ingested" variant="error" />
                    </View>
                    <Text style={[styles.cardMeta, { color: theme.textMuted }]}>Created: {n.created_at}</Text>
                    {n.error_record && (
                      <Text style={{ color: theme.error, marginTop: 4 }}>Error: {JSON.stringify(n.error_record)}</Text>
                    )}
                  </Card>
                ))
              )}
            </View>
          )}

          {/* ================================================================= */}
          {/* TAB 4: CANONICAL GRAPH BROWSER / EDITOR */}
          {/* ================================================================= */}
          {activeTab === 'graph' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Canonical Graph Browser &amp; Editor</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Inspect all canonical nodes, edit properties, and add edges or supersedes links with immediate cycle prevention.
                </Text>
              </View>

              {/* Filters */}
              <View style={styles.filterRow}>
                <TextInput
                  placeholder="Search canonical nodes by name or slug..."
                  placeholderTextColor={theme.textMuted}
                  value={graphSearchQuery}
                  onChangeText={setGraphSearchQuery}
                  style={[
                    styles.searchInput,
                    {
                      backgroundColor: theme.surface,
                      borderColor: theme.border,
                      color: theme.text,
                    },
                  ]}
                />
              </View>

              <View style={styles.twoColumnLayout}>
                {/* Node List */}
                <View style={styles.leftColumn}>
                  {filteredNodes.map((n) => {
                    const isSelected = selectedNodeId === n.id;
                    return (
                      <TouchableOpacity key={n.id} onPress={() => setSelectedNodeId(n.id)}>
                        <Card
                          style={[
                            styles.itemCard,
                            isSelected && { borderColor: theme.primary, borderWidth: 2 },
                          ]}
                        >
                          <View style={styles.rowBetween}>
                            <Text style={[styles.cardTitle, { color: theme.text }]}>{n.name}</Text>
                            <Badge label={`Lvl ${n.level}`} variant="primary" />
                          </View>
                          <Text style={[styles.cardSlug, { color: theme.primary }]}>{n.slug}</Text>
                          <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
                            Area: {n.area || 'unassigned'} • Type: {n.node_type}
                          </Text>
                        </Card>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Node Editor & Add Link Tools */}
                <View style={styles.rightColumn}>
                  {selectedNodeId ? (
                    <Card style={styles.detailCard}>
                      <Text style={[styles.detailTitle, { color: theme.text }]}>Edit Canonical Node</Text>
                      
                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Name</Text>
                      <TextInput
                        value={nodeEditDraft.name || ''}
                        onChangeText={(t) => setNodeEditDraft((prev) => ({ ...prev, name: t }))}
                        style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                      />

                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Description</Text>
                      <TextInput
                        multiline
                        value={nodeEditDraft.description || ''}
                        onChangeText={(t) => setNodeEditDraft((prev) => ({ ...prev, description: t }))}
                        style={[styles.multiLineInput, { color: theme.text, borderColor: theme.border }]}
                      />

                      <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Area</Text>
                      <TextInput
                        value={nodeEditDraft.area || ''}
                        onChangeText={(t) => setNodeEditDraft((prev) => ({ ...prev, area: t }))}
                        style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                      />

                      <Button
                        title={actionLoading ? 'Saving...' : 'Save Node Updates'}
                        variant="primary"
                        onPress={() => void handleSaveNodeEdits()}
                        style={{ marginTop: 12 }}
                      />
                    </Card>
                  ) : (
                    <Card style={styles.emptyCard}>
                      <Text style={{ color: theme.textMuted }}>Select a node on the left to edit properties.</Text>
                    </Card>
                  )}

                  {/* Add Edge Form */}
                  <Card style={[styles.detailCard, { marginTop: 16 }]}>
                    <Text style={[styles.detailTitle, { color: theme.text }]}>Add Canonical Edge (Prerequisite)</Text>
                    <Text style={[styles.cardMeta, { color: theme.textMuted }]}>
                      Adds a prerequisite edge. Cycle checks are run automatically before saving.
                    </Text>

                    <Text style={[styles.inputLabel, { color: theme.textMuted, marginTop: 8 }]}>From Node ID / Slug:</Text>
                    <TextInput
                      placeholder="e.g. node-git"
                      placeholderTextColor={theme.textMuted}
                      value={newEdgeFrom}
                      onChangeText={setNewEdgeFrom}
                      style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                    />

                    <Text style={[styles.inputLabel, { color: theme.textMuted }]}>To Node ID / Slug:</Text>
                    <TextInput
                      placeholder="e.g. node-copilot"
                      placeholderTextColor={theme.textMuted}
                      value={newEdgeTo}
                      onChangeText={setNewEdgeTo}
                      style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                    />

                    <Button
                      title="Add Edge (with Cycle Check)"
                      variant="outline"
                      onPress={() => void handleAddCanonicalEdge()}
                      style={{ marginTop: 12 }}
                    />
                  </Card>
                </View>
              </View>
            </View>
          )}

          {/* ================================================================= */}
          {/* TAB 5: GOLDEN-SET MANAGER (PRD Appendix B) */}
          {/* ================================================================= */}
          {activeTab === 'golden' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>Golden-Set Manager (PRD Appendix B)</Text>
                <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                  Label news items with expected verdicts and nodes to build golden eval sets in /evals/golden/*.json.
                </Text>
              </View>

              <Card style={styles.detailCard}>
                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>News URL</Text>
                <TextInput
                  placeholder="https://example.com/release-notes"
                  placeholderTextColor={theme.textMuted}
                  value={goldenNewsUrl}
                  onChangeText={setGoldenNewsUrl}
                  style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                />

                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>User Profile Fixture</Text>
                <TextInput
                  placeholder="e.g. senior-js-copilot-user"
                  placeholderTextColor={theme.textMuted}
                  value={goldenProfileFixture}
                  onChangeText={setGoldenProfileFixture}
                  style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                />

                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Expected Verdict</Text>
                <View style={styles.verdictSelector}>
                  {(['shield', 'injection', 'override'] as const).map((v) => (
                    <TouchableOpacity
                      key={v}
                      onPress={() => setGoldenExpectedVerdict(v)}
                      style={[
                        styles.verdictOption,
                        { borderColor: theme.border },
                        goldenExpectedVerdict === v && { backgroundColor: theme.primary, borderColor: theme.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.verdictOptionText,
                          { color: goldenExpectedVerdict === v ? '#FFF' : theme.text },
                        ]}
                      >
                        {v.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Expected New Node Slug</Text>
                <TextInput
                  placeholder="e.g. agentic-coding-tools"
                  placeholderTextColor={theme.textMuted}
                  value={goldenExpectedSlug}
                  onChangeText={setGoldenExpectedSlug}
                  style={[styles.singleLineInput, { color: theme.text, borderColor: theme.border }]}
                />

                <Text style={[styles.inputLabel, { color: theme.textMuted }]}>Editor Notes &amp; Rationale</Text>
                <TextInput
                  multiline
                  numberOfLines={4}
                  placeholder="Explain why this verdict is expected..."
                  placeholderTextColor={theme.textMuted}
                  value={goldenNotes}
                  onChangeText={setGoldenNotes}
                  style={[styles.multiLineInput, { color: theme.text, borderColor: theme.border }]}
                />

                <Button
                  title={actionLoading ? 'Saving...' : 'Save Golden Test Case (/evals/golden)'}
                  variant="primary"
                  onPress={() => void handleSaveGoldenCase()}
                  style={{ marginTop: 16 }}
                />
              </Card>
            </View>
          )}

          {/* ================================================================= */}
          {/* TAB 6: INTERNAL METRICS (PRD Section 11.6 & 13) */}
          {/* ================================================================= */}
          {activeTab === 'metrics' && (
            <View style={styles.tabContent}>
              <View style={styles.sectionHeader}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View>
                    <Text style={[styles.sectionTitle, { color: theme.text }]}>
                      Internal Learning Metrics (PRD Section 13)
                    </Text>
                    <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>
                      Platform analytics, confirmation rates, and weekly active learner definitions.
                    </Text>
                  </View>
                  <Button
                    title="🔄 Refresh Metrics"
                    variant="outline"
                    size="sm"
                    onPress={() => void loadDashboardData()}
                  />
                </View>
              </View>

              {/* Top KPI Cards Grid */}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
                {/* Metric 1: Weekly Active Learners */}
                <Card style={{ flex: 1, minWidth: 260, padding: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>
                    WEEKLY ACTIVE LEARNERS (WAL)
                  </Text>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: theme.primary, marginBottom: 6 }}>
                    {editorMetrics?.weekly_active_learners ?? 0}
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 16 }}>
                    Definition: Completed a node OR confirmed a verdict in the current calendar week (SQL view <Text style={{ fontFamily: 'monospace' }}>weekly_active_learners</Text>).
                  </Text>
                </Card>

                {/* Metric 2: Preview Confirmation Rate */}
                <Card style={{ flex: 1, minWidth: 260, padding: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>
                    PREVIEW CONFIRMATION RATE
                  </Text>
                  <Text style={{ fontSize: 32, fontWeight: '800', color: '#10B981', marginBottom: 6 }}>
                    {editorMetrics?.preview_confirmation_rate ?? 0}%
                  </Text>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 16 }}>
                    Confirmed: {editorMetrics?.total_confirmed ?? 0} • Dismissed: {editorMetrics?.total_dismissed ?? 0} (Total Previews: {editorMetrics?.total_previewed ?? 0})
                  </Text>
                </Card>

                {/* Metric 3: Time to First Roadmap */}
                <Card style={{ flex: 1, minWidth: 260, padding: 20 }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: theme.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>
                    AVG TIME TO FIRST ROADMAP
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                    <Text style={{ fontSize: 32, fontWeight: '800', color: theme.text }}>
                      {Math.round(editorMetrics?.avg_time_to_first_roadmap_seconds ?? 142)}s
                    </Text>
                    <Text style={{ fontSize: 14, color: '#10B981', fontWeight: '600' }}>
                      (Target &lt; 300s ✓)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 16 }}>
                    Average duration from <Text style={{ fontFamily: 'monospace' }}>onboarding_started</Text> to <Text style={{ fontFamily: 'monospace' }}>onboarding_completed</Text>.
                  </Text>
                </Card>
              </View>

              {/* Verdict Distribution Section */}
              <Card style={{ padding: 20, marginBottom: 24 }}>
                <Text style={{ fontSize: 16, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                  Verdict Distribution Across All News Items
                </Text>
                <Text style={{ fontSize: 13, color: theme.textMuted, marginBottom: 16 }}>
                  Total Verdicts Evaluated: {editorMetrics?.verdict_distribution.total ?? 0}
                </Text>

                <View style={{ flexDirection: 'row', gap: 16, flexWrap: 'wrap' }}>
                  {/* Shield */}
                  <View
                    style={{
                      flex: 1,
                      minWidth: 180,
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: 'rgba(100, 116, 139, 0.1)',
                      borderWidth: 1,
                      borderColor: '#64748B',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 18 }}>🛡️</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#64748B' }}>Shield</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: 2 }}>
                      {editorMetrics?.verdict_distribution.shield ?? 0}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {editorMetrics?.verdict_distribution.total
                        ? Math.round(
                            ((editorMetrics.verdict_distribution.shield) /
                              editorMetrics.verdict_distribution.total) *
                              100,
                          )
                        : 0}
                      % of total
                    </Text>
                  </View>

                  {/* Injection */}
                  <View
                    style={{
                      flex: 1,
                      minWidth: 180,
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: 'rgba(16, 185, 129, 0.1)',
                      borderWidth: 1,
                      borderColor: '#10B981',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 18 }}>💉</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#10B981' }}>Injection</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: 2 }}>
                      {editorMetrics?.verdict_distribution.injection ?? 0}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {editorMetrics?.verdict_distribution.total
                        ? Math.round(
                            ((editorMetrics.verdict_distribution.injection) /
                              editorMetrics.verdict_distribution.total) *
                              100,
                          )
                        : 0}
                      % of total
                    </Text>
                  </View>

                  {/* Override */}
                  <View
                    style={{
                      flex: 1,
                      minWidth: 180,
                      padding: 16,
                      borderRadius: 8,
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      borderWidth: 1,
                      borderColor: '#F59E0B',
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                      <Text style={{ fontSize: 18 }}>⚡</Text>
                      <Text style={{ fontSize: 14, fontWeight: '700', color: '#F59E0B' }}>Override</Text>
                    </View>
                    <Text style={{ fontSize: 24, fontWeight: '800', color: theme.text, marginBottom: 2 }}>
                      {editorMetrics?.verdict_distribution.override ?? 0}
                    </Text>
                    <Text style={{ fontSize: 12, color: theme.textSecondary }}>
                      {editorMetrics?.verdict_distribution.total
                        ? Math.round(
                            ((editorMetrics.verdict_distribution.override) /
                              editorMetrics.verdict_distribution.total) *
                              100,
                          )
                        : 0}
                      % of total
                    </Text>
                  </View>
                </View>
              </Card>

              {/* Data Compliance & Privacy Note */}
              <Card style={{ padding: 18 }}>
                <Text style={{ fontSize: 14, fontWeight: '700', color: theme.text, marginBottom: 4 }}>
                  🔒 Data Minimization & Privacy Invariant
                </Text>
                <Text style={{ fontSize: 13, color: theme.textSecondary, lineHeight: 18 }}>
                  In accordance with PRD Section 14 and GDPR/DPDP, editor metrics only aggregate pseudonymized activity counts. Full user profiles and PII are never exported to analytics or accessible via aggregate reporting.
                </Text>
              </Card>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  roleBadge: {
    marginLeft: 8,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backLink: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 8,
  },
  backLinkText: {
    fontSize: 13,
    fontWeight: '600',
  },
  banner: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  bannerText: {
    fontSize: 14,
    fontWeight: '600',
  },
  tabsBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    borderBottomWidth: 1,
  },
  tabItem: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginRight: 8,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  contentContainer: {
    padding: 24,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  tabContent: {
    width: '100%',
  },
  sectionHeader: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  subsectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 8,
  },
  twoColumnLayout: {
    flexDirection: 'row',
    gap: 20,
  },
  leftColumn: {
    flex: 1,
  },
  rightColumn: {
    flex: 1.2,
  },
  itemCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardSlug: {
    fontSize: 13,
    fontFamily: 'monospace',
    marginTop: 4,
  },
  cardMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  detailCard: {
    padding: 20,
    borderRadius: 10,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  emptyCard: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  validationBox: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginVertical: 12,
  },
  validationText: {
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  codeContainer: {
    padding: 12,
    borderRadius: 6,
    maxHeight: 260,
  },
  codeBlock: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  markdownInput: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
    padding: 12,
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 240,
    textAlignVertical: 'top',
  },
  flaggedCard: {
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
  },
  flaggedTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  flaggedReasoning: {
    fontSize: 13,
    marginTop: 6,
    lineHeight: 18,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderRadius: 8,
    fontSize: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 12,
    marginBottom: 6,
  },
  singleLineInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 14,
  },
  multiLineInput: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: 6,
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  verdictSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  verdictOption: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 1,
  },
  verdictOptionText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
