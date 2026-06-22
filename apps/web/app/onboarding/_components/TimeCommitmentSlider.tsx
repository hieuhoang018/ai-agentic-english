"use client"

import { useState } from 'react'

export default function TimeCommitmentSlider() {
  const [minutes, setMinutes] = useState(15)

  return (
    <div>
      <div className="mb-4 text-center font-bold text-primary">{minutes} phút</div>
      <input className="w-full accent-primary" min={5} max={180} step={5} type="range" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} />
      <div className="mt-2 flex justify-between text-sm text-on-surface-variant">
        <span>5 phút</span>
        <span>3+ giờ</span>
      </div>
    </div>
  )
}
