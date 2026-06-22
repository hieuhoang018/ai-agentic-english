"use client"

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { assessmentQuestions } from '../_data/onboarding-content'
import { onboardingRoutes } from '../_utils/onboarding-routes'

export default function AssessmentQuestion() {
  const router = useRouter()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const question = assessmentQuestions[currentIndex]
  const answer = answers[currentIndex]
  const isFirstQuestion = currentIndex === 0
  const isLastQuestion = currentIndex === assessmentQuestions.length - 1

  const selectAnswer = (option: string) => {
    setAnswers((currentAnswers) => ({ ...currentAnswers, [currentIndex]: option }))
  }

  const goNext = () => {
    if (!answer) return

    if (!isLastQuestion) {
      setCurrentIndex((index) => index + 1)
      return
    }

    const correctAnswers = assessmentQuestions.filter((item, index) => answers[index] === item.correctAnswer).length
    const score = Math.round((correctAnswers / assessmentQuestions.length) * 10)
    const skillResults = assessmentQuestions.map((item, index) => (answers[index] === item.correctAnswer ? '1' : '0')).join(',')
    router.push(`${onboardingRoutes.assessmentResults}?score=${score}&correct=${correctAnswers}&skills=${skillResults}`)
  }

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-lg border border-primary/20 bg-blue-50 px-4 py-2 text-2xl font-bold text-primary">{question.skill}</span>
        <span className="rounded-full bg-blue-50 px-4 py-2 font-bold text-primary">Câu {currentIndex + 1} / {assessmentQuestions.length}</span>
      </div>
      <h2 className="text-2xl font-bold leading-9 text-on-surface">{question.prompt}</h2>
      <div className="my-6 rounded-lg border-l-4 border-primary bg-surface p-4 text-on-surface-variant">Context: {question.context}</div>
      <div className="space-y-4">
        {question.options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => selectAnswer(option)}
            aria-pressed={answer === option}
            className={`flex min-h-16 w-full items-center gap-4 rounded-lg border px-5 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${answer === option ? 'border-primary bg-primary-container/25' : 'border-outline-variant bg-white hover:border-primary hover:bg-blue-50/30'}`}
          >
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${answer === option ? 'border-primary bg-primary text-white' : 'border-outline'}`}>{String.fromCharCode(65 + index)}</span>
            {option}
          </button>
        ))}
      </div>
      <aside className="mt-6 rounded-lg bg-violet-100 p-5 text-violet-950">
        <p className="font-bold">Mentor Insight</p>
        <p className="mt-1">{question.insight}</p>
      </aside>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant/60 pt-6">
        <button
          type="button"
          onClick={() => setCurrentIndex((index) => index - 1)}
          disabled={isFirstQuestion}
          className="flex h-12 items-center gap-2 rounded-full border border-outline px-6 font-semibold text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          Câu trước
        </button>
        <button
          type="button"
          onClick={goNext}
          disabled={!answer}
          className="flex h-12 items-center gap-2 rounded-full bg-primary px-7 font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {isLastQuestion ? 'Đánh giá' : 'Câu sau'}
          <span className="material-symbols-outlined">arrow_forward</span>
        </button>
      </div>
    </div>
  )
}
