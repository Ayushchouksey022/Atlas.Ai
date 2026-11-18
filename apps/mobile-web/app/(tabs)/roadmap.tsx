import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function RoadmapScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello from Roadmap</Text>
      <Text style={styles.subtitle}>Interactive Learning DAG (Placeholder)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F8FAFC',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#0F172A',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
  },
});
