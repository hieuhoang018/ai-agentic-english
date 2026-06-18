"use client"

import { useState } from 'react'

export default function LevelScale() {
  const [level, setLevel] = useState(5)

  return (
    <div>
      <div className="flex items-center justify-between gap-1">
        {Array.from({ length: 11 }, (_, value) => (
          <button key={value} onClick={() => setLevel(value)} className={`flex h-11 w-11 items-center justify-center rounded-full border-2 font-semibold ${value <= level ? 'border-primary bg-blue-50 text-primary' : 'border-outline-variant bg-surface text-on-surface'}`}>
            {value}
          </button>
        ))}
      </div>
      <div className="mt-6 flex justify-between text-sm text-on-surface-variant">
        <span>Beginner</span>
        <span>Intermediate</span>
        <span>Advanced</span>
      </div>
    </div>
  )
}
