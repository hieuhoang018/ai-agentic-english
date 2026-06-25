'use client'

import { useUser } from '@clerk/nextjs'
import { createContext, useCallback, useContext, useMemo, useState } from 'react'

import type { OnboardingProfile } from '../_types/onboarding'

type OnboardingProfileDraft = Partial<OnboardingProfile>

type OnboardingContextValue = {
  isReady: boolean
  profile: OnboardingProfileDraft
  updateProfile: (updates: OnboardingProfileDraft) => void
  clearProfile: () => void
}

const profileStorageKeyPrefix = 'english-academy:onboarding-profile'

const defaultProfile: OnboardingProfileDraft = {
  goalId: 'conversation',
  levelScore: 5,
  dailyMinutes: 15,
  prioritySkills: [],
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null)

function getStorageKey(userId: string) {
  return `${profileStorageKeyPrefix}:${userId}`
}

function getStoredProfile(storageKey: string): OnboardingProfileDraft {
  if (typeof window === 'undefined') return defaultProfile

  try {
    const storedProfile = window.sessionStorage.getItem(storageKey)
    if (!storedProfile) return defaultProfile

    const parsedProfile: unknown = JSON.parse(storedProfile)
    if (typeof parsedProfile !== 'object' || parsedProfile === null || Array.isArray(parsedProfile)) {
      return defaultProfile
    }

    return { ...defaultProfile, ...(parsedProfile as OnboardingProfileDraft) }
  } catch {
    return defaultProfile
  }
}

function PendingOnboardingProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<OnboardingContextValue>(
    () => ({
      isReady: false,
      profile: defaultProfile,
      updateProfile: () => undefined,
      clearProfile: () => undefined,
    }),
    [],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

function UserOnboardingProvider({ children, userId }: { children: React.ReactNode; userId: string }) {
  const storageKey = getStorageKey(userId)
  const [profile, setProfile] = useState<OnboardingProfileDraft>(() => getStoredProfile(storageKey))

  const updateProfile = useCallback(
    (updates: OnboardingProfileDraft) => {
      setProfile((currentProfile) => {
        const nextProfile = { ...currentProfile, ...updates }
        window.sessionStorage.setItem(storageKey, JSON.stringify(nextProfile))
        return nextProfile
      })
    },
    [storageKey],
  )

  const clearProfile = useCallback(() => {
    window.sessionStorage.removeItem(storageKey)
    setProfile(defaultProfile)
  }, [storageKey])

  const value = useMemo(
    () => ({ isReady: true, profile, updateProfile, clearProfile }),
    [clearProfile, profile, updateProfile],
  )

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
}

export default function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, user } = useUser()

  if (!isLoaded || !user?.id) {
    return <PendingOnboardingProvider>{children}</PendingOnboardingProvider>
  }

  return <UserOnboardingProvider key={user.id} userId={user.id}>{children}</UserOnboardingProvider>
}

export function useOnboarding() {
  const context = useContext(OnboardingContext)

  if (!context) {
    throw new Error('useOnboarding must be used within OnboardingProvider.')
  }

  return context
}
