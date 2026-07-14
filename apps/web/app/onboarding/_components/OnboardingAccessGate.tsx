"use client"

import { useEffect, useState } from 'react'
import { useUser } from '@clerk/nextjs'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

import {
  clearStoredOnboardingComplete,
  markOnboardingActive,
  markOnboardingComplete,
} from '../_utils/onboarding-storage'

type OnboardingStatusResponse = {
  hasActiveLearningPath: boolean
  isComplete: boolean
}

async function loadOnboardingStatus() {
  const response = await fetch('/api/onboarding/status', { cache: 'no-store' })
  if (!response.ok) throw new Error(`Unable to load onboarding status: ${response.status}`)
  return response.json() as Promise<OnboardingStatusResponse>
}

export default function OnboardingAccessGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isLoaded, user } = useUser()
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    if (!isLoaded || !user?.id) return
    let isCancelled = false
    let allowUpdateId: number | undefined

    const allowOnboarding = () => {
      allowUpdateId = window.setTimeout(() => setAllowed(true), 0)
    }

    const checkAccess = async () => {
      const isFreshSignUp = searchParams.get('fresh_signup') === '1'

      try {
        const status = await loadOnboardingStatus()
        if (isCancelled) return

        if (status.isComplete) {
          markOnboardingComplete(user.id)
          router.replace('/main/homepage')
          return
        }

        if (!status.hasActiveLearningPath) {
          clearStoredOnboardingComplete(user.id)
        }
      } catch {
        if (isCancelled) return
      }

      markOnboardingActive(user.id)
      allowOnboarding()
      if (isFreshSignUp) {
        router.replace(pathname)
      }
    }

    void checkAccess()
    return () => {
      isCancelled = true
      if (allowUpdateId) window.clearTimeout(allowUpdateId)
    }
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
