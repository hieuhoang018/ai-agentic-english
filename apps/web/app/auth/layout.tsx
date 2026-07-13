import React from 'react'
import Link from 'next/link'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background dark:bg-inverse-surface">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-2xl font-bold text-primary dark:text-primary-fixed-dim">English Academy</Link>
      </header>
      <div className="flex flex-1 items-center justify-center p-6">
        {children}
      </div>
    </div>
  )
}
