'use client'

import Link from 'next/link'

import { placementSkillIds, type PlacementSkillId } from '../../_types/onboarding'
import OnboardingShell from '../../_components/OnboardingShell'
import { useOnboarding } from '../../_components/OnboardingProvider'
import { onboardingRoutes } from '../../_utils/onboarding-routes'

const skillDetails: Record<PlacementSkillId, { label: string; icon: string }> = {
  reading: { label: 'Reading', icon: 'menu_book' },
  writing: { label: 'Writing', icon: 'edit_note' },
  listening: { label: 'Listening', icon: 'headphones' },
}

function getEvaluation(score: number) {
  if (score >= 8) {
    return {
      level: 'Upper Intermediate',
      summary: 'Bạn đã có nền tảng vững. Lộ trình sẽ tập trung mở rộng vốn từ, sự tự nhiên và độ chính xác khi giao tiếp.',
      tone: 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200',
    }
  }

  if (score >= 5) {
    return {
      level: 'Intermediate',
      summary: 'Bạn có nền tảng để giao tiếp trong các tình huống quen thuộc. Lộ trình sẽ củng cố cấu trúc câu và tăng phản xạ.',
      tone: 'bg-blue-50 text-primary dark:text-primary-fixed-dim dark:bg-primary-container/10',
    }
  }

  return {
    level: 'Beginner',
    summary: 'Bạn đang ở điểm khởi đầu rất tốt. Lộ trình sẽ đi từ từ vựng thiết yếu và những mẫu câu giao tiếp đơn giản.',
    tone: 'bg-violet-100 text-violet-950 dark:bg-violet-900/30 dark:text-violet-200',
  }
}

export default function AssessmentResultsPage() {
  const { isReady, profile } = useOnboarding()

  if (!isReady) {
    return <div className="py-16 text-center text-on-surface-variant dark:text-surface-dim">Đang phân tích kết quả...</div>
  }

  const assessmentLevels = profile.assessmentLevels ?? {}
  const assessedSkills = placementSkillIds.flatMap((skill) => {
    const level = assessmentLevels[skill]
    return level ? [{ skill, level }] : []
  })
  const questionCount = profile.assessmentQuestionCount ?? 0
  const correctAnswerCount = profile.assessmentCorrectAnswerCount ?? 0
  const score = profile.levelScore ?? 0
  const evaluation = getEvaluation(score)

  if (questionCount === 0) {
    return (
      <OnboardingShell
        step={2}
        title="Chưa có kết quả đánh giá"
        description="Hãy hoàn thành bài đánh giá từ kho học liệu trước khi tiếp tục."
        backHref={onboardingRoutes.assessment}
        wide
      >
        <Link href={onboardingRoutes.assessment} className="inline-flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white">
          Làm bài đánh giá
          <span className="material-symbols-outlined">arrow_forward</span>
        </Link>
      </OnboardingShell>
    )
  }

  return (
    <OnboardingShell
      step={2}
      title="Kết quả đánh giá"
      description="Learning Materials đã chấm các câu trả lời và xác định mức CEFR cho từng kỹ năng đạt ngưỡng."
      wide
    >
      <section className="mx-auto max-w-3xl">
        <div className="rounded-lg border border-primary/20 bg-primary-container p-7 text-center">
          <p className="text-lg font-bold uppercase tracking-wide text-white">Trình độ hiện tại</p>
          <span className="mt-4 inline-flex rounded-full bg-white px-4 py-2 font-bold text-primary dark:text-primary-fixed-dim">{evaluation.level}</span>
        </div>

        <section className="mt-6">
          <h2 className="text-xl font-bold text-on-surface dark:text-on-primary">Tóm tắt theo kỹ năng</h2>
          {assessedSkills.length === 0 ? (
            <p className="mt-4 rounded-lg border border-outline-variant bg-white p-5 text-on-surface-variant dark:border-outline dark:bg-surface-dark dark:text-surface-dim">Bạn chưa đạt ngưỡng chấm điểm cho một kỹ năng nào. Lộ trình sẽ bắt đầu ở mức A1 và điều chỉnh theo tiến độ của bạn.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {assessedSkills.map(({ skill, level }) => {
                const detail = skillDetails[skill]

                return (
                  <article key={skill} className="rounded-lg border border-outline-variant bg-white p-5 dark:border-outline dark:bg-surface-dark">
                    <div className="flex items-start justify-between gap-3">
                      <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim">{detail.icon}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">CEFR {level}</span>
                    </div>
                    <h3 className="mt-4 font-bold text-on-surface dark:text-on-primary">{detail.label}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant dark:text-surface-dim">Mức này được chấm từ các câu hỏi trong kho học liệu.</p>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <div className={`mt-6 rounded-lg p-6 ${evaluation.tone}`}>
          <h2 className="flex items-center gap-2 text-xl font-bold"><span className="material-symbols-outlined">psychology</span> Nhận xét từ Wise Mentor</h2>
          <p className="mt-3 leading-7">{evaluation.summary}</p>
        </div>

        <div className="mt-8 flex justify-end border-t border-outline-variant/60 pt-6 dark:border-outline/60">
          <Link href={onboardingRoutes.preferences} className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white">
            Tiếp tục
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
      </section>
    </OnboardingShell>
  )
}
