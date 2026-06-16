import React from 'react'
import SideMenu from '../components/SideMenu'

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div className="bg-background dark:bg-inverse-surface text-on-background dark:text-inverse-on-surface font-sans min-h-screen flex">
        <SideMenu />

        <main className="flex-1 ml-0 md:ml-64 w-full min-h-screen flex flex-col">
          <header className="bg-surface/80 dark:bg-inverse-surface/80 backdrop-blur-md sticky top-0 z-40 flex items-center w-full px-container-margin py-base border-b border-outline-variant/30 justify-end">
            <div className="flex items-center gap-4">
              <button className="p-2 text-on-surface-variant dark:text-surface-dim hover:bg-surface-container dark:hover:bg-surface-variant rounded-full transition-all relative">
                <span className="material-symbols-outlined">notifications</span>
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-error rounded-full border-2 border-surface dark:border-inverse-surface"></span>
              </button>
              <button className="p-2 text-on-surface-variant dark:text-surface-dim hover:bg-surface-container dark:hover:bg-surface-variant rounded-full transition-all">
                <span className="material-symbols-outlined">settings</span>
              </button>
            </div>
          </header>

          <div className="flex-1 p-container-margin md:p-8 max-w-7xl mx-auto w-full space-y-stack-lg">
            {children}
          </div>
        </main>
      </div>
    </>
  )
}
