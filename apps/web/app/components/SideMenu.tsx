"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'

export default function SideMenu() {
  const pathname = usePathname()
  const isHome = pathname === '/main/homepage' || pathname === '/'
  const isPractice = pathname?.startsWith('/main/practice-center')
  const base = 'flex items-center px-4 py-3 rounded-lg transition-colors duration-200'
  const active = 'text-primary font-bold border-l-4 border-primary bg-primary-container/10'
  const inactive = 'text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant'

  return (
    <nav className="bg-surface-container-low dark:bg-surface-container-highest h-screen w-64 fixed left-0 top-0 hidden md:flex flex-col border-r border-outline-variant dark:border-outline z-50 flex justify-between">
      <div>
        <div className="px-4 py-6">
          <h1 className="text-2xl font-bold text-primary">English Academy</h1>
          <p className="text-sm text-on-surface-variant dark:text-surface-dim mt-1">Wise Mentor AI</p>
        </div>
        <div className="px-4 py-2 flex items-center gap-3">
          <UserButton />
          <div>
            <p className="text-sm font-bold">Nguyễn Văn A</p>
            <p className="text-xs text-on-surface-variant dark:text-surface-dim">Học viên Pro</p>
          </div>
        </div>
        <div className="mx-4 border-b border-outline-variant/30 my-2"></div>
        <div className="overflow-y-auto py-stack-md px-3 space-y-2">
          <Link href="/main/homepage" className={`${base} ${isHome ? active : inactive}`} aria-current={isHome ? 'page' : undefined}>
            <span className={`material-symbols-outlined mr-3 ${isHome ? 'filled' : ''}`}>home</span>
            <span className="text-sm">Trang chủ</span>
          </Link>

          <Link href="/main/practice-center" className={`${base} ${isPractice ? active : inactive}`} aria-current={isPractice ? 'page' : undefined}>
            <span className={`material-symbols-outlined mr-3 ${isPractice ? 'filled' : ''}`}>school</span>
            <span className="text-sm">Trung tâm thực hành</span>
          </Link>
          <a className="flex items-center px-4 py-3 rounded-lg text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant transition-colors duration-200" href="/main/review-center">
            <span className="material-symbols-outlined mr-3">hub</span>
            <span className="text-sm">Trung tâm ôn luyện</span>
          </a>
        </div>
      </div>
      <div className="py-4 px-3 space-y-2 border-t border-outline-variant/30 mt-auto">
        <a className="flex items-center px-4 py-2 rounded-lg text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant transition-colors duration-200" href="#">
          <span className="material-symbols-outlined mr-3 text-sm">help</span>
          <span className="text-sm">Trợ giúp</span>
        </a>
        <a className="flex items-center px-4 py-2 rounded-lg text-on-surface-variant dark:text-surface-dim hover:text-primary hover:bg-surface-container-high dark:hover:bg-surface-variant transition-colors duration-200" href="#">
          <span className="material-symbols-outlined mr-3 text-sm">info</span>
          <span className="text-sm">Về chúng tôi</span>
        </a>
      </div>
    </nav>
  )
}
