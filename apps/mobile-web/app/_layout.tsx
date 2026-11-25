import React, { useState } from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '../src/design-system';
import { AuthProvider } from '../src/lib/AuthProvider';
import { ErrorBoundary } from '../src/components/ErrorBoundary';

export default function RootLayout() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 5,
            retry: 2,
          },
        },
      }),
  );

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <AuthProvider>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="(app)" options={{ headerShown: false }} />
                <Stack.Screen name="(editor)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding" options={{ headerShown: false }} />
                <Stack.Screen
                  name="profile"
                  options={{
                    headerShown: true,
                    title: 'Profile & Settings',
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="terms"
                  options={{
                    headerShown: true,
                    title: 'Terms of Service',
                    presentation: 'modal',
                  }}
                />
                <Stack.Screen
                  name="privacy"
                  options={{
                    headerShown: true,
                    title: 'Privacy Policy',
                    presentation: 'modal',
                  }}
                />
              </Stack>
            </AuthProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
