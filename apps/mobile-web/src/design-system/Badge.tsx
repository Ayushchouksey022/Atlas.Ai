import React from 'react';
import { View, Text, StyleSheet, type ViewStyle, type TextStyle } from 'react-native';
import { useTheme } from './ThemeContext';

export interface BadgeProps {
  label: string;
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'outline';
  style?: ViewStyle;
  textStyle?: TextStyle;
  icon?: React.ReactNode;
  testID?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  label,
  variant = 'default',
  style,
  textStyle,
  icon,
  testID,
}) => {
  const { theme, radii, spacing } = useTheme();

  const getColors = () => {
    switch (variant) {
      case 'primary':
        return { bg: theme.verdictShieldBg, text: theme.primary, border: theme.verdictShieldBorder };
      case 'success':
        return { bg: theme.successBg, text: theme.success, border: theme.verdictInjectionBorder };
      case 'warning':
        return { bg: theme.verdictOverrideBg, text: theme.verdictOverride, border: theme.verdictOverrideBorder };
      case 'error':
        return { bg: theme.errorBg, text: theme.error, border: theme.error };
      case 'outline':
        return { bg: 'transparent', text: theme.textSecondary, border: theme.border };
      case 'default':
      default:
        return { bg: theme.surfaceSubtle, text: theme.textSecondary, border: 'transparent' };
    }
  };

  const colors = getColors();

  return (
    <View
      testID={testID}
      style={[
        styles.badge,
        {
          backgroundColor: colors.bg,
          borderColor: colors.border,
          borderWidth: variant === 'outline' || variant === 'warning' || variant === 'primary' || variant === 'success' ? 1 : 0,
          borderRadius: radii.full,
          paddingVertical: spacing.xs,
          paddingHorizontal: spacing.sm + 2,
        },
        style,
      ]}
    >
      {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
      <Text style={[styles.text, { color: colors.text }, textStyle]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  iconContainer: {
    marginRight: 4,
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
