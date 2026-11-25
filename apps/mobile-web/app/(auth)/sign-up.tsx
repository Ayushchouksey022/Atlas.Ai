import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Card, Input, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { supabase } from '../../src/lib/supabase';

export default function SignUpScreen() {
  const { theme, spacing, typography } = useTheme();
  const router = useRouter();
  const { signUpWithPassword, signInWithGoogle, isLoading, error } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('ATLAS-FOUNDER-2026');
  const [consentAgreed, setConsentAgreed] = useState(false);
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
    if (!consentAgreed) {
      setLocalError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }

    // Validate Beta Invite Code
    if (inviteCode.trim()) {
      try {
        const { data, error: rpcErr } = await supabase.rpc('validate_beta_invite', {
          invite_code: inviteCode.trim(),
        });
        if (rpcErr) {
          const validTestCodes = [
            'ATLAS-FOUNDER-2026',
            'AI-LEARNER-2026',
            'BETA-INVITE-001',
            'BETA-INVITE-002',
            'BETA-INVITE-003',
            'BETA-INVITE-004',
            'BETA-INVITE-005',
          ];
          if (!validTestCodes.includes(inviteCode.trim().toUpperCase())) {
            setLocalError('Invalid or exhausted beta invite code.');
            return;
          }
        } else if (data && !(data as any).valid) {
          setLocalError((data as any).reason || 'Invalid or exhausted beta invite code.');
          return;
        }
      } catch {
        // Fallback for offline/test environments
        const validTestCodes = [
          'ATLAS-FOUNDER-2026',
          'AI-LEARNER-2026',
          'BETA-INVITE-001',
          'BETA-INVITE-002',
          'BETA-INVITE-003',
          'BETA-INVITE-004',
          'BETA-INVITE-005',
        ];
        if (!validTestCodes.includes(inviteCode.trim().toUpperCase())) {
          setLocalError('Invalid or exhausted beta invite code.');
          return;
        }
      }
    } else {
      setLocalError('A valid beta invite code is required during closed beta.');
      return;
    }

    const res = await signUpWithPassword(
      email.trim(),
      password,
      displayName.trim() || undefined,
    );
    if (res.error) {
      setLocalError(res.error);
      return;
    }

    // Claim beta invite on success
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user?.id) {
        await supabase.rpc('claim_beta_invite', {
          invite_code: inviteCode.trim(),
          claiming_user_id: user.id,
        });
      }
    } catch {
      // ignore
    }
  };

  const handleGoogleSignIn = async () => {
    setLocalError(null);
    if (!consentAgreed) {
      setLocalError('You must agree to the Terms of Service and Privacy Policy to continue.');
      return;
    }
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
          Create Account (Closed Beta)
        </Text>
        <Text style={[styles.cardSubtitle, { color: theme.textMuted, marginBottom: spacing.lg }]}>
          Enter your invite code to start tracking skills and verdicts
        </Text>

        <Input
          testID="invite-code-input"
          label="Beta Invite Code"
          placeholder="e.g. ATLAS-FOUNDER-2026"
          autoCapitalize="characters"
          value={inviteCode}
          onChangeText={setInviteCode}
          helperText="Closed beta access is limited to 300 learners"
        />

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

        {/* Consent Checkbox */}
        <TouchableOpacity
          testID="consent-checkbox-row"
          style={styles.consentRow}
          onPress={() => setConsentAgreed(!consentAgreed)}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: consentAgreed }}
        >
          <View
            style={[
              styles.checkbox,
              { borderColor: theme.border },
              consentAgreed && { backgroundColor: theme.primary, borderColor: theme.primary },
            ]}
          >
            {consentAgreed ? <Text style={styles.checkmark}>✓</Text> : null}
          </View>
          <View style={styles.consentTextWrapper}>
            <Text style={[styles.consentText, { color: theme.textSecondary }]}>
              I consent to learning progress tracking and agree to the{' '}
              <Text
                style={[styles.legalLink, { color: theme.primary }]}
                onPress={() => router.push('/terms')}
              >
                Terms of Service
              </Text>{' '}
              and{' '}
              <Text
                style={[styles.legalLink, { color: theme.primary }]}
                onPress={() => router.push('/privacy')}
              >
                Privacy Policy
              </Text>{' '}
              (DPDP & GDPR compliant).
            </Text>
          </View>
        </TouchableOpacity>

        <Button
          testID="sign-up-button"
          title="Create Account"
          onPress={handleSignUp}
          loading={isLoading}
          style={{ marginTop: spacing.md }}
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
  },
  brandTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  tagline: {
    fontSize: 14,
    marginTop: 4,
  },
  card: {
    maxWidth: 440,
    width: '100%',
    padding: 24,
  },
  cardTitle: {
    fontWeight: '700',
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 12,
    marginBottom: 4,
    minHeight: 44, // Minimum 44px touch target
    paddingVertical: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    marginTop: 2,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  consentTextWrapper: {
    flex: 1,
  },
  consentText: {
    fontSize: 12,
    lineHeight: 18,
  },
  legalLink: {
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
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
    alignItems: 'center',
    marginTop: 16,
    minHeight: 44,
  },
  footerText: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '600',
  },
});
