import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';

export default function SignUpScreen() {
  const { theme, spacing, typography } = useTheme();
  const router = useRouter();
  const { signUpWithPassword, signInWithGoogle, isLoading, error } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignUp = async () => {
    setLocalError(null);
    if (!email || !password) {
      setLocalError('Please fill in both email and password.');
      return;
    }
    if (password.length < 6) {
      setLocalError('Password must be at least 6 characters.');
      return;
    }

    const res = await signUpWithPassword(
      email.trim(),
      password,
      displayName.trim() || undefined,
    );
    if (res.error) {
      setLocalError(res.error);
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    const res = await signInWithGoogle();
    if (res.error) {
      setLocalError(res.error);
    }
  };

  return (
    <Screen scrollable error={localError || error} contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.brandTitle, { color: theme.primary }]}>Atlas.AI</Text>
        <Text style={[styles.tagline, { color: theme.textSecondary }]}>
          Create your personalized AI learning roadmap
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: theme.text, ...typography.xl }]}>
          Create Account
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted, marginBottom: spacing.lg }]}>
          Start tracking skills, tools, and real-time updates
        </Text>

        <Input
          testID="display-name-input"
          label="Your Name / Handle"
          placeholder="Ada Lovelace"
          autoCapitalize="words"
          value={displayName}
          onChangeText={setDisplayName}
        />

        <Input
          testID="email-input"
          label="Email Address"
          placeholder="developer@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          value={email}
          onChangeText={setEmail}
        />

        <Input
          testID="password-input"
          label="Password"
          placeholder="Minimum 6 characters"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
          helperText="Must contain at least 6 characters"
        />

        <Button
          testID="sign-up-button"
          title="Create Account"
          onPress={handleSignUp}
          loading={isLoading}
          style={{ marginTop: spacing.sm }}
        />

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textMuted }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <Button
          testID="google-signup-button"
          title="Continue with Google"
          variant="outline"
          onPress={handleGoogleSignIn}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Already have an account?{' '}
          </Text>
          <TouchableOpacity
            testID="go-to-signin-button"
            onPress={() => router.replace('/(auth)/sign-in')}
            accessibilityRole="link"
          >
            <Text style={[styles.footerLink, { color: theme.primary }]}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100%',
    paddingVertical: 32,
  },
  header: {
    alignItems: 'center',
    marginBottom: 24,
    maxWidth: 420,
    width: '100%',
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  card: {
    maxWidth: 420,
    width: '100%',
  },
  cardTitle: {
    fontWeight: '700',
  },
  cardSubtitle: {
    fontSize: 14,
    marginTop: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    fontWeight: '600',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
