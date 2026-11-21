import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { Card, useTheme } from '../design-system';

export const NewsCardSkeleton: React.FC = () => {
  const { theme, radii, spacing } = useTheme();
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.8,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacityAnim]);

  return (
    <Card style={styles.card} testID="news-card-skeleton">
      {/* Header bar */}
      <View style={styles.headerRow}>
        <Animated.View
          style={[
            styles.metaBar,
            {
              backgroundColor: theme.surfaceSubtle,
              borderRadius: radii.sm,
              opacity: opacityAnim,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.badgePlaceholder,
            {
              backgroundColor: theme.surfaceSubtle,
              borderRadius: radii.full,
              opacity: opacityAnim,
            },
          ]}
        />
      </View>

      {/* Title */}
      <Animated.View
        style={[
          styles.titleBar,
          {
            backgroundColor: theme.surfaceSubtle,
            borderRadius: radii.sm,
            opacity: opacityAnim,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.titleBarShort,
          {
            backgroundColor: theme.surfaceSubtle,
            borderRadius: radii.sm,
            opacity: opacityAnim,
          },
        ]}
      />

      {/* Bullets */}
      <View style={[styles.bullets, { marginVertical: spacing.md }]}>
        {[1, 2, 3].map((key) => (
          <View key={key} style={styles.bulletRow}>
            <View
              style={[
                styles.bulletDot,
                {
                  backgroundColor: theme.surfaceSubtle,
                  borderRadius: radii.full,
                },
              ]}
            />
            <Animated.View
              style={[
                styles.bulletText,
                {
                  backgroundColor: theme.surfaceSubtle,
                  borderRadius: radii.sm,
                  opacity: opacityAnim,
                },
              ]}
            />
          </View>
        ))}
      </View>

      {/* Footer */}
      <View
        style={[
          styles.footer,
          { borderTopColor: theme.border, paddingTop: spacing.md },
        ]}
      >
        <Animated.View
          style={[
            styles.buttonPlaceholder,
            {
              backgroundColor: theme.surfaceSubtle,
              borderRadius: radii.sm,
              opacity: opacityAnim,
            },
          ]}
        />
        <Animated.View
          style={[
            styles.redButtonPlaceholder,
            {
              backgroundColor: 'rgba(220, 38, 38, 0.3)',
              borderRadius: radii.md,
              opacity: opacityAnim,
            },
          ]}
        />
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    marginBottom: 16,
    padding: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metaBar: {
    width: 140,
    height: 14,
  },
  badgePlaceholder: {
    width: 90,
    height: 22,
  },
  titleBar: {
    width: '90%',
    height: 20,
    marginBottom: 8,
  },
  titleBarShort: {
    width: '60%',
    height: 20,
    marginBottom: 12,
  },
  bullets: {
    gap: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletDot: {
    width: 8,
    height: 8,
  },
  bulletText: {
    flex: 1,
    height: 14,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
  },
  buttonPlaceholder: {
    width: 90,
    height: 20,
  },
  redButtonPlaceholder: {
    width: 120,
    height: 40,
  },
});
