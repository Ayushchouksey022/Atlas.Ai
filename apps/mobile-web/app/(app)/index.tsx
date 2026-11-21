import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Card, VerdictBadge, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';

export default function FeedScreen() {
  const { theme, spacing, typography } = useTheme();
  const { profile } = useAuth();

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
          AI News Feed
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Real-time, domain-filtered updates for {profile?.display_name || 'you'}.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: theme.text, ...typography.lg }]}>
          Red Button Verdict System Preview
        </Text>
        <Text style={[styles.cardDescription, { color: theme.textSecondary, marginBottom: spacing.md }]}>
          Each news item is evaluated against your personalized roadmap, producing one of three accessible verdicts (always icon + label):
        </Text>

        <View style={styles.verdictList}>
          <View style={styles.verdictRow}>
            <VerdictBadge verdict="shield" />
            <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
              News is irrelevant to your current stack — no changes.
            </Text>
          </View>

          <View style={styles.verdictRow}>
            <VerdictBadge verdict="injection" />
            <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
              High-impact new tool/model inserted into your roadmap.
            </Text>
          </View>

          <View style={styles.verdictRow}>
            <VerdictBadge verdict="override" />
            <Text style={[styles.verdictExplanation, { color: theme.textSecondary }]}>
              Existing node made obsolete; archived & swapped to fast-track.
            </Text>
          </View>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontWeight: '800',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 15,
  },
  card: {
    marginBottom: 16,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  verdictList: {
    gap: 16,
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
});
