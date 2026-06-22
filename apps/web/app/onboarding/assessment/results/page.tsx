"use client"

import Link from 'next/link'
import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import OnboardingShell from '../../_components/OnboardingShell'
import { assessmentQuestions } from '../../_data/onboarding-content'
import { onboardingRoutes } from '../../_utils/onboarding-routes'

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
  return (
    <Suspense fallback={<div className="py-16 text-center text-on-surface-variant">Đang phân tích kết quả...</div>}>
      <AssessmentResultsContent />
    </Suspense>
  )
}

function AssessmentResultsContent() {
  const searchParams = useSearchParams()
  const rawScore = Number(searchParams.get('score'))
  const score = Number.isFinite(rawScore) && rawScore >= 0 && rawScore <= 10 ? rawScore : 5
  const rawCorrectAnswers = Number(searchParams.get('correct'))
  const correctAnswers = Number.isInteger(rawCorrectAnswers) && rawCorrectAnswers >= 0 && rawCorrectAnswers <= assessmentQuestions.length
    ? rawCorrectAnswers
    : Math.round((score / 10) * assessmentQuestions.length)
  const skillResults = (searchParams.get('skills') ?? '').split(',').map((value) => value === '1')
  const evaluation = getEvaluation(score)

  return (
    <OnboardingShell
      step={2}
      title="Kết quả đánh giá"
      description="Wise Mentor đã phân tích câu trả lời để xác định điểm xuất phát phù hợp cho lộ trình của bạn."
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
            <span className="material-symbols-outlined text-primary">task_alt</span>
            <h2 className="mt-3 font-bold text-on-surface">Câu trả lời đúng</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{correctAnswers} / {assessmentQuestions.length}</p>
            <p className="mt-1 text-sm text-on-surface-variant">câu trả lời chính xác</p>
          </article>
          <article className="rounded-lg border border-outline-variant bg-white p-5">
            <span className="material-symbols-outlined text-primary">speed</span>
            <h2 className="mt-3 font-bold text-on-surface">Mức đánh giá</h2>
            <p className="mt-1 text-2xl font-bold text-primary">{evaluation.level}</p>
            <p className="mt-1 text-sm text-on-surface-variant">trên thang năng lực 0–10</p>
          </article>
        </div>

        <section className="mt-6 rounded-lg border border-outline-variant bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-bold text-on-surface">Thang năng lực</h2>
              <p className="mt-1 text-sm text-on-surface-variant">Beginner · Intermediate · Advanced</p>
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
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {assessmentQuestions.map((question, index) => {
              const isCorrect = skillResults[index] ?? false
              const skillIcon = ({
                Reading: 'menu_book',
                Listening: 'headphones',
                Writing: 'edit_note',
                Speaking: 'record_voice_over',
              } as Record<string, string>)[question.skill]

              return (
                <article key={question.skill} className="rounded-lg border border-outline-variant bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="material-symbols-outlined text-primary">{skillIcon}</span>
                    <span className={`rounded-full px-3 py-1 text-xs font-bold ${isCorrect ? 'bg-emerald-50 text-emerald-800' : 'bg-orange-50 text-orange-800'}`}>{isCorrect ? 'Đúng 1/1' : 'Cần luyện thêm'}</span>
                  </div>
                  <h3 className="mt-4 font-bold text-on-surface">{question.skill}</h3>
                  <p className="mt-1 text-sm text-on-surface-variant">{isCorrect ? 'Bạn đã nắm được nền tảng của kỹ năng này.' : 'Lộ trình sẽ ưu tiên những bài luyện phù hợp để củng cố kỹ năng này.'}</p>
                </article>
              )
            })}
          </div>
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
