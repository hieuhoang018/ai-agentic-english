"use client"

import { useState } from 'react'
import { assessmentQuestion } from '../_data/onboarding-content'

export default function AssessmentQuestion() {
  const [answer, setAnswer] = useState(assessmentQuestion.options[0])

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <span className="rounded-lg border border-primary/20 bg-blue-50 px-4 py-2 text-2xl font-bold text-primary">{assessmentQuestion.skill}</span>
        <span className="rounded-full bg-blue-50 px-4 py-2 font-bold text-primary">Câu {assessmentQuestion.current} / {assessmentQuestion.total}</span>
      </div>
      <h2 className="text-2xl font-bold leading-9 text-on-surface">{assessmentQuestion.prompt}</h2>
      <div className="my-6 rounded-lg border-l-4 border-primary bg-surface p-4 text-on-surface-variant">Context: {assessmentQuestion.context}</div>
      <div className="space-y-4">
        {assessmentQuestion.options.map((option, index) => (
          <button key={option} onClick={() => setAnswer(option)} className={`flex min-h-16 w-full items-center gap-4 rounded-lg border px-5 py-3 text-left ${answer === option ? 'border-primary bg-blue-50' : 'border-outline-variant bg-white'}`}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline">{String.fromCharCode(65 + index)}</span>
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}
