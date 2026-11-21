import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, useTheme } from '../src/design-system';
import { useAuth } from '../src/lib/AuthProvider';
import { supabase } from '../src/lib/supabase';

export default function OnboardingPlaceholderScreen() {
  const { theme, spacing, typography } = useTheme();
  const { user, profile, setProfile, signOut } = useAuth();
  const router = useRouter();

  const handleSimulateComplete = async () => {
    if (user) {
      // Update local state / database
      const updatedProfile = profile
        ? { ...profile, onboarding_completed: true }
        : null;

      if (updatedProfile) {
        setProfile(updatedProfile);
        // Also persist if mock session storage
        if (typeof window !== 'undefined') {
          const raw = window.sessionStorage?.getItem('__mock_auth__');
          if (raw) {
            try {
              const parsed = JSON.parse(raw);
              parsed.profile.onboarding_completed = true;
              window.sessionStorage?.setItem('__mock_auth__', JSON.stringify(parsed));
            } catch {
              // ignore
            }
          }
        }
        // Attempt supabase update if connected
        try {
          await supabase
            .from('profiles')
            .update({ onboarding_completed: true })
            .eq('id', user.id);
        } catch {
          // ignore if offline
        }
      }
    }
    router.replace('/(app)');
  };

  return (
    <Screen contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.badgeRow}>
          <Text style={[styles.badgeText, { color: theme.primary, backgroundColor: theme.surfaceSubtle }]}>
            Phase 1 • Foundations
          </Text>
        </View>

        <Text style={[styles.title, { color: theme.text, ...typography.xl }]}>
          Welcome to Onboarding
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary, marginBottom: spacing.lg }]}>
          Hello {profile?.display_name || user?.email || 'Developer'}! This is the onboarding placeholder screen.
          The complete multi-step domain picker and baseline roadmap synthesizer will be built in Prompt 5.
        </Text>

        <View style={[styles.infoBox, { backgroundColor: theme.surfaceSubtle, borderColor: theme.border }]}>
          <Text style={[styles.infoLabel, { color: theme.textSecondary }]}>Route Guard Status:</Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>
            ✅ Signed in as: {user?.email}
          </Text>
          <Text style={[styles.infoValue, { color: theme.text }]}>
            ⏳ Onboarding completed: {String(profile?.onboarding_completed ?? false)}
          </Text>
        </View>

        <Button
          testID="complete-onboarding-demo-button"
          title="Proceed to App (Simulate Completion)"
          onPress={handleSimulateComplete}
          style={{ marginBottom: spacing.md }}
        />

        <Button
          testID="onboarding-signout-button"
          title="Sign Out"
          variant="outline"
          onPress={async () => {
            await signOut();
            router.replace('/(auth)/sign-in');
          }}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  card: {
    maxWidth: 480,
    width: '100%',
  },
  badgeRow: {
    marginBottom: 12,
  },
  badgeText: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    lineHeight: 22,
  },
  infoBox: {
    padding: 14,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 24,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  infoValue: {
    fontSize: 14,
    marginTop: 2,
  },
});
