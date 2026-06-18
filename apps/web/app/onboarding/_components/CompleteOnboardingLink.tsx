"use client"

import { useRouter } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { markOnboardingComplete } from './OnboardingAccessGate'

type CompleteOnboardingLinkProps = {
  href: string
  children: React.ReactNode
  className?: string
}

export default function CompleteOnboardingLink({ href, children, className }: CompleteOnboardingLinkProps) {
  const router = useRouter()
  const { user } = useUser()

  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          if (user?.id) {
            markOnboardingComplete(user.id)
            await user.update({
              unsafeMetadata: {
                ...user.unsafeMetadata,
                onboardingComplete: true,
              },
            })
          }
        } finally {
          router.push(href)
        }
      }}
    >
      {children}
    </button>
  )
}
