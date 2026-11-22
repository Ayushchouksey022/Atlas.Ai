import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Slot, useRouter } from 'expo-router';
import { Card, Button, useTheme } from '../../src/design-system';
import { useAuth } from '../../src/lib/AuthProvider';
import { supabase } from '../../src/lib/supabase';

export default function EditorLayout() {
  const { user, isLoading: authLoading } = useAuth();
  const { theme } = useTheme();
  const router = useRouter();

  const [isEditor, setIsEditor] = useState<boolean | null>(null);
  const [checkingRole, setCheckingRole] = useState<boolean>(true);

  useEffect(() => {
    let isMounted = true;

    async function checkRole() {
      if (!user) {
        if (isMounted) {
          setIsEditor(false);
          setCheckingRole(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
          .in('role', ['editor', 'admin']);

        if (isMounted) {
          if (!error && data && data.length > 0) {
            setIsEditor(true);
          } else {
            setIsEditor(false);
          }
          setCheckingRole(false);
        }
      } catch {
        if (isMounted) {
          setIsEditor(false);
          setCheckingRole(false);
        }
      }
    }

    if (!authLoading) {
      void checkRole();
    }

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  if (authLoading || checkingRole) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={[styles.loadingText, { color: theme.textMuted }]}>
          Verifying editorial credentials...
        </Text>
      </View>
    );
  }

  if (!isEditor) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background, padding: 24 }]}>
        <Card style={styles.accessDeniedCard}>
          <Text style={[styles.title, { color: theme.error }]}>Access Denied</Text>
          <Text style={[styles.subtitle, { color: theme.text }]}>
            Role <Text style={{ fontWeight: 'bold' }}>editor</Text> required to view the Editorial Dashboard.
          </Text>
          <Text style={[styles.description, { color: theme.textMuted }]}>
            Access control is enforced at both the application route level and PostgreSQL Row Level Security (RLS). Normal users cannot view or mutate editorial queues.
          </Text>

          <View style={[styles.codeBox, { backgroundColor: theme.surface }]}>
            <Text style={[styles.codeText, { color: theme.text }]}>
              # Grant editor role from terminal:{'\n'}
              pnpm grant-editor {user?.email || '<your-email>'}
            </Text>
          </View>

          <Button
            title="Return to Learner App"
            variant="primary"
            onPress={() => router.replace('/(app)')}
            style={styles.returnButton}
          />
        </Card>
      </View>
    );
  }

  return <Slot />;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
  },
  accessDeniedCard: {
    maxWidth: 500,
    width: '100%',
    padding: 24,
    borderRadius: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  codeBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 13,
    lineHeight: 18,
  },
  returnButton: {
    width: '100%',
  },
});
