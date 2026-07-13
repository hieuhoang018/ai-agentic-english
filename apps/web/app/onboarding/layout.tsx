import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import OnboardingAccessGate from './_components/OnboardingAccessGate'
import OnboardingProvider from './_components/OnboardingProvider'

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()

  if (!userId) {
    redirect('/auth/sign-up?redirect_url=/onboarding/goals%3Ffresh_signup%3D1')
  }

  return (
    <div className="min-h-screen bg-background px-4 py-3 font-sans text-on-background dark:bg-inverse-surface dark:text-inverse-on-surface">
      <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-sm font-semibold text-on-surface-variant dark:text-surface-dim">Đang kiểm tra trạng thái onboarding...</div>}>
        <OnboardingProvider>
          <OnboardingAccessGate>{children}</OnboardingAccessGate>
        </OnboardingProvider>
      </Suspense>
    </div>
  )
}
