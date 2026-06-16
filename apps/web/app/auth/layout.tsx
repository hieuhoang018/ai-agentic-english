import React from 'react'
import AuthNav from '../components/AuthNav'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-inverse-surface">
      <header className="w-full py-4 px-6 border-b">
        <AuthNav />
      </header>

      <div className="flex items-center justify-center p-6 flex-1">
        <div className="w-full max-w-md bg-surface-container-lowest dark:bg-surface-container-high rounded-lg p-8 shadow-md">
          {children}
        </div>
      </div>
    </div>
  )
}
