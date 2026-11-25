import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Card } from '../design-system/Card';
import { Badge } from '../design-system/Badge';
import { useTheme } from '../design-system/ThemeContext';

export interface NewsCardItem {
  id: string;
  title: string;
  published_at?: string | null;
  bullets: [string, string, string];
  impact_score: number;
  impact_rationale?: string | null;
  tags: string[];
  url: string;
  source_name?: string | null;
  has_roadmap_match?: boolean;
  journey_id?: string;
  journey_title?: string;
  journey_icon?: string;
}

export interface NewsCardProps {
  item: NewsCardItem;
  onRedButtonPress: (item: NewsCardItem) => void;
  onOpenScaleLegend: () => void;
  style?: StyleProp<ViewStyle>;
}

export function formatTimeAgo(dateString?: string | null): string {
  if (!dateString) return 'Recent';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return 'Recent';

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

export function getImpactColor(score: number): {
  color: string;
  bgColor: string;
  label: string;
} {
  if (score >= 9) {
    return {
      color: '#DC2626',
      bgColor: 'rgba(220, 38, 38, 0.12)',
      label: 'Breakthrough',
    };
  }
  if (score >= 7) {
    return {
      color: '#D97706',
      bgColor: 'rgba(217, 119, 6, 0.12)',
      label: 'Major',
    };
  }
  if (score >= 5) {
    return {
      color: '#2563EB',
      bgColor: 'rgba(37, 99, 235, 0.12)',
      label: 'Notable',
    };
  }
  return {
    color: '#6B7280',
    bgColor: 'rgba(107, 114, 128, 0.12)',
    label: 'Minor',
  };
}

export const NewsCard: React.FC<NewsCardProps> = ({
  item,
  onRedButtonPress,
  onOpenScaleLegend,
  style,
}) => {
  const { theme, radii, spacing, typography } = useTheme();

  const handleOpenSource = async () => {
    if (!item.url) return;
    try {
      const supported = await Linking.canOpenURL(item.url);
      if (supported) {
        await Linking.openURL(item.url);
      } else if (typeof window !== 'undefined') {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      if (typeof window !== 'undefined') {
        window.open(item.url, '_blank', 'noopener,noreferrer');
      }
    }
  };

  const impactStyle = getImpactColor(item.impact_score);

  return (
    <Card
      style={[styles.card, style]}
      testID={`news-card-${item.id}`}
      accessibilityLabel={`News update: ${item.title}`}
    >
      {/* 1. Meta Header: Source, Time, Roadmap Match Hint, Skill Badge */}
      <View style={styles.headerRow}>
        <View style={styles.sourceTimeGroup}>
          {item.source_name ? (
            <Text
              style={[styles.sourceName, { color: theme.textSecondary }]}
              testID="news-source-name"
            >
              {item.source_name} •{' '}
            </Text>
          ) : null}
          <Text
            style={[styles.timeAgo, { color: theme.textSecondary }]}
            testID="news-time-ago"
          >
            {formatTimeAgo(item.published_at)}
          </Text>
        </View>

        <View style={styles.badgeGroup}>
          {item.journey_title ? (
            <View
              style={[
                styles.journeyBadge,
                {
                  backgroundColor: 'rgba(59, 130, 246, 0.1)',
                  borderColor: 'rgba(59, 130, 246, 0.3)',
                  borderRadius: radii.full,
                },
              ]}
              testID="news-journey-badge"
            >
              <Text style={styles.journeyBadgeText}>
                {item.journey_icon ? `${item.journey_icon} ` : ''}{item.journey_title}
              </Text>
            </View>
          ) : null}

          {item.has_roadmap_match ? (
            <View
              style={[
                styles.roadmapMatchBadge,
                {
                  backgroundColor: theme.verdictInjectionBg,
                  borderColor: theme.verdictInjectionBorder,
                  borderRadius: radii.full,
                },
              ]}
              testID="roadmap-match-hint"
              accessibilityLabel="Matches your roadmap"
            >
              <Text
                style={[
                  styles.roadmapMatchText,
                  { color: theme.verdictInjection },
                ]}
              >
                ✨ Matches your roadmap
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* 2. Title & Impact Badge */}
      <View style={styles.titleRow}>
        <Text
          style={[styles.title, { color: theme.text, ...typography.lg }]}
          testID="news-title"
        >
          {item.title}
        </Text>

        <TouchableOpacity
          style={[
            styles.impactBadge,
            {
              backgroundColor: impactStyle.bgColor,
              borderColor: impactStyle.color,
              borderRadius: radii.full,
            },
          ]}
          onPress={onOpenScaleLegend}
          testID="news-impact-badge"
          accessibilityRole="button"
          accessibilityLabel={`Impact score ${item.impact_score} out of 10. Tap to view rubric scale.`}
        >
          <Text
            style={[
              styles.impactScoreText,
              { color: impactStyle.color },
            ]}
          >
            Impact {item.impact_score}/10
          </Text>
          <Text style={[styles.infoIcon, { color: impactStyle.color }]}>
            ⓘ
          </Text>
        </TouchableOpacity>
      </View>

      {/* 3. Exactly Three Actionable Bullets */}
      <View style={styles.bulletsContainer} testID="news-bullets-list">
        {item.bullets.map((bullet, idx) => (
          <View key={idx} style={styles.bulletRow} testID={`news-bullet-${idx}`}>
            <Text style={[styles.bulletPoint, { color: theme.primary }]}>
              •
            </Text>
            <Text
              style={[
                styles.bulletText,
                { color: theme.text, ...typography.sm },
              ]}
            >
              {bullet}
            </Text>
          </View>
        ))}
      </View>

      {/* 4. Tags */}
      {item.tags && item.tags.length > 0 ? (
        <View style={styles.tagsRow} testID="news-tags-list">
          {item.tags.map((tag) => (
            <Badge
              key={tag}
              label={tag}
              variant="default"
              style={styles.tagBadge}
            />
          ))}
        </View>
      ) : null}

      {/* 5. Footer Actions: Source Link & Prominent Red Button */}
      <View
        style={[
          styles.footerActions,
          { borderTopColor: theme.border, paddingTop: spacing.md },
        ]}
      >
        <TouchableOpacity
          style={styles.sourceLinkButton}
          onPress={handleOpenSource}
          testID="news-source-link"
          accessibilityRole="link"
          accessibilityLabel="Read original source"
        >
          <Text
            style={[
              styles.sourceLinkText,
              { color: theme.textSecondary, ...typography.sm },
            ]}
          >
            Read Source ↗
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.redButton,
            {
              backgroundColor: '#DC2626',
              borderRadius: radii.md,
            },
          ]}
          onPress={() => onRedButtonPress(item)}
          testID="red-button"
          accessibilityRole="button"
          accessibilityLabel="Evaluate Impact with Red Button"
        >
          <Text style={styles.redButtonText}>🔴 Red Button</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sourceTimeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sourceName: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeAgo: {
    fontSize: 12,
  },
  badgeGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  journeyBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  journeyBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#3b82f6',
  },
  roadmapMatchBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  roadmapMatchText: {
    fontSize: 11,
    fontWeight: '700',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  title: {
    flex: 1,
    fontWeight: '800',
    lineHeight: 24,
  },
  impactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
  },
  impactScoreText: {
    fontSize: 12,
    fontWeight: '800',
  },
  infoIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  bulletsContainer: {
    marginBottom: 14,
    gap: 8,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  bulletPoint: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '800',
  },
  bulletText: {
    flex: 1,
    lineHeight: 20,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  sourceLinkButton: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  sourceLinkText: {
    fontWeight: '600',
  },
  redButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44, // 44px minimum touch target (PRD Section 14)
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 3,
  },
  redButtonText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.2,
  },
});
