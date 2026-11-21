import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Button, Badge, useTheme } from '../src/design-system';
import { useAuth } from '../src/lib/AuthProvider';

export default function ProfileScreen() {
  const { theme, isDark, toggleTheme, spacing, typography } = useTheme();
  const { user, profile, signOut } = useAuth();
  const router = useRouter();

  const handleSignOut = async () => {
    await signOut();
    router.replace('/(auth)/sign-in');
  };

  return (
    <Screen scrollable contentContainerStyle={styles.container}>
      <Card style={styles.card}>
        <View style={styles.avatarRow}>
          <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
            <Text style={styles.avatarText}>
              {(profile?.display_name || user?.email || 'U')[0].toUpperCase()}
            </Text>
          </View>
          <View style={styles.userMeta}>
            <Text style={[styles.displayName, { color: theme.text, ...typography.lg }]}>
              {profile?.display_name || 'Anonymous User'}
            </Text>
            <Text style={[styles.email, { color: theme.textSecondary }]}>
              {user?.email || 'No email associated'}
            </Text>
          </View>
        </View>

        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>LEARNING PROFILE</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Launch Domain</Text>
            <Badge label="AI-Assisted Software Dev" variant="primary" />
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Onboarding Status</Text>
            <Badge
              label={profile?.onboarding_completed ? 'Completed' : 'Pending'}
              variant={profile?.onboarding_completed ? 'success' : 'warning'}
            />
          </View>
        </View>

        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>PREFERENCES</Text>
          <View style={styles.row}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>Appearance</Text>
            <Button
              testID="toggle-theme-button"
              title={isDark ? '🌙 Dark Mode' : '☀️ Light Mode'}
              variant="outline"
              size="sm"
              onPress={toggleTheme}
            />
          </View>
        </View>

        <View style={[styles.section, { borderTopColor: theme.border, borderTopWidth: 1 }]}>
          <Button
            testID="profile-signout-button"
            title="Sign Out"
            variant="danger"
            onPress={handleSignOut}
          />
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  card: {
    width: '100%',
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  userMeta: {
    flex: 1,
  },
  displayName: {
    fontWeight: '700',
  },
  email: {
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    paddingTop: 16,
    marginTop: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  rowLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
});
