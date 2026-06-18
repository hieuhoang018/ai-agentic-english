"use client"

import { useMemo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

type Crumb = {
  label: string
  href?: string
}

const skillLabels: Record<string, string> = {
  reading: 'Luyện Đọc',
  listening: 'Luyện Nghe',
  writing: 'Luyện Viết',
  speaking: 'Luyện Nói',
}

function buildCrumbs(pathname: string): Crumb[] {
  if (pathname === '/main/homepage') {
    return [{ label: 'Trang chủ' }]
  }

  if (pathname.startsWith('/main/practice-center')) {
    const parts = pathname.split('/').filter(Boolean)
    const crumbs: Crumb[] = [{ label: 'Trung tâm thực hành', href: '/main/practice-center' }]
    const skill = parts[2]

    if (skill && skillLabels[skill]) {
      crumbs.push({
        label: skillLabels[skill],
        href: `/main/practice-center/${skill}`,
      })
    }

    if (parts.includes('modules')) {
      const moduleId = parts[parts.indexOf('modules') + 1]
      if (moduleId) {
        crumbs.push({ label: `Module ${moduleId.replace('module-', '')}` })
      }
    }

    if (skill === 'speaking' && parts.includes('history')) {
      crumbs.splice(2)
      crumbs.push({ label: 'Lịch sử hội thoại', href: '/main/practice-center/speaking/history' })
      const conversationId = parts[parts.indexOf('history') + 1]
      if (conversationId) {
        crumbs.push({ label: 'Chi tiết hội thoại' })
      }
    }

    return crumbs
  }

  if (pathname.startsWith('/main/review-center')) {
    return [{ label: 'Trung tâm ôn luyện' }]
  }

  return [{ label: 'English Academy' }]
}

export default function DashboardTopBar() {
  const pathname = usePathname() || '/'
  const crumbs = useMemo(() => buildCrumbs(pathname), [pathname])
  const shouldHideBreadcrumb = pathname === '/main/homepage' || pathname === '/main/practice-center'
  const canGoBack = !shouldHideBreadcrumb
  const backHref = [...crumbs.slice(0, -1)].reverse().find((crumb) => crumb.href)?.href ?? '/main/homepage'

  return (
    <header className="bg-surface/90 dark:bg-inverse-surface/90 backdrop-blur-md sticky top-0 z-40 flex min-h-16 items-center w-full px-container-margin py-3 border-b border-outline-variant/60">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {canGoBack ? (
          <Link
            href={backHref}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container"
            aria-label="Quay lại"
          >
            <span className="material-symbols-outlined">arrow_back</span>
          </Link>
        ) : null}

        {!shouldHideBreadcrumb ? (
          <nav className="flex min-w-0 items-center gap-2 text-sm text-on-surface-variant" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => {
              const isLast = index === crumbs.length - 1
              return (
                <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-2">
                  {crumb.href && !isLast ? (
                    <a className="truncate hover:text-primary" href={crumb.href}>
                      {crumb.label}
                    </a>
                  ) : (
                    <span className={isLast ? 'truncate font-semibold text-primary' : 'truncate'}>{crumb.label}</span>
                  )}
                  {!isLast ? <span className="text-outline">›</span> : null}
                </span>
              )
            })}
          </nav>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container" aria-label="Thông báo">
          <span className="material-symbols-outlined">notifications</span>
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-error ring-2 ring-surface" />
        </button>
        <button className="flex h-10 w-10 items-center justify-center rounded-full text-on-surface-variant transition-colors hover:bg-surface-container" aria-label="Cài đặt">
          <span className="material-symbols-outlined">settings</span>
        </button>
      </div>
    </header>
  )
}
