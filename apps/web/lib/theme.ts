export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'english-academy:theme'

const listeners = new Set<() => void>()

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system'
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === 'system' ? getSystemTheme() : preference
}

function applyResolvedTheme(resolved: ResolvedTheme) {
  document.documentElement.classList.toggle('dark', resolved === 'dark')
}

export function getThemeSnapshot(): ThemePreference {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemePreference(stored) ? stored : 'system'
}

export function getServerThemeSnapshot(): ThemePreference {
  return 'system'
}

// Separate useSyncExternalStore snapshot for the *resolved* theme. Computing this inline via
// resolveTheme(getThemeSnapshot()) in a component body is not hydration-safe: once code is
// running in the browser at all, `window` always exists, so getSystemTheme() reads the real OS
// preference immediately — even during React's hydration-matching first pass — while the server
// always rendered assuming light. Routing it through its own getSnapshot/getServerSnapshot pair
// lets React's built-in hydration mechanism handle the server/client gap correctly (matching the
// server on first paint, then auto-correcting right after hydration commits).
export function getResolvedThemeSnapshot(): ResolvedTheme {
  return resolveTheme(getThemeSnapshot())
}

export function getServerResolvedThemeSnapshot(): ResolvedTheme {
  return 'light'
}

export function setThemePreference(preference: ThemePreference) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, preference)
  applyResolvedTheme(resolveTheme(preference))
  listeners.forEach((listener) => listener())
}

export function subscribeToTheme(onChange: () => void) {
  listeners.add(onChange)

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onMediaChange = () => {
    if (getThemeSnapshot() === 'system') applyResolvedTheme(getSystemTheme())
    onChange()
  }
  media.addEventListener('change', onMediaChange)

  return () => {
    listeners.delete(onChange)
    media.removeEventListener('change', onMediaChange)
  }
}
