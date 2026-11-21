import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { useTheme } from '../../src/design-system';

export default function AppTabsLayout() {
  const { theme } = useTheme();
  const router = useRouter();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: theme.surface,
        },
        headerTitleStyle: {
          color: theme.text,
          fontWeight: '700',
          fontSize: 18,
        },
        headerShadowVisible: false,
        headerRight: () => (
          <TouchableOpacity
            testID="header-profile-button"
            onPress={() => router.push('/profile')}
            accessibilityRole="button"
            accessibilityLabel="Open Profile & Settings"
            style={styles.headerButton}
          >
            <Text style={[styles.profileIcon, { color: theme.primary }]}>⚙️</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarLabel: 'News Feed',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>📰</Text>,
        }}
      />
      <Tabs.Screen
        name="roadmap"
        options={{
          title: 'Roadmap',
          tabBarLabel: 'My Roadmap',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 18, color }}>🗺️</Text>,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  headerButton: {
    marginRight: 16,
    padding: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 44,
    minHeight: 44,
  },
  profileIcon: {
    fontSize: 20,
  },
});
