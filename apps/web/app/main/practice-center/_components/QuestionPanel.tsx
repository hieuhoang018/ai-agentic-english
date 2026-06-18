"use client"

import { useState } from 'react'
import type { PracticeFeedback, PracticeQuestion } from '../_types/practice'
import AnswerOption from './AnswerOption'

type QuestionPanelProps = {
  question: PracticeQuestion
  feedback: PracticeFeedback
}

export default function QuestionPanel({ question, feedback }: QuestionPanelProps) {
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(question.type === 'mcq' ? question.correctOptionId ?? null : null)
  const [submitted, setSubmitted] = useState(false)

  return (
    <section className="rounded-lg border border-outline-variant/50 border-t-4 border-t-primary bg-surface-container-lowest p-6 shadow-[0_8px_28px_-20px_rgba(15,23,42,0.5)]">
      <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-primary">
        <span className="material-symbols-outlined">quiz</span>
        Câu hỏi thực hành
      </h2>

      {question.passage ? (
        <div className="mb-6 rounded-lg border border-outline-variant/50 bg-surface p-4 leading-7 text-on-surface">
          <p className="mb-2 font-semibold">Read the following passage:</p>
          <p>{question.passage}</p>
        </div>
      ) : null}

      {question.context ? (
        <div className="mb-6 rounded-lg border-l-4 border-primary bg-surface p-4 text-on-surface-variant">
          {question.context}
        </div>
      ) : null}

      <p className="mb-4 font-semibold leading-6 text-on-surface">Question: {question.prompt}</p>

      {question.type === 'mcq' && question.options ? (
        <div className="space-y-3">
          {question.options.map((option) => (
            <AnswerOption key={option.id} option={option} selected={selectedOptionId === option.id} onSelect={setSelectedOptionId} />
          ))}
        </div>
      ) : null}

      {question.type === 'shortAnswer' ? (
        <input className="h-12 w-full rounded-lg border border-outline-variant bg-white px-4 outline-none transition-colors focus:border-primary" placeholder={question.placeholder ?? 'Nhập câu trả lời ngắn...'} />
      ) : null}

      {question.type === 'writingPrompt' ? (
        <textarea className="min-h-48 w-full resize-none rounded-lg border border-outline-variant bg-white p-4 leading-7 outline-none transition-colors focus:border-primary" placeholder={question.placeholder ?? 'Viết câu trả lời của bạn...'} />
      ) : null}

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => setSubmitted(true)}
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-6 text-sm font-semibold text-white transition-colors hover:bg-[#0047bb]"
        >
          <span className="material-symbols-outlined text-base">auto_awesome</span>
          Kiểm tra đáp án
        </button>
      </div>

      {submitted ? (
        <div className="mt-5 rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm leading-6 text-violet-950">
          <p className="mb-1 font-bold">{feedback.title}</p>
          <p>{feedback.message}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {feedback.highlights.map((highlight) => (
              <span key={highlight} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-tertiary">
                {highlight}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  )
}
