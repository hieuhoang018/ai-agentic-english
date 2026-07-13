'use client'

import { useTheme } from '@/lib/useTheme'
import type { ThemePreference } from '@/lib/theme'

const nextPreference: Record<ThemePreference, ThemePreference> = {
  light: 'dark',
  dark: 'system',
  system: 'light',
}

const preferenceIcon: Record<ThemePreference, string> = {
  light: 'light_mode',
  dark: 'dark_mode',
  system: 'brightness_auto',
}

const preferenceLabel: Record<ThemePreference, string> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo hệ thống',
}

export default function ThemeToggle() {
  const { preference, setPreference } = useTheme()

  return (
    <button
      type="button"
      onClick={() => setPreference(nextPreference[preference])}
      className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container dark:text-on-primary"
      aria-label={`Giao diện: ${preferenceLabel[preference]}. Nhấn để đổi.`}
      title={`Giao diện: ${preferenceLabel[preference]}`}
    >
      <span className="material-symbols-outlined">{preferenceIcon[preference]}</span>
    </button>
  )
}
