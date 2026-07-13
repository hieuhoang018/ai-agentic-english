'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { dark } from '@clerk/themes'

import { useTheme } from '@/lib/useTheme'

export default function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()

  return (
    <ClerkProvider appearance={resolvedTheme === 'dark' ? dark : undefined}>
      {children}
    </ClerkProvider>
  )
}
