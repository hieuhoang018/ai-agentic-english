"use client"

import { useState } from 'react'
import type { GrammarLesson } from '../_types/review'

type GrammarLessonViewProps = {
  lesson: GrammarLesson
}

export default function GrammarLessonView({ lesson }: GrammarLessonViewProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const theory = lesson.theory
  const examples = lesson.examples ?? []
  const questions = lesson.questions ?? []

  return (
    <div className="pb-8">
      <div className="mb-7 border-b border-outline-variant pb-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-bold uppercase text-white">{lesson.difficulty}</span>
          <span className="rounded-full bg-surface-container px-3 py-1 text-xs font-semibold text-on-surface-variant">45 mins</span>
        </div>
        <h1 className="text-4xl font-bold text-on-surface">{lesson.title} (Present Simple Tense)</h1>
        <p className="mt-3 max-w-4xl text-lg leading-8 text-on-surface-variant">{lesson.description} Đây là nền tảng quan trọng nhất để bắt đầu giao tiếp tiếng Anh cơ bản.</p>
      </div>

      {theory ? (
        <section className="mb-8">
          <h2 className="mb-5 flex items-center gap-2 text-2xl font-bold text-on-surface"><span className="material-symbols-outlined text-primary">menu_book</span>Lý thuyết</h2>
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="rounded-lg border border-outline-variant bg-white p-5">
              <h3 className="mb-4 flex items-center gap-3 border-b border-outline-variant pb-3 font-bold"><span className="material-symbols-outlined text-primary">lightbulb</span>Usage (Cách dùng)</h3>
              <div className="space-y-4">
                {theory.usage.map((item) => <p key={item} className="flex gap-2 text-on-surface-variant"><span className="material-symbols-outlined text-base text-primary">check_circle</span>{item}</p>)}
              </div>
            </div>
            <div className="rounded-lg border border-outline-variant bg-white p-5">
              <h3 className="mb-4 flex items-center gap-3 border-b border-outline-variant pb-3 font-bold"><span className="material-symbols-outlined text-primary">functions</span>Formula (Công thức)</h3>
              <div className="space-y-3">
                {theory.formulas.map((formula) => (
                  <div key={formula.label} className="rounded-lg bg-surface p-4">
                    <p className={`font-bold ${formula.tone === 'error' ? 'text-error' : formula.tone === 'warning' ? 'text-orange-700' : 'text-primary'}`}>{formula.label}</p>
                    <p className="mt-1 font-semibold">{formula.value}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-lg border border-outline-variant bg-white p-5">
              <h3 className="mb-4 flex items-center gap-3 border-b border-outline-variant pb-3 font-bold"><span className="material-symbols-outlined text-primary">campaign</span>Signal Words (Dấu hiệu)</h3>
              <div className="flex flex-wrap gap-2">
                {theory.signalWords.map((word) => <span key={word} className="rounded-full bg-primary-fixed px-3 py-1 text-sm text-primary">{word}</span>)}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-on-surface"><span className="material-symbols-outlined text-primary">chat_bubble</span>Ví dụ</h2>
        <div className="space-y-4">
          {examples.map((example) => (
            <div key={example.text} className={`rounded-lg border border-outline-variant border-l-4 bg-white p-4 ${example.tone === 'error' ? 'border-l-error' : example.tone === 'success' ? 'border-l-secondary' : 'border-l-primary'}`}>
              <p className="font-semibold">{example.text}</p>
              <p className="mt-1 italic text-on-surface-variant">{example.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold text-on-surface"><span className="material-symbols-outlined text-primary">checklist</span>Luyện tập Trắc nghiệm</h2>
        <div className="space-y-6">
          {questions.map((question, questionIndex) => (
            <div key={question.id} className="rounded-lg border border-outline-variant bg-white p-6">
              <p className="mb-4 font-semibold">{questionIndex + 1}. {question.prompt}</p>
              <div className="space-y-3">
                {question.options.map((option, optionIndex) => (
                  <button key={option} onClick={() => setAnswers((value) => ({ ...value, [question.id]: option }))} className={`flex h-11 w-full items-center gap-3 rounded-lg border px-4 text-left ${answers[question.id] === option ? 'border-primary bg-blue-50' : 'border-outline-variant bg-white'}`}>
                    <span className="flex h-5 w-5 items-center justify-center rounded-full border border-outline text-xs">{String.fromCharCode(65 + optionIndex)}</span>
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 flex justify-end">
          <button className="flex h-12 items-center gap-2 rounded-lg bg-primary px-6 font-bold text-white"><span className="material-symbols-outlined">checklist</span>Kiểm tra đáp án</button>
        </div>
      </section>
    </div>
  )
}
