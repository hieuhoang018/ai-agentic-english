'use client'

import { useUser } from '@clerk/nextjs'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { useOnboarding } from './OnboardingProvider'
import { markOnboardingComplete } from '../_utils/onboarding-storage'

type CompleteOnboardingLinkProps = {
  href: string
  children: React.ReactNode
  className?: string
}

export default function CompleteOnboardingLink({ href, children, className }: CompleteOnboardingLinkProps) {
  const router = useRouter()
  const { user } = useUser()
  const { clearProfile } = useOnboarding()
  const [isCompleting, setIsCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const completeOnboarding = async () => {
    if (!user?.id || isCompleting) return

    setIsCompleting(true)
    setError(null)

    try {
      await user.update({
        unsafeMetadata: {
          ...user.unsafeMetadata,
          onboardingComplete: true,
        },
      })
      markOnboardingComplete(user.id)
      clearProfile()
      router.push(href)
    } catch {
      setError('Không thể hoàn tất onboarding. Vui lòng thử lại.')
      setIsCompleting(false)
    }
  }

  return (
    <div className="text-center">
      <button type="button" className={className} disabled={isCompleting} onClick={() => void completeOnboarding()}>
        {isCompleting ? 'Đang hoàn tất...' : children}
      </button>
      {error ? <p className="mt-3 text-sm text-error dark:text-red-400" role="alert">{error}</p> : null}
    </div>
  )
}
