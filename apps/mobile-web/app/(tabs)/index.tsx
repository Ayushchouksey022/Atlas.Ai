import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { validateDummy } from '@repo/schemas';
import { getLLMProviderInfo } from '@repo/llm';

export default function FeedScreen() {
  const dummy = validateDummy({ id: 'feed-demo', name: 'Atlas Feed' });
  const llmInfo = getLLMProviderInfo('mock', 'fast');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello from Feed</Text>
      <Text style={styles.subtitle}>AI Upskilling Platform (Red Button)</Text>
      <View style={styles.card}>
        <Text style={styles.badge}>Package Wiring Check:</Text>
        <Text style={styles.text}>@repo/schemas DummySchema: {dummy.name}</Text>
        <Text style={styles.text}>
          @repo/llm Provider: {llmInfo.name} ({llmInfo.tier})
        </Text>
      </View>
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
    marginBottom: 24,
  },
  card: {
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    width: '100%',
    maxWidth: 400,
  },
  badge: {
    fontWeight: '600',
    color: '#2563EB',
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: '#334155',
    marginVertical: 2,
  },
});
