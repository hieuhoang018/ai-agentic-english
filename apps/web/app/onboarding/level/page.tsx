'use client'

import Link from 'next/link'
import OnboardingShell from '../_components/OnboardingShell'
import { useOnboarding } from '../_components/OnboardingProvider'
import { onboardingRoutes } from '../_utils/onboarding-routes'

const assessmentMethods = [
  {
    href: onboardingRoutes.assessment,
    icon: 'quiz',
    title: 'Làm bài test',
    description: 'Đánh giá đọc, viết và nghe với bộ câu hỏi thật từ kho học liệu.',
    metaIcon: 'timer',
    meta: 'Theo số câu hỏi hiện có',
    tone: 'bg-blue-50 text-primary',
  },
  {
    href: onboardingRoutes.selfAssessment,
    icon: 'tune',
    title: 'Tự đánh giá',
    description: 'Dành cho học viên đã nắm rõ năng lực bản thân và muốn thiết lập nhanh cấp độ hiện tại.',
    metaIcon: 'speed',
    meta: 'Thang điểm 0-10',
    tone: 'bg-emerald-50 text-secondary',
  },
]

export default function LevelPage() {
  const { updateProfile } = useOnboarding()

  return (
    <OnboardingShell step={2} title="Xác định trình độ của bạn" description="Chọn phương pháp đánh giá trình độ hiện tại để Wise Mentor xây dựng lộ trình tối ưu." backHref={onboardingRoutes.goals}>
      <div className="grid max-w-3xl gap-5 md:grid-cols-2">
        {assessmentMethods.map((method) => (
          <Link
            key={method.href}
            href={method.href}
            onClick={() => updateProfile({ assessmentMethod: method.href === onboardingRoutes.assessment ? 'test' : 'selfAssessment' })}
            className="flex min-h-80 flex-col rounded-lg border border-outline-variant bg-white p-6 transition-colors hover:border-primary hover:bg-blue-50/30"
          >
            <span className={`flex h-12 w-12 items-center justify-center rounded-full ${method.tone}`}>
              <span className="material-symbols-outlined">{method.icon}</span>
            </span>
            <h2 className="mt-8 text-2xl font-bold text-on-surface">{method.title}</h2>
            <p className="mt-3 flex-1 text-base leading-7 text-on-surface-variant">{method.description}</p>
            <p className="mt-6 flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base">{method.metaIcon}</span>
              {method.meta}
            </p>
          </Link>
        ))}
      </div>
    </OnboardingShell>
  )
}
