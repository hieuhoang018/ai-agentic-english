import React from 'react'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background dark:bg-inverse-surface">

      <div className="flex items-center justify-center p-6 flex-1">
        {children}
      </div>
    </div>
  )
}
