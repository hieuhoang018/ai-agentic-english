"use client"

import type { McqOption } from '../_types/practice'

type AnswerOptionProps = {
  option: McqOption
  selected: boolean
  onSelect: (id: string) => void
}

export default function AnswerOption({ option, selected, onSelect }: AnswerOptionProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(option.id)}
      className={`flex min-h-14 w-full items-center gap-4 rounded-lg border px-4 text-left text-base transition-colors ${selected ? 'border-primary bg-blue-50 text-on-surface shadow-[inset_0_0_0_1px_var(--color-primary)]' : 'border-outline-variant bg-white text-on-surface hover:border-primary/70 hover:bg-blue-50/40'}`}
    >
      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary' : 'border-outline'}`}>
        {selected ? <span className="h-2 w-2 rounded-full bg-white" /> : null}
      </span>
      <span>{option.label}</span>
    </button>
  )
}
