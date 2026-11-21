import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Modal,
  Pressable,
} from 'react-native';

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
import { trackEvent } from '../../src/lib/events';

export default function FeedScreen() {
  const { theme, radii, spacing, typography } = useTheme();
  const { profile } = useAuth();

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
  const [redButtonModalItem, setRedButtonModalItem] = useState<NewsCardItem | null>(
    null,
  );

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

  const handleRedButtonPress = (item: NewsCardItem) => {
    void trackEvent('red_button_tapped', {
      news_item_id: item.id,
      title: item.title,
      impact_score: item.impact_score,
      has_roadmap_match: item.has_roadmap_match,
    });
    setRedButtonModalItem(item);
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
        data={feedItems}
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

      {/* 2. Red Button Analysis Placeholder Modal */}
      <Modal
        visible={Boolean(redButtonModalItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setRedButtonModalItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setRedButtonModalItem(null)}
        >
          <Pressable
            style={[
              styles.redButtonModalDialog,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderRadius: radii.lg,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
            testID="red-button-preview-modal"
          >
            <View style={styles.redButtonModalHeader}>
              <View
                style={[
                  styles.redButtonIconBadge,
                  { borderRadius: radii.full },
                ]}
              >
                <Text style={styles.redButtonIconText}>🔴</Text>
              </View>
              <Text
                style={[
                  styles.redButtonModalTitle,
                  { color: theme.text, ...typography.lg },
                ]}
              >
                Red Button Verdict Analysis
              </Text>
            </View>

            <Text
              style={[
                styles.redButtonTargetTitle,
                { color: theme.text, ...typography.md },
              ]}
              numberOfLines={2}
            >
              {redButtonModalItem?.title}
            </Text>

            <Text
              style={[
                styles.redButtonModalBody,
                { color: theme.textSecondary, marginBottom: spacing.md },
              ]}
            >
              The Red Button evaluates this advancement against your active
              roadmap slice and determines one of three verdicts:
            </Text>

            <View style={styles.verdictLegendBox}>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                🛡️ <Text style={{ fontWeight: '700' }}>Shield:</Text> No changes needed; your workflow remains stable.
              </Text>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                ➕ <Text style={{ fontWeight: '700' }}>Injection:</Text> Adds a high-impact breakthrough skill to your roadmap.
              </Text>
              <Text style={[styles.verdictLegendItem, { color: theme.text }]}>
                🔄 <Text style={{ fontWeight: '700' }}>Override:</Text> Replaces an obsolete tool with its approved successor.
              </Text>
            </View>

            <View style={styles.previewNotice}>
              <Text style={[styles.previewNoticeText, { color: theme.primary }]}>
                ℹ️ Full interactive verdict precomputation and preview application flow will be activated in Prompt 11!
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.closeRedButtonModal,
                {
                  backgroundColor: theme.primary,
                  borderRadius: radii.md,
                  marginTop: spacing.md,
                },
              ]}
              onPress={() => setRedButtonModalItem(null)}
              testID="close-red-button-modal"
            >
              <Text style={styles.closeRedButtonText}>Close Preview</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
