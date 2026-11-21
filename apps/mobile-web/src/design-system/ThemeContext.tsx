import React, { createContext, useContext, useState, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { lightTheme, darkTheme, type ColorPalette, spacing, typography, radii, MIN_TOUCH_TARGET } from './theme';

interface ThemeContextValue {
  theme: ColorPalette;
  isDark: boolean;
  toggleTheme: () => void;
  spacing: typeof spacing;
  typography: typeof typography;
  radii: typeof radii;
  minTouchTarget: number;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemColorScheme = useColorScheme();
  const [overrideTheme, setOverrideTheme] = useState<'light' | 'dark' | null>(null);

  const isDark = (overrideTheme ?? systemColorScheme) === 'dark';
  const theme = isDark ? darkTheme : lightTheme;

  const value = useMemo(
    () => ({
      theme,
      isDark,
      toggleTheme: () => setOverrideTheme((prev) => (prev === 'dark' ? 'light' : 'dark')),
      spacing,
      typography,
      radii,
      minTouchTarget: MIN_TOUCH_TARGET,
    }),
    [theme, isDark],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: lightTheme,
      isDark: false,
      toggleTheme: () => {},
      spacing,
      typography,
      radii,
      minTouchTarget: MIN_TOUCH_TARGET,
    };
  }
  return ctx;
}
