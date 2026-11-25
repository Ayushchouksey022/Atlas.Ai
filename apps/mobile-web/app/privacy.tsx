import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, useTheme } from '../src/design-system';

export default function PrivacyPolicyScreen() {
  const { theme, spacing, typography } = useTheme();
  const router = useRouter();

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
            Privacy Policy & Data Rights
          </Text>
          <Text style={[styles.effectiveDate, { color: theme.textMuted }]}>
            GDPR & India DPDP Compliant • Effective November 2026
          </Text>
        </View>

        <ScrollView style={styles.content}>
          <Text style={[styles.sectionHeading, { color: theme.text }]}>1. Overview & Data Minimization</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Atlas.AI takes privacy and data ownership seriously. We collect only what is strictly necessary
            to generate your personalized learning roadmap and calculate relevant verdicts.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>2. Information We Process</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            • Account credentials (email, hashed password managed via Supabase Auth).{'\n'}
            • Domain and skill self-assessments (experience levels across learning areas).{'\n'}
            • Node progression status (not started, in progress, completed, archived).{'\n'}
            • Verdict interactions and ratings (precomputed or requested analysis).{'\n'}
            • High-impact push notification preference (opt-in / opt-out).
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>3. Right to Access & Export (Portability)</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Under GDPR (Article 20) and India DPDP Act 2023, you have the right to receive a structured,
            commonly used, and machine-readable copy of your data. You can download your complete learning
            history as JSON at any time from your Profile screen.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>4. Right to Erasure (Safe Deletion)</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            Under GDPR (Article 17) and DPDP, you may delete your account and all associated personal data
            permanently. Our safe cascade deletion transaction removes all user-owned rows across profiles,
            roadmaps, events, and verdicts, and anonymizes analytics IDs.
          </Text>

          <Text style={[styles.sectionHeading, { color: theme.text }]}>5. Analytics Privacy</Text>
          <Text style={[styles.paragraph, { color: theme.textSecondary }]}>
            We never log full user profiles or sensitive credentials to analytics. User identifiers in analytics
            are pseudonymized and immediately unlinked upon account deletion.
          </Text>
        </ScrollView>

        <Button
          testID="privacy-back-button"
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
