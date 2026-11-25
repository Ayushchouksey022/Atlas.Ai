import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';

interface ViewToken {
  item: unknown;
  key: string;
  index?: number | null;
  isViewable: boolean;
}
import { Screen, Card, Button, VerdictBadge, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { useNewsFeed, type FeedRowItem } from '../../src/lib/useNewsFeed';
import { NewsCard, type NewsCardItem } from '../../src/components/NewsCard';
import { SponsoredCard } from '../../src/components/SponsoredCard';
import { NewsCardSkeleton } from '../../src/components/NewsCardSkeleton';
import { ImpactScaleModal } from '../../src/components/ImpactScaleModal';
import {
  VerdictPreviewModal,
  type VerdictDetail,
} from '../../src/components/VerdictPreviewModal';
import { trackEvent } from '../../src/lib/events';
import { supabase } from '../../src/lib/supabase';
import { getFallbackVerdict } from '../../src/lib/fallbackNews';
import { saveMilestoneStatus } from '../../src/lib/skillJourneys';

export const SKILL_FILTERS = [
  { id: 'all', title: 'All Skills', icon: '🌟' },
  { id: 'video-editing-ai', title: 'Video Editing AI', icon: '🎬' },
  { id: 'graphic-design-ai', title: 'Graphic Design AI', icon: '🎨' },
  { id: 'ai-code-editors', title: 'AI Code Editors', icon: '💻' },
  { id: 'ai-content-writing', title: 'AI Content & Writing', icon: '✍️' },
];

export default function FeedScreen() {
  const { theme, radii, spacing, typography } = useTheme();
  const { user, profile } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    feedItems,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNewsFeed();

  const [scaleModalVisible, setScaleModalVisible] = useState(false);
  const [redButtonModalItem, setRedButtonModalItem] = useState<NewsCardItem | null>(null);
  const [verdictDetail, setVerdictDetail] = useState<VerdictDetail | null>(null);
  const [isLoadingVerdict, setIsLoadingVerdict] = useState(false);
  const [limitError, setLimitError] = useState<{
    error: string;
    message?: string;
    limit?: number;
    remaining_analyses?: number;
  } | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());
  const [selectedSkillFilter, setSelectedSkillFilter] = useState<string>('all');

  // Compute item counts for each skill category
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = { all: 0 };
    for (const row of feedItems) {
      if (row.type === 'news') {
        counts.all = (counts.all || 0) + 1;
        const jId =
          row.data.journey_id ||
          row.data.tags?.find((t) =>
            ['video-editing-ai', 'graphic-design-ai', 'ai-code-editors', 'ai-content-writing'].includes(t),
          );
        if (jId) {
          counts[jId] = (counts[jId] || 0) + 1;
        }
      }
    }
    return counts;
  }, [feedItems]);

  // Filter feed items according to selected skill category
  const displayedFeedItems = useMemo(() => {
    if (selectedSkillFilter === 'all') return feedItems;
    return feedItems.filter((row) => {
      if (row.type !== 'news') return true;
      const jId =
        row.data.journey_id ||
        row.data.tags?.find((t) =>
          ['video-editing-ai', 'graphic-design-ai', 'ai-code-editors', 'ai-content-writing'].includes(t),
        );
      return jId === selectedSkillFilter;
    });
  }, [feedItems, selectedSkillFilter]);

  const viewedItemIds = useRef(new Set<string>());

  const handleViewableItemsChanged = useCallback(
    (info: { viewableItems: ViewToken[]; changed?: ViewToken[] }) => {
      for (const token of info.viewableItems) {
        if (!token.isViewable) continue;
        const row = token.item as FeedRowItem;
        if (!row) continue;

        if (row.type === 'news') {
          const newsId = row.data.id;
          if (!viewedItemIds.current.has(newsId)) {
            viewedItemIds.current.add(newsId);
            void trackEvent('news_card_viewed', {
              news_item_id: newsId,
              title: row.data.title,
              impact_score: row.data.impact_score,
            });
          }
        } else if (row.type === 'sponsored') {
          const sponsorId = `sponsored-${row.data.id}`;
          if (!viewedItemIds.current.has(sponsorId)) {
            viewedItemIds.current.add(sponsorId);
            void trackEvent('sponsored_card_viewed', {
              placement_id: row.data.id,
              sponsor_name: row.data.sponsor_name,
            });
          }
        }
      }
    },
    [],
  );

  const handleRedButtonPress = async (item: NewsCardItem) => {
    // 5. Dismissed verdicts are remembered and not re-prompted for the same item
    if (dismissedItemIds.has(item.id)) {
      return;
    }

    const isPrecomputed = Boolean(item.has_roadmap_match);
    void trackEvent('red_button_tapped', {
      news_item_id: item.id,
      precomputed: isPrecomputed,
      title: item.title,
      impact_score: item.impact_score,
    });

    setRedButtonModalItem(item);
    setLimitError(null);
    setVerdictDetail(null);
    setIsLoadingVerdict(true);

    const userId = user?.id || '00000000-0000-0000-0000-000000000099';

    try {
      // 1. Try finding precomputed user_verdict
      const { data: userVerdict } = await supabase
        .from('user_verdicts')
        .select('*, verdict:verdicts(*)')
        .eq('user_id', userId)
        .eq('news_item_id', item.id)
        .maybeSingle();

      if (userVerdict?.verdict) {
        const v = userVerdict.verdict as any;
        const detail: VerdictDetail = {
          id: v.id,
          news_item_id: item.id,
          verdict: v.verdict,
          target_node_id: v.target_node_id,
          new_node_id: v.new_node_id,
          insert_after_node_ids: v.insert_after_node_ids,
          reasoning: v.reasoning || 'Evaluated deterministically against active roadmap.',
          confidence: v.confidence,
          target_node_name: v.target_node_name,
          new_node_name: v.new_node_name,
          insert_after_names: v.insert_after_names,
        };
        setVerdictDetail(detail);
        setIsLoadingVerdict(false);
        void trackEvent('verdict_previewed', {
          news_item_id: item.id,
          verdict_type: detail.verdict,
          verdict_id: detail.id,
        });
        return;
      }

      // 2. On-demand path: compute-verdict edge function
      const invokeRes = await supabase.functions.invoke('compute-verdict', {
        body: { news_item_id: item.id, user_id: userId },
      });

      if (invokeRes.error || invokeRes.data?.error) {
        const err = invokeRes.data || invokeRes.error;
        if (err?.error === 'DAILY_LIMIT_EXCEEDED' || invokeRes.error?.message?.includes('429')) {
          void trackEvent('daily_limit_hit', {
            news_item_id: item.id,
            limit: 10,
          });
          setLimitError({
            error: 'DAILY_LIMIT_EXCEEDED',
            message: 'You have used your 10 daily on-demand analyses. Precomputed verdicts remain instant and free.',
            limit: 10,
            remaining_analyses: 0,
          });
          setIsLoadingVerdict(false);
          return;
        }

        // Test/mock fallback when Edge Functions are not running locally
        const fallbackVerdict = getFallbackVerdict(item);
        setVerdictDetail(fallbackVerdict);
        setIsLoadingVerdict(false);
        void trackEvent('verdict_previewed', {
          news_item_id: item.id,
          verdict_type: fallbackVerdict.verdict,
          verdict_id: fallbackVerdict.id,
        });
        return;
      }

      const data = invokeRes.data;
      const detail: VerdictDetail = {
        id: data.verdict_id || data.id,
        news_item_id: item.id,
        verdict: data.verdict,
        target_node_id: data.target_node_id,
        new_node_id: data.new_node_id,
        insert_after_node_ids: data.insert_after_node_ids,
        reasoning: data.reasoning,
        confidence: data.confidence,
        target_node_name: data.target_node_name,
        new_node_name: data.new_node_name,
        insert_after_names: data.insert_after_names,
      };
      setVerdictDetail(detail);
      setIsLoadingVerdict(false);
      void trackEvent('verdict_previewed', {
        news_item_id: item.id,
        verdict_type: detail.verdict,
        verdict_id: detail.id,
      });
    } catch (e: any) {
      if (e?.message?.includes('DAILY_LIMIT_EXCEEDED') || e?.status === 429) {
        void trackEvent('daily_limit_hit', {
          news_item_id: item.id,
          limit: 10,
        });
        setLimitError({
          error: 'DAILY_LIMIT_EXCEEDED',
          message: 'Daily analysis limit reached (10/10). Resets tomorrow.',
          remaining_analyses: 0,
        });
        setIsLoadingVerdict(false);
        return;
      }

      const fallbackVerdict = getFallbackVerdict(item);
      setVerdictDetail(fallbackVerdict);
      setIsLoadingVerdict(false);
      void trackEvent('verdict_previewed', {
        news_item_id: item.id,
        verdict_type: fallbackVerdict.verdict,
        verdict_id: fallbackVerdict.id,
      });
    }
  };

  const handleConfirmApply = async (verdict: VerdictDetail) => {
    setIsApplying(true);
    void trackEvent('verdict_confirmed', {
      news_item_id: verdict.news_item_id,
      verdict_type: verdict.verdict,
      verdict_id: verdict.id,
    });

    const userId = user?.id || '00000000-0000-0000-0000-000000000099';

    try {
      let appliedNewNodeId = verdict.new_node_id;
      try {
        const invokeRes = await supabase.functions.invoke('apply-verdict', {
          body: { verdict_id: verdict.id, user_id: userId },
        });
        if (invokeRes.data?.new_node_id) {
          appliedNewNodeId = invokeRes.data.new_node_id;
        }
      } catch {
        // Fallback to direct transactional RPC if edge runtime is offline
        try {
          await supabase.rpc('apply_verdict_transaction', {
            p_user_id: userId,
            p_news_item_id: verdict.news_item_id,
            p_verdict_id: verdict.id,
            p_verdict_type: verdict.verdict,
            p_target_node_id: verdict.target_node_id || null,
            p_new_node_id: verdict.new_node_id || null,
            p_insert_after_ids: verdict.insert_after_node_ids || [],
          });
        } catch {
          // Offline / local preview mode fallback
        }
      }

      // Save into local milestone progress so it reflects immediately on the skill roadmap
      const targetMilestoneId = appliedNewNodeId || verdict.new_node_id || verdict.target_node_id;
      if (targetMilestoneId) {
        saveMilestoneStatus(userId, targetMilestoneId, 'available');
      }

      await queryClient.invalidateQueries({ queryKey: ['roadmap'] });
      await queryClient.invalidateQueries({ queryKey: ['user_nodes'] });
      await queryClient.invalidateQueries({ queryKey: ['user_verdict_matches'] });

      setIsApplying(false);
      setRedButtonModalItem(null);
      setVerdictDetail(null);

      const targetJourney =
        verdict.journey_id ||
        (selectedSkillFilter !== 'all' ? selectedSkillFilter : 'video-editing-ai');

      // 4. After applying: navigate to Roadmap tab, select the right journey & highlight changed node
      router.push({
        pathname: '/(app)/roadmap',
        params: {
          journey: targetJourney,
          highlight: targetMilestoneId || '',
        },
      });
    } catch (err) {
      setIsApplying(false);
      console.error('Failed to apply verdict:', err);
    }
  };

  const handleDismissVerdict = async (verdict: VerdictDetail) => {
    void trackEvent('verdict_dismissed', {
      news_item_id: verdict.news_item_id,
      verdict_type: verdict.verdict,
      verdict_id: verdict.id,
    });

    const userId = user?.id || '00000000-0000-0000-0000-000000000099';

    try {
      await supabase.from('user_verdicts').upsert(
        {
          user_id: userId,
          news_item_id: verdict.news_item_id,
          verdict_id: verdict.id,
          state: 'dismissed',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,news_item_id' },
      );
    } catch {
      // ignore
    }

    setDismissedItemIds((prev) => new Set(prev).add(verdict.news_item_id));
    await queryClient.invalidateQueries({ queryKey: ['user_verdict_matches'] });

    setRedButtonModalItem(null);
    setVerdictDetail(null);
  };

  const renderItem = ({ item }: { item: FeedRowItem }) => {
    if (item.type === 'news') {
      return (
        <NewsCard
          item={item.data}
          onRedButtonPress={handleRedButtonPress}
          onOpenScaleLegend={() => setScaleModalVisible(true)}
        />
      );
    }

    if (item.type === 'sponsored') {
      return <SponsoredCard {...item.data} />;
    }

    return null;
  };

  return (
    <Screen style={styles.screen}>
      <FlatList
        data={displayedFeedItems}
        renderItem={renderItem}
        keyExtractor={(item, index) =>
          item.type === 'news'
            ? `news-${item.data.id}`
            : `sponsored-${item.data.id}-${index}`
        }
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => void refetch()}
            tintColor={theme.primary}
          />
        }
        onEndReached={() => {
          if (hasNextPage && !isFetchingNextPage) {
            void fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.4}
        onViewableItemsChanged={handleViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
              AI News Feed
            </Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Curated, high-impact advancements for{' '}
              {profile?.display_name || 'your roadmap'}.
            </Text>

            {/* Skill Category Selector Bar */}
            <View style={styles.filterSection}>
              <View style={styles.filterHeaderRow}>
                <Text style={[styles.filterSectionTitle, { color: theme.textSecondary }]}>
                  MY SKILL ROADMAPS
                </Text>
                {selectedSkillFilter !== 'all' ? (
                  <TouchableOpacity
                    onPress={() =>
                      router.push({
                        pathname: '/(app)/roadmap',
                        params: { journey: selectedSkillFilter },
                      })
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={[styles.viewRoadmapLink, { color: theme.primary }]}>
                      Open {SKILL_FILTERS.find((f) => f.id === selectedSkillFilter)?.title} Roadmap →
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterPillsContainer}
              >
                {SKILL_FILTERS.map((filter) => {
                  const isSelected = selectedSkillFilter === filter.id;
                  const count = categoryCounts[filter.id] ?? 0;
                  return (
                    <TouchableOpacity
                      key={filter.id}
                      style={[
                        styles.filterPill,
                        {
                          backgroundColor: isSelected ? theme.primary : theme.surface,
                          borderColor: isSelected ? theme.primary : theme.border,
                        },
                      ]}
                      onPress={() => setSelectedSkillFilter(filter.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by ${filter.title}`}
                      testID={`filter-pill-${filter.id}`}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          { color: isSelected ? '#FFFFFF' : theme.text },
                        ]}
                      >
                        {filter.icon} {filter.title}
                        {count > 0 ? ` (${count})` : ''}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {selectedSkillFilter !== 'all' ? (
                <View
                  style={[
                    styles.activeSkillBanner,
                    {
                      backgroundColor: 'rgba(59, 130, 246, 0.08)',
                      borderColor: 'rgba(59, 130, 246, 0.25)',
                    },
                  ]}
                >
                  <Text style={[styles.activeSkillBannerText, { color: theme.text }]}>
                    Showing {categoryCounts[selectedSkillFilter] || 0} advancements for{' '}
                    <Text style={{ fontWeight: '700', color: theme.primary }}>
                      {SKILL_FILTERS.find((f) => f.id === selectedSkillFilter)?.title}
                    </Text>
                    . Tap <Text style={{ fontWeight: '700', color: '#DC2626' }}>🔴 Red Button</Text> to analyze & inject directly into your roadmap.
                  </Text>
                </View>
              ) : null}
            </View>

            <Card style={styles.previewCard}>
              <Text style={[styles.cardTitle, { color: theme.text, ...typography.md }]}>
                Red Button Verdict System Preview
              </Text>
              <Text
                style={[
                  styles.cardDescription,
                  { color: theme.textSecondary, marginBottom: spacing.md },
                ]}
              >
                Each news item is evaluated against your personalized roadmap, producing one of three accessible verdicts (always icon + label):
              </Text>

              <View style={styles.verdictList}>
                <View style={styles.verdictRow}>
                  <VerdictBadge verdict="shield" />
                  <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
                    No changes needed; your current stack already covers or renders this advancement irrelevant.
                  </Text>
                </View>

                <View style={styles.verdictRow}>
                  <VerdictBadge verdict="injection" />
                  <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
                    A net-new capability or best practice inserted into your roadmap as an actionable new node.
                  </Text>
                </View>

                <View style={styles.verdictRow}>
                  <VerdictBadge verdict="override" />
                  <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
                    Supersedes an existing node in your stack with a modern alternative (preserves completion).
                  </Text>
                </View>
              </View>
            </Card>
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <View testID="feed-loading-skeletons">
              <NewsCardSkeleton />
              <NewsCardSkeleton />
              <NewsCardSkeleton />
            </View>
          ) : isError ? (
            <Card style={styles.errorCard} testID="feed-error-state">
              <Text
                style={[
                  styles.errorTitle,
                  { color: theme.error, ...typography.md },
                ]}
              >
                Failed to load news feed
              </Text>
              <Text
                style={[
                  styles.errorDescription,
                  { color: theme.textSecondary, marginBottom: spacing.md },
                ]}
              >
                {error?.message || 'Unable to connect to the news feed service.'}
              </Text>
              <Button
                title="Retry"
                onPress={() => void refetch()}
                testID="retry-feed-button"
              />
            </Card>
          ) : (
            <Card style={styles.emptyCard} testID="feed-empty-state">
              <Text style={styles.emptyIcon}>📰</Text>
              <Text
                style={[
                  styles.emptyTitle,
                  { color: theme.text, ...typography.md },
                ]}
              >
                No updates published yet
              </Text>
              <Text
                style={[
                  styles.emptyDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Our ingestion pipeline pulls new advancements every 20 minutes.
                Check back shortly!
              </Text>
            </Card>
          )
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <View style={styles.footerLoader}>
              <NewsCardSkeleton />
            </View>
          ) : undefined
        }
      />

      {/* 1. Scale Legend Modal */}
      <ImpactScaleModal
        visible={scaleModalVisible}
        onClose={() => setScaleModalVisible(false)}
      />

      {/* 2. Red Button Analysis Preview Modal (PRD 11.4 / Prompt 12) */}
      <VerdictPreviewModal
        visible={Boolean(redButtonModalItem)}
        newsTitle={redButtonModalItem?.title || ''}
        verdict={verdictDetail}
        isLoading={isLoadingVerdict}
        limitError={limitError}
        isApplying={isApplying}
        onConfirmApply={handleConfirmApply}
        onDismissVerdict={handleDismissVerdict}
        onClose={() => {
          setRedButtonModalItem(null);
          setVerdictDetail(null);
          setLimitError(null);
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginTop: 12,
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  filterSection: {
    marginBottom: 20,
  },
  filterHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  viewRoadmapLink: {
    fontSize: 12,
    fontWeight: '700',
  },
  filterPillsContainer: {
    gap: 8,
    paddingBottom: 6,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterPillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  activeSkillBanner: {
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  activeSkillBannerText: {
    fontSize: 12,
    lineHeight: 18,
  },
  previewCard: {
    marginBottom: 16,
    padding: 16,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 13,
    lineHeight: 18,
  },
  verdictList: {
    gap: 12,
  },
  verdictRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  verdictExplanation: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  errorCard: {
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },
  errorTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  errorDescription: {
    textAlign: 'center',
  },
  emptyCard: {
    padding: 32,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
  },
  emptyTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyDescription: {
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 320,
  },
  footerLoader: {
    marginTop: 12,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  redButtonModalDialog: {
    width: '100%',
    maxWidth: 520,
    padding: 24,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  redButtonModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  redButtonIconBadge: {
    width: 36,
    height: 36,
    backgroundColor: 'rgba(220, 38, 38, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  redButtonIconText: {
    fontSize: 18,
  },
  redButtonModalTitle: {
    fontWeight: '800',
    flex: 1,
  },
  redButtonTargetTitle: {
    fontWeight: '700',
    marginBottom: 10,
  },
  redButtonModalBody: {
    fontSize: 13,
    lineHeight: 18,
  },
  verdictLegendBox: {
    padding: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.04)',
    borderRadius: 8,
    gap: 8,
    marginBottom: 12,
  },
  verdictLegendItem: {
    fontSize: 12,
    lineHeight: 17,
  },
  previewNotice: {
    padding: 10,
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    borderRadius: 8,
  },
  previewNoticeText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600',
  },
  closeRedButtonModal: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeRedButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
