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
import { useTheme } from '../design-system/ThemeContext';
import { trackEvent } from '../lib/events';

/**
 * Structural Separation Invariant (PRD Section 13 & 14):
 * SponsoredCard strictly accepts only isolated sponsorship fields.
 * It NEVER receives news items, verdicts, nodes, or user roadmap data.
 */
export interface SponsoredCardProps {
  id: string;
  title: string;
  body: string;
  cta_url: string;
  sponsor_name: string;
  onPressCta?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const SponsoredCard: React.FC<SponsoredCardProps> = ({
  id,
  title,
  body,
  cta_url,
  sponsor_name,
  onPressCta,
  style,
}) => {
  const { theme, radii, spacing, typography } = useTheme();

  const handlePressCta = async () => {
    void trackEvent('sponsored_card_clicked', {
      placement_id: id,
      sponsor_name,
      cta_url,
    });

    if (onPressCta) {
      onPressCta();
    }

    if (cta_url) {
      try {
        const supported = await Linking.canOpenURL(cta_url);
        if (supported) {
          await Linking.openURL(cta_url);
        } else if (typeof window !== 'undefined') {
          window.open(cta_url, '_blank', 'noopener,noreferrer');
        }
      } catch {
        if (typeof window !== 'undefined') {
          window.open(cta_url, '_blank', 'noopener,noreferrer');
        }
      }
    }
  };

  return (
    <Card
      style={[
        styles.card,
        {
          borderColor: theme.border,
          backgroundColor: theme.surfaceSubtle,
        },
        style,
      ]}
      testID={`sponsored-card-${id}`}
      accessibilityLabel={`Sponsored placement: ${title} by ${sponsor_name}`}
    >
      {/* 1. Header with clear SPONSORED labeling */}
      <View style={styles.headerRow}>
        <View
          style={[
            styles.sponsoredBadge,
            {
              backgroundColor: 'rgba(217, 119, 6, 0.15)',
              borderColor: '#D97706',
              borderRadius: radii.sm,
            },
          ]}
          testID="sponsored-label-badge"
        >
          <Text style={styles.sponsoredLabelText}>SPONSORED</Text>
        </View>

        <Text
          style={[styles.sponsorName, { color: theme.textSecondary }]}
          testID="sponsor-name"
        >
          Promoted by {sponsor_name}
        </Text>
      </View>

      {/* 2. Title & Body */}
      <Text
        style={[styles.title, { color: theme.text, ...typography.md }]}
        testID="sponsored-title"
      >
        {title}
      </Text>

      <Text
        style={[
          styles.body,
          { color: theme.textSecondary, marginBottom: spacing.md },
        ]}
        testID="sponsored-body"
      >
        {body}
      </Text>

      {/* 3. CTA Action */}
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[
            styles.ctaButton,
            {
              backgroundColor: theme.primary,
              borderRadius: radii.md,
            },
          ]}
          onPress={handlePressCta}
          testID="sponsored-cta-button"
          accessibilityRole="button"
          accessibilityLabel={`Learn more about ${title}`}
        >
          <Text style={styles.ctaButtonText}>Learn More ↗</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sponsoredBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderWidth: 1,
  },
  sponsoredLabelText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.8,
  },
  sponsorName: {
    fontSize: 12,
    fontWeight: '600',
  },
  title: {
    fontWeight: '800',
    marginBottom: 6,
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
  },
  actionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  ctaButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    minHeight: 44, // 44px touch target
    justifyContent: 'center',
    alignItems: 'center',
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13,
  },
});
