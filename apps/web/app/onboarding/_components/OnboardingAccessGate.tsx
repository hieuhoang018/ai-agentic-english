"use client"

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

const activeOnboardingKeyPrefix = 'english-academy:onboarding-active'
const completedOnboardingKeyPrefix = 'english-academy:onboarding-completed'
const freshSignUpWindowMs = 10 * 60 * 1000

function getUserScopedKey(prefix: string, userId: string) {
  return `${prefix}:${userId}`
}

export function markOnboardingComplete(userId: string) {
  window.sessionStorage.removeItem(getUserScopedKey(activeOnboardingKeyPrefix, userId))
  window.localStorage.setItem(getUserScopedKey(completedOnboardingKeyPrefix, userId), 'true')
}

export default function OnboardingAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, user } = useUser()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!isLoaded || !user?.id) return
    let allowUpdateId: number | undefined

    const allowOnboarding = () => {
      allowUpdateId = window.setTimeout(() => setAllowed(true), 0)
    }

    const isFreshSignUp = searchParams.get('fresh_signup') === '1'
    const activeOnboardingKey = getUserScopedKey(activeOnboardingKeyPrefix, user.id)
    const completedOnboardingKey = getUserScopedKey(completedOnboardingKeyPrefix, user.id)
    const hasCompletedOnboarding = window.localStorage.getItem(completedOnboardingKey) === 'true' || user.unsafeMetadata?.onboardingComplete === true
    const createdAtMs = user.createdAt ? new Date(user.createdAt).getTime() : Date.now()
    const isRecentlyCreatedAccount = Date.now() - createdAtMs <= freshSignUpWindowMs

    if (hasCompletedOnboarding) {
      router.replace('/main/homepage')
      return
    }

    if (isFreshSignUp && isRecentlyCreatedAccount) {
      window.sessionStorage.setItem(activeOnboardingKey, 'true')
      allowOnboarding()
      router.replace(pathname)
      return () => {
        if (allowUpdateId) window.clearTimeout(allowUpdateId)
      }
    }

    if (window.sessionStorage.getItem(activeOnboardingKey) === 'true') {
      allowOnboarding()
      return () => {
        if (allowUpdateId) window.clearTimeout(allowUpdateId)
      }
    }

    router.replace('/main/homepage')
  }, [isLoaded, pathname, router, searchParams, user?.id])

  if (!allowed) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm font-semibold text-on-surface-variant dark:text-surface-dim">
        Đang kiểm tra trạng thái onboarding...
      </div>
    )
  }

  return children
}
