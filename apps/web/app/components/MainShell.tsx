"use client"

import { useEffect, useState, type ReactNode } from 'react'

import DashboardTopBar from './DashboardTopBar'
import SideMenu from './SideMenu'

type MainShellProps = {
  children: ReactNode
}

export default function MainShell({ children }: MainShellProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  useEffect(() => {
    if (!isMobileMenuOpen) return

    const previousOverflow = document.body.style.overflow
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsMobileMenuOpen(false)
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

  return (
    <div className="min-h-screen bg-background font-sans text-on-background dark:bg-inverse-surface dark:text-inverse-on-surface">
      <SideMenu />

      <button
        type="button"
        aria-label="Close navigation menu"
        aria-hidden={!isMobileMenuOpen}
        tabIndex={isMobileMenuOpen ? 0 : -1}
        onClick={() => setIsMobileMenuOpen(false)}
        className={`fixed inset-0 z-[60] bg-black/35 transition-opacity duration-300 md:hidden ${
          isMobileMenuOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      <SideMenu
        variant="mobile"
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />

      <main className="flex min-h-screen min-w-0 flex-1 flex-col md:ml-64">
        <DashboardTopBar
          isMenuOpen={isMobileMenuOpen}
          onOpenMenu={() => setIsMobileMenuOpen(true)}
        />

        <div className="mx-auto flex w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6 md:p-8">
          <div className="min-w-0 flex-1">{children}</div>
        </div>
      </main>
    </div>
  )
}
