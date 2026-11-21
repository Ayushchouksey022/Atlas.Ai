import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../design-system';

export interface ConflictNoticeProps {
  message: string | null;
  onDismiss: () => void;
}

export function ConflictNotice({ message, onDismiss }: ConflictNoticeProps) {
  const { theme, typography } = useTheme();

  if (!message) {
    return null;
  }

  return (
    <View
      testID="conflict-notice"
      accessibilityRole="alert"
      style={[
        styles.container,
        {
          backgroundColor: theme.surfaceSubtle,
          borderColor: theme.verdictOverride,
        },
      ]}
    >
      <View style={styles.contentRow}>
        <Text style={styles.icon}>🔄</Text>
        <Text style={[styles.text, { color: theme.text, ...typography.sm }]}>
          {message}
        </Text>
      </View>
      <TouchableOpacity
        testID="dismiss-conflict-notice"
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss notice"
        style={styles.dismissButton}
      >
        <Text style={[styles.dismissText, { color: theme.primary }]}>Dismiss</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 900,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  icon: {
    fontSize: 16,
    marginRight: 8,
  },
  text: {
    flex: 1,
  },
  dismissButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  dismissText: {
    fontWeight: '600',
    fontSize: 12,
  },
});
