import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';

export default function SignInScreen() {
  const { theme, spacing, typography } = useTheme();
  const router = useRouter();
  const { signInWithPassword, signInWithGoogle, isLoading, error } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSignIn = async () => {
    setLocalError(null);
    if (!email || !password) {
      setLocalError('Please enter both email and password.');
      return;
    }

    const res = await signInWithPassword(email.trim(), password);
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
          Stop drowning in AI news. Keep a roadmap that updates itself.
        </Text>
      </View>

      <Card style={styles.card}>
        <Text style={[styles.cardTitle, { color: theme.text, ...typography.xl }]}>
          Welcome Back
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted, marginBottom: spacing.lg }]}>
          Sign in to your learning account
        </Text>

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
          placeholder="••••••••••••"
          secureTextEntry
          autoCapitalize="none"
          value={password}
          onChangeText={setPassword}
        />

        <Button
          testID="sign-in-button"
          title="Sign In"
          onPress={handleSignIn}
          loading={isLoading}
          style={{ marginTop: spacing.sm }}
        />

        <View style={styles.dividerRow}>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
          <Text style={[styles.dividerText, { color: theme.textMuted }]}>OR</Text>
          <View style={[styles.dividerLine, { backgroundColor: theme.border }]} />
        </View>

        <Button
          testID="google-signin-button"
          title="Continue with Google"
          variant="outline"
          onPress={handleGoogleSignIn}
        />

        <View style={styles.footerRow}>
          <Text style={[styles.footerText, { color: theme.textSecondary }]}>
            Don't have an account?{' '}
          </Text>
          <TouchableOpacity
            testID="go-to-signup-button"
            onPress={() => router.replace('/(auth)/sign-up')}
            accessibilityRole="link"
          >
            <Text style={[styles.footerLink, { color: theme.primary }]}>Sign Up</Text>
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
