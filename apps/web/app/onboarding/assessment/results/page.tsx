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
      tone: 'bg-emerald-50 text-emerald-800',
    }
  }

  if (score >= 5) {
    return {
      level: 'Intermediate',
      summary: 'Bạn có nền tảng để giao tiếp trong các tình huống quen thuộc. Lộ trình sẽ củng cố cấu trúc câu và tăng phản xạ.',
      tone: 'bg-blue-50 text-primary',
    }
  }

  return {
    level: 'Beginner',
    summary: 'Bạn đang ở điểm khởi đầu rất tốt. Lộ trình sẽ đi từ từ vựng thiết yếu và những mẫu câu giao tiếp đơn giản.',
    tone: 'bg-violet-100 text-violet-950',
  }
}

export default function AssessmentResultsPage() {
  const { isReady, profile } = useOnboarding()

  if (!isReady) {
    return <div className="py-16 text-center text-on-surface-variant">Đang phân tích kết quả...</div>
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
          <p className="text-sm font-bold uppercase tracking-wide text-primary">Điểm trình độ hiện tại</p>
          <p className="mt-2 text-6xl font-bold text-primary">{score}<span className="text-3xl">/10</span></p>
          <span className="mt-4 inline-flex rounded-full bg-white px-4 py-2 font-bold text-primary">{evaluation.level}</span>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-lg border border-outline-variant bg-white p-5">
            <span className="material-symbols-outlined text-primary">quiz</span>
            <h2 className="mt-3 font-bold text-on-surface">Câu trả lời đúng</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{correctAnswerCount} / {questionCount}</p>
            <p className="mt-1 text-sm text-on-surface-variant">câu hỏi từ kho học liệu</p>
          </article>
          <article className="rounded-lg border border-outline-variant bg-white p-5">
            <span className="material-symbols-outlined text-primary">verified</span>
            <h2 className="mt-3 font-bold text-on-surface">Kỹ năng đạt ngưỡng</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{assessedSkills.length}</p>
            <p className="mt-1 text-sm text-on-surface-variant">kỹ năng có mức CEFR được xác định</p>
          </article>
        </div>

        <section className="mt-6 rounded-lg border border-outline-variant bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-bold text-on-surface">Thang năng lực</h2>
              <p className="mt-1 text-sm text-on-surface-variant">A1 · A2 · B1 · B2 · C1 · C2</p>
            </div>
            <span className="font-bold text-primary">Mức {score}/10</span>
          </div>
          <div className="mt-6 overflow-x-auto pb-1">
            <div className="flex min-w-[600px] items-start justify-between gap-1">
              {Array.from({ length: 11 }, (_, value) => (
                <div key={value} className="flex flex-1 flex-col items-center gap-2">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-bold ${value === score ? 'border-primary bg-primary text-white shadow-md' : value < score ? 'border-primary bg-primary-container/10 text-primary' : 'border-outline-variant bg-white text-on-surface-variant'}`}>{value}</span>
                  {value === 0 ? <span className="text-xs text-on-surface-variant">Cơ bản</span> : null}
                  {value === 5 ? <span className="text-xs text-on-surface-variant">Trung cấp</span> : null}
                  {value === 10 ? <span className="text-xs text-on-surface-variant">Nâng cao</span> : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mt-6">
          <h2 className="text-xl font-bold text-on-surface">Tóm tắt theo kỹ năng</h2>
          {assessedSkills.length === 0 ? (
            <p className="mt-4 rounded-lg border border-outline-variant bg-white p-5 text-on-surface-variant">Bạn chưa đạt ngưỡng chấm điểm cho một kỹ năng nào. Lộ trình sẽ bắt đầu ở mức A1 và điều chỉnh theo tiến độ của bạn.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {assessedSkills.map(({ skill, level }) => {
                const detail = skillDetails[skill]

                return (
                  <article key={skill} className="rounded-lg border border-outline-variant bg-white p-5">
                    <div className="flex items-start justify-between gap-3">
                      <span className="material-symbols-outlined text-primary">{detail.icon}</span>
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">CEFR {level}</span>
                    </div>
                    <h3 className="mt-4 font-bold text-on-surface">{detail.label}</h3>
                    <p className="mt-1 text-sm text-on-surface-variant">Mức này được chấm từ các câu hỏi trong kho học liệu.</p>
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

        <div className="mt-8 flex justify-end border-t border-outline-variant/60 pt-6">
          <Link href={onboardingRoutes.preferences} className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white">
            Tiếp tục
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
      </section>
    </OnboardingShell>
  )
}
