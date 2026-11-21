import React from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle, type ViewProps } from 'react-native';
import { useTheme } from './ThemeContext';

export interface CardProps extends ViewProps {
  children: React.ReactNode;
  variant?: 'elevated' | 'outlined' | 'flat';
  style?: StyleProp<ViewStyle>;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'outlined',
  style,
  ...rest
}) => {
  const { theme, radii, spacing } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderRadius: radii.md,
          borderColor: theme.border,
          borderWidth: variant === 'outlined' ? 1 : 0,
          padding: spacing.md,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: variant === 'elevated' ? 2 : 0 },
          shadowOpacity: variant === 'elevated' ? 0.08 : 0,
          shadowRadius: variant === 'elevated' ? 6 : 0,
          elevation: variant === 'elevated' ? 2 : 0,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '100%',
  },
});
