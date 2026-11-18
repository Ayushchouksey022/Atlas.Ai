import { Tabs } from 'expo-router';
import React from 'react';
import { Text } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#64748B',
        headerShown: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarLabel: 'Feed',
          tabBarIcon: ({ color }) => <Text style={{ color }}>📰</Text>,
        }}
      />
      <Tabs.Screen
        name="roadmap"
        options={{
          title: 'Roadmap',
          tabBarLabel: 'Roadmap',
          tabBarIcon: ({ color }) => <Text style={{ color }}>🗺️</Text>,
        }}
      />
    </Tabs>
  );
}
