import React from 'react'
import SideMenu from '../components/SideMenu'
import DashboardTopBar from '../components/DashboardTopBar'

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background dark:bg-inverse-surface text-on-background dark:text-inverse-on-surface font-sans min-h-screen flex">
      <SideMenu />

      <main className="flex-1 ml-0 md:ml-64 w-full min-h-screen flex flex-col">
        <DashboardTopBar />

        <div className="flex-1 p-container-margin md:p-8 max-w-7xl mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
