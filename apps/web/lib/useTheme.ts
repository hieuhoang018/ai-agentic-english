'use client'

import { useCallback, useSyncExternalStore } from 'react'

import {
  getResolvedThemeSnapshot,
  getServerResolvedThemeSnapshot,
  getServerThemeSnapshot,
  getThemeSnapshot,
  setThemePreference,
  subscribeToTheme,
  type ThemePreference,
} from '@/lib/theme'

export function useTheme() {
  const preference = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot)
  const resolvedTheme = useSyncExternalStore(subscribeToTheme, getResolvedThemeSnapshot, getServerResolvedThemeSnapshot)
  const setPreference = useCallback((next: ThemePreference) => setThemePreference(next), [])

  return { preference, resolvedTheme, setPreference }
}
