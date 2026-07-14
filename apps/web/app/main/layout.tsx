import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import React from 'react'

import { getOnboardingStatus } from '@/lib/onboarding/status'

import MainShell from '../components/MainShell'

export default async function MainLayout({ children }: { children: React.ReactNode }) {
  const { getToken, userId } = await auth()

  if (!userId) {
    redirect('/auth/sign-in?redirect_url=/main/homepage')
  }

  const token = await getToken()
  if (!token) {
    redirect('/auth/sign-in?redirect_url=/main/homepage')
  }

  const onboardingStatus = await getOnboardingStatus(userId, token)
  if (!onboardingStatus.isComplete) {
    redirect(onboardingStatus.nextOnboardingRoute)
  }

  return <MainShell>{children}</MainShell>
}
