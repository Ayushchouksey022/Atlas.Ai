import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useTheme } from './ThemeContext';

export type VerdictKind = 'shield' | 'injection' | 'override';

export interface VerdictBadgeProps {
  verdict: VerdictKind;
  size?: 'sm' | 'md' | 'lg';
  style?: ViewStyle;
}

/**
 * VerdictBadge implements the strict PRD Section 11 & Section 14 invariant:
 * - Shield = blue + shield icon + label
 * - Injection = green + plus-node icon + label
 * - Override = amber + swap icon + label
 * - Rule: "Always icon + label, never color alone"
 */
export const VerdictBadge: React.FC<VerdictBadgeProps> = ({
  verdict,
  size = 'md',
  style,
}) => {
  const { theme, radii, spacing } = useTheme();

  const config = {
    shield: {
      label: 'Shield',
      iconText: '🛡️',
      color: theme.verdictShield,
      bg: theme.verdictShieldBg,
      border: theme.verdictShieldBorder,
      ariaLabel: 'Verdict: Shield (irrelevant to roadmap)',
    },
    injection: {
      label: 'Injection',
      iconText: '➕',
      color: theme.verdictInjection,
      bg: theme.verdictInjectionBg,
      border: theme.verdictInjectionBorder,
      ariaLabel: 'Verdict: Injection (new recommended tool or skill)',
    },
    override: {
      label: 'Override',
      iconText: '🔄',
      color: theme.verdictOverride,
      bg: theme.verdictOverrideBg,
      border: theme.verdictOverrideBorder,
      ariaLabel: 'Verdict: Override (supersedes existing roadmap node)',
    },
  }[verdict];

  const sizeStyles = {
    sm: {
      paddingVertical: 3,
      paddingHorizontal: spacing.sm,
      fontSize: 12,
      iconSize: 12,
    },
    md: {
      paddingVertical: 5,
      paddingHorizontal: spacing.md,
      fontSize: 13,
      iconSize: 14,
    },
    lg: {
      paddingVertical: 8,
      paddingHorizontal: spacing.lg,
      fontSize: 15,
      iconSize: 16,
    },
  }[size];

  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={config.ariaLabel}
      style={[
        styles.badge,
        {
          backgroundColor: config.bg,
          borderColor: config.border,
          borderWidth: 1.5,
          borderRadius: radii.full,
          paddingVertical: sizeStyles.paddingVertical,
          paddingHorizontal: sizeStyles.paddingHorizontal,
        },
        style,
      ]}
    >
      <Text style={[styles.icon, { fontSize: sizeStyles.iconSize }]} aria-hidden={true}>
        {config.iconText}
      </Text>
      <Text
        style={[
          styles.label,
          {
            color: config.color,
            fontSize: sizeStyles.fontSize,
          },
        ]}
      >
        {config.label}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  icon: {
    marginRight: 6,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
