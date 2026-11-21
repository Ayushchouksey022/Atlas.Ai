import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../design-system';

export interface OfflineBannerProps {
  isOnline: boolean;
}

export function OfflineBanner({ isOnline }: OfflineBannerProps) {
  const { theme, typography } = useTheme();

  if (isOnline) {
    return null;
  }

  return (
    <View
      testID="offline-banner"
      accessibilityRole="alert"
      accessibilityLabel="Offline: changes will not be saved"
      style={[
        styles.banner,
        {
          backgroundColor: theme.verdictOverride,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <Text style={styles.icon}>⚠️</Text>
      <Text style={[styles.text, typography.sm]}>
        Offline, changes will not be saved
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    paddingVertical: 8,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    zIndex: 9999,
  },
  icon: {
    fontSize: 14,
    marginRight: 8,
  },
  text: {
    color: '#000000',
    fontWeight: '700',
    textAlign: 'center',
  },
});
