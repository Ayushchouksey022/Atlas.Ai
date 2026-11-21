import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Screen, Card, Badge, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';

export default function RoadmapScreen() {
  const { theme, spacing, typography } = useTheme();
  const { profile } = useAuth();

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
          Interactive Learning DAG
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Roadmap for domain: ai-assisted-software-development
        </Text>
      </View>

      <Card style={styles.card}>
        <View style={styles.badgeRow}>
          <Badge label="Active Roadmap" variant="primary" />
          <Badge label="Prompt 6: Skia Interactive DAG" variant="outline" />
        </View>

        <Text style={[styles.cardTitle, { color: theme.text, ...typography.lg }]}>
          Learner: {profile?.display_name || 'Active User'}
        </Text>
        <Text style={[styles.cardDescription, { color: theme.textSecondary, marginBottom: spacing.md }]}>
          Your skill graph updates automatically when new AI developments emerge. Interactive pan, zoom, drag, and status controls will be rendered in Milestone 2 (Prompt 6).
        </Text>
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
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 8,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
});
