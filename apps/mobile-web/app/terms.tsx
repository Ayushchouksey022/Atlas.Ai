import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, useTheme } from '../src/design-system';

export default function TermsOfServiceScreen() {
  const { theme, spacing, typography } = useTheme();
  const router = useRouter();

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
            Terms of Service
          </Text>
          <Text style={[styles.effectiveDate, { color: theme.textMuted }]}>
            Effective Date: November 2026
          </Text>
        </View>

        <ScrollView style={styles.content}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>1. Acceptance of Terms</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            By signing up, accessing, or using Atlas.AI (&quot;the Platform&quot;), you agree to be bound
            by these Terms of Service. If you do not agree to these Terms, you may not access or use the Platform.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>2. Beta Platform Usage</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Atlas.AI is currently in closed beta. Features, roadmaps, and verdict logic may be updated,
            refined, or modified as we improve the learning experience.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>3. Editorial Independence</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Sponsored placements are strictly labeled and structurally isolated. Sponsors have zero
            influence over verdict generation, impact scoring, or canonical graph placement.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>4. User Accounts & Data</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            You own your learning progress. You may export all your learning data at any time via in-app
            export, or delete your account permanently using the safe deletion flow.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>5. Limitation of Liability</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Atlas.AI provides guidance and curriculum recommendations &quot;as is&quot; without warranties of any kind.
          </Text>
        </ScrollView>

        <Button
          testID="terms-back-button"
          title="← Back"
          variant="outline"
          onPress={() => router.back()}
          style={{ marginTop: spacing.lg }}
        />
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
  card: {
    padding: 24,
  },
  header: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    paddingBottom: 16,
  },
  title: {
    fontWeight: '700',
  },
  effectiveDate: {
    fontSize: 13,
    marginTop: 4,
  },
  content: {
    marginVertical: 8,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 6,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 12,
  },
});
