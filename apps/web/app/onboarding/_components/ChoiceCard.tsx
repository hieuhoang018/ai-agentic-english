"use client"

import { useState } from 'react'

type ChoiceCardProps = {
  title: string
  description: string
  icon: string
  tone?: string
  defaultSelected?: boolean
}

export default function ChoiceCard({ title, description, icon, tone = 'bg-blue-50 text-primary', defaultSelected = false }: ChoiceCardProps) {
  const [selected, setSelected] = useState(defaultSelected)

  return (
    <button onClick={() => setSelected((value) => !value)} className={`min-h-36 rounded-lg border bg-white p-5 text-left transition-colors ${selected ? 'border-primary bg-blue-50/40' : 'border-outline-variant hover:border-primary'}`}>
      <span className={`mb-5 flex h-12 w-12 items-center justify-center rounded-full ${tone}`}><span className="material-symbols-outlined">{icon}</span></span>
      <h2 className="text-xl font-semibold text-on-surface">{title}</h2>
      <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
    </button>
  )
}
