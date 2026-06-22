"use client"

import { useState } from 'react'

type ExerciseNavigationProps = {
  initialQuestion: number
  totalQuestions: number
}

export default function ExerciseNavigation({ initialQuestion, totalQuestions }: ExerciseNavigationProps) {
  const [questionNumber, setQuestionNumber] = useState(initialQuestion)
  const canGoPrevious = questionNumber > 1
  const canGoNext = questionNumber < totalQuestions

  return (
    <div className="mt-8 flex items-center justify-between">
      <button
        type="button"
        disabled={!canGoPrevious}
        onClick={() => setQuestionNumber((value) => Math.max(1, value - 1))}
        className="flex h-11 items-center justify-center gap-2 rounded-lg border border-outline px-6 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
      >
        <span className="material-symbols-outlined text-base">arrow_back</span>
        Quay lại
      </button>

      <span className="text-sm font-semibold text-on-surface-variant">
        Câu {questionNumber} / {totalQuestions}
      </span>

      <button
        type="button"
        disabled={!canGoNext}
        onClick={() => setQuestionNumber((value) => Math.min(totalQuestions, value + 1))}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb] disabled:cursor-not-allowed disabled:bg-outline"
      >
        Tiếp tục
        <span className="material-symbols-outlined text-base">arrow_forward</span>
      </button>
    </div>
  )
}
