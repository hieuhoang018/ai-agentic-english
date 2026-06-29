'use client'

import { useUser } from '@clerk/nextjs'
import { useCallback, useEffect, useRef, useState } from 'react'

import { isApiError } from '@/lib/api/client'
import type { OnboardingResponse } from '@/lib/api/types'

import CompleteOnboardingLink from '../_components/CompleteOnboardingLink'
import GeneratedPlanPreview from '../_components/GeneratedPlanPreview'
import { useOnboarding } from '../_components/OnboardingProvider'
import { toOnboardingRequest } from '../_utils/onboarding-request'
import { onboardingRoutes } from '../_utils/onboarding-routes'

type PlanState =
  | { status: 'loading' }
  | { status: 'success'; plan: OnboardingResponse }
  | { status: 'error'; message: string }

async function parseJsonResponse<TResponse>(response: Response): Promise<TResponse> {
  if (!response.ok) {
    const body = await response.json().catch(() => undefined)
    throw {
      status: response.status,
      message:
        typeof body === 'object' &&
        body !== null &&
        'message' in body &&
        typeof body.message === 'string'
          ? body.message
          : response.statusText,
      body,
    }
  }

  return response.json() as Promise<TResponse>
}

export default function GeneratedPlanPage() {
  const { isLoaded, user } = useUser()
  const { isReady, profile } = useOnboarding()
  const [state, setState] = useState<PlanState>({ status: 'loading' })
  const submittedRequestKey = useRef<string | null>(null)

  const userId = user?.id
  const request = userId ? toOnboardingRequest(userId, profile) : null
  const requestKey = request ? JSON.stringify(request) : null

  const generatePlan = useCallback(async () => {
    if (!userId || !requestKey) {
      setState({ status: 'error', message: 'Không tìm thấy phiên đăng nhập. Vui lòng đăng nhập lại.' })
      return
    }

    submittedRequestKey.current = requestKey
    setState({ status: 'loading' })

    try {
      const response = await fetch('/api/orchestrate/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toOnboardingRequest(userId, profile)),
      })
      const plan = await parseJsonResponse<OnboardingResponse>(response)
      setState({ status: 'success', plan })
    } catch (error) {
      setState({
        status: 'error',
        message: isApiError(error) ? error.message : 'Không thể tạo lộ trình lúc này. Vui lòng thử lại.',
      })
    }
  }, [profile, requestKey, userId])

  useEffect(() => {
    if (!isLoaded || !isReady || !requestKey || submittedRequestKey.current === requestKey) return
    void generatePlan()
  }, [generatePlan, isLoaded, isReady, requestKey])

  const retry = () => {
    submittedRequestKey.current = null
    void generatePlan()
  }

  if (!isLoaded || !isReady || state.status === 'loading') {
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-10 text-center">
        <span className="material-symbols-outlined animate-spin text-5xl text-primary">progress_activity</span>
        <h1 className="mt-6 text-3xl font-bold text-on-surface">Đang thiết kế lộ trình của bạn</h1>
        <p className="mt-3 max-w-xl text-on-surface-variant">Wise Mentor đang tạo kế hoạch học tập từ mục tiêu, trình độ và thời gian bạn đã chọn.</p>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="mx-auto flex min-h-screen max-w-2xl items-center px-4 py-10">
        <section className="w-full rounded-xl border border-error/30 bg-white p-8 text-center shadow-[0_18px_52px_-34px_rgba(15,23,42,0.8)]" role="alert">
          <span className="material-symbols-outlined text-5xl text-error">error</span>
          <h1 className="mt-5 text-2xl font-bold text-on-surface">Chưa thể tạo lộ trình</h1>
          <p className="mt-3 text-on-surface-variant">{state.message}</p>
          <button type="button" onClick={retry} className="mt-7 inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white">
            <span className="material-symbols-outlined">refresh</span>
            Thử lại
          </button>
        </section>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col items-center justify-center px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="text-4xl font-bold text-primary">Hành Trình Của Bạn Bắt Đầu</h1>
        <p className="mt-3 max-w-2xl text-on-surface-variant">Wise Mentor đã thiết kế lộ trình học tập cá nhân hóa dựa trên các lựa chọn của bạn.</p>
      </div>
      <GeneratedPlanPreview activities={state.plan.pathDefinition.activities} />
      <CompleteOnboardingLink href={onboardingRoutes.done} className="mt-8 flex h-14 items-center justify-center rounded-full bg-primary px-10 text-xl font-bold text-white shadow-lg">
        Bắt Đầu Hành Trình
      </CompleteOnboardingLink>
    </div>
  )
}
