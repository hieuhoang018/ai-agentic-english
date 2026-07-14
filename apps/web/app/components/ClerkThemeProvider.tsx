'use client'

import { ClerkProvider } from '@clerk/nextjs'
import { dark, experimental_createTheme } from '@clerk/themes'

import { useTheme } from '@/lib/useTheme'

// Clerk's default appearance (passing `undefined`) auto-adapts to the OS
// `prefers-color-scheme` setting on its own, independent of our app's theme choice —
// so a user on Light mode with a dark OS would still see a dark Clerk UI. Mirroring
// the same variables `dark` pins below, but with light values, forces Clerk to follow
// our resolved theme instead of the system's.
const light = experimental_createTheme({
  name: 'light',
  variables: {
    colorBackground: '#ffffff',
    colorNeutral: 'black',
    colorPrimary: '#2f3037',
    colorPrimaryForeground: 'white',
    colorForeground: '#212126',
    colorInputForeground: 'black',
    colorInput: '#ffffff',
  },
})

export default function ClerkThemeProvider({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme()

  return (
    <ClerkProvider appearance={resolvedTheme === 'dark' ? dark : light}>
      {children}
    </ClerkProvider>
  )
}
